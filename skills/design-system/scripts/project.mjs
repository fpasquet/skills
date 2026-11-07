/**
 * Repérage d'une application et de son design system, partagé par les scripts du skill.
 *
 * Point de départ : le dossier de l'application (celui de `components.json` ou de `package.json`). Les chemins se
 * déduisent de `components.json` (alias de shadcn/ui, feuille d'entrée de Tailwind), de `tsconfig.json` (alias `@/`)
 * et des `@import` de la feuille d'entrée ; une option de la ligne de commande les remplace.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const SKIPPED_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  'generated',
  '.features-gen',
  'playwright-report',
  'test-results',
]);

export const read = (file) => (file && existsSync(file) ? readFileSync(file, 'utf8') : '');

/** JSON avec commentaires et virgules finales (tsconfig.json). */
export function readJsonc(file) {
  const text = read(file);
  if (!text) return null;
  try {
    return JSON.parse(
      text
        .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, string) => string ?? '')
        .replace(/,(\s*[}\]])/g, '$1'),
    );
  } catch {
    return null;
  }
}

/** Fichiers sous `dir` dont l'extension est dans `extensions`, sans les dossiers construits. */
export function walk(dir, extensions) {
  const files = [];
  if (!existsSync(dir)) return files;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files; // dossier illisible (données d'un conteneur…)
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.storybook') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files.push(...walk(path, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) files.push(path);
  }
  return files;
}

/** Racine du dépôt : le premier dossier parent qui contient .git ou pnpm-workspace.yaml. */
export function repoRoot(dir) {
  let current = resolve(dir);
  while (current !== dirname(current)) {
    if (existsSync(join(current, '.git')) || existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  return resolve(dir);
}

/** Chemin du fichier d'un paquet visible depuis `fromDir` (`@acme/ui/global.css`), par son champ exports. */
export function resolvePackageFile(fromDir, spec) {
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const sub = parts.slice(spec.startsWith('@') ? 2 : 1).join('/');
  let dir = resolve(fromDir);
  while (dir !== dirname(dir)) {
    const pkgDir = join(dir, 'node_modules', name);
    const pkg = readJsonc(join(pkgDir, 'package.json'));
    if (pkg) {
      const exported = exportTarget(pkg.exports, sub);
      const path = exported ?? (sub ? `./${sub}` : null);
      return path && existsSync(join(pkgDir, path)) ? realpathSync(join(pkgDir, path)) : null;
    }
    dir = dirname(dir);
  }
  return null;
}

/** Cible du champ exports pour un sous-chemin (`components/button`), motifs `./components/*` compris. */
function exportTarget(exportsField, sub) {
  if (!exportsField || typeof exportsField !== 'object') return null;
  const pick = (value) => (typeof value === 'string' ? value : (value?.import ?? value?.default ?? null));
  const key = sub ? `./${sub}` : '.';
  if (exportsField[key]) return pick(exportsField[key]);
  for (const [pattern, value] of Object.entries(exportsField)) {
    const star = pattern.indexOf('*');
    if (star < 0 || !key.startsWith(pattern.slice(0, star)) || !key.endsWith(pattern.slice(star + 1))) continue;
    const middle = key.slice(star, key.length - (pattern.length - star - 1));
    return pick(value)?.replace('*', middle) ?? null;
  }
  return null;
}

/** Feuilles importées par une feuille CSS (`@import '...'`), en chemins absolus, paquets du dépôt compris. */
export function cssImports(file) {
  const imports = [];
  for (const match of read(file).matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) imports.push(resolve(dirname(file), match[1]));
    else if (!/^(tailwindcss|tw-animate-css)$/.test(match[1]) && /^(@[\w.-]+\/)?[\w.-]+\/.+\.css$/.test(match[1])) {
      const target = resolvePackageFile(dirname(file), match[1]);
      // Seuls les paquets du dépôt (lien symbolique hors de node_modules) portent un design system
      if (target && !target.includes(`${sep}node_modules${sep}`)) imports.push(target);
    }
  }
  return imports;
}

/**
 * Dossier désigné par un alias de components.json qui commence par le nom du paquet (`@acme/ui/components`,
 * design system rangé dans un paquet du monorepo) : déduit du champ exports, sinon `src/<suite>`.
 */
function fromPackageAlias(root, pkg, alias) {
  if (!pkg.name || !alias?.startsWith(`${pkg.name}/`)) return null;
  const sub = alias.slice(pkg.name.length + 1);
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    const target = typeof value === 'string' ? value : (value?.import ?? value?.default);
    if (!target || !key.startsWith(`./${sub}/`)) continue;
    const rest = key.slice(sub.length + 3).replace('*', '');
    const at = target.lastIndexOf(rest.split('/')[0]);
    if (at > 0) return resolve(root, target.slice(0, at));
  }
  return existsSync(join(root, 'src', sub)) ? join(root, 'src', sub) : join(root, sub);
}

const hasThemeColors = (css) => /@theme\b[^{]*\{[\s\S]*?--color-[\w-]+\s*:/.test(css);
const SHADCN_VARIABLES = /^\s*--(background|card|popover|primary-foreground)\s*:/m;

/**
 * Feuille d'entrée hors des emplacements habituels (`src/styles.css` d'une application Vite) : la feuille qui importe
 * Tailwind, ou celle qui l'importe à son tour (l'application importe la feuille la plus haute).
 */
function findEntry(src) {
  const sheets = walk(src, ['.css']);
  let entry = sheets.find((file) => /@import\s+['"]tailwindcss['"]/.test(read(file)));
  for (let depth = 0; entry && depth < 3; depth++) {
    const parent = sheets.find((file) => cssImports(file).includes(entry));
    if (!parent) break;
    entry = parent;
  }
  return entry ?? null;
}

/**
 * Chemins du design system de l'application. `overrides` vient de la ligne de commande
 * (`--src`, `--ui`, `--components`, `--layouts`, `--entry`, `--tokens`, `--styles`, `--docs`).
 */
export function detectProject(appDir, overrides = {}) {
  const root = resolve(appDir);
  const componentsJson = readJsonc(join(root, 'components.json'));
  const tsconfig = readJsonc(join(root, 'tsconfig.json'));
  const pkg = readJsonc(join(root, 'package.json')) ?? {};
  const deps = { ...pkg.peerDependencies, ...pkg.dependencies, ...pkg.devDependencies };

  // Alias « @/… » de tsconfig (le plus courant : "@/*": ["./src/*"])
  const paths = tsconfig?.compilerOptions?.paths ?? {};
  const aliasTarget = (paths['@/*']?.[0] ?? (existsSync(join(root, 'src')) ? './src/*' : './*')).replace(/\*$/, '');
  const fromAlias = (alias) =>
    alias?.startsWith('@/') ? join(root, aliasTarget, alias.slice(2)) : fromPackageAlias(root, pkg, alias);
  const option = (name) => (overrides[name] ? resolve(root, overrides[name]) : null);

  const src = option('src') ?? (existsSync(join(root, 'src')) ? join(root, 'src') : root);
  const ui = option('ui') ?? fromAlias(componentsJson?.aliases?.ui) ?? join(src, 'shared', 'ui');
  const components = option('components') ?? fromAlias(componentsJson?.aliases?.components) ?? join(src, 'shared', 'components');
  const layouts = option('layouts') ?? join(dirname(ui), 'layouts');

  const entryCandidates = [
    componentsJson?.tailwind?.css && join(root, componentsJson.tailwind.css),
    join(src, 'app', 'globals.css'),
    join(root, 'app', 'globals.css'),
    join(src, 'index.css'),
    join(src, 'styles', 'globals.css'),
    join(src, 'globals.css'),
  ].filter(Boolean);
  const entry = option('entry') ?? entryCandidates.find((file) => existsSync(file)) ?? findEntry(src);

  // Les feuilles importées par l'entrée, sur trois niveaux : tokens, thème, classes
  const sheets = [];
  for (let level = entry ? [entry] : [], depth = 0; level.length && depth < 3; depth++) {
    level = level.flatMap((file) => cssImports(file)).filter((file) => existsSync(file) && !sheets.includes(file));
    sheets.push(...level);
  }
  const byName = (name) => sheets.find((file) => file.endsWith(`/${name}`)) ?? null;

  const theme = byName('theme.css');
  // Tokens rangés dans theme.css, sans variables de shadcn : design system maison, à séparer du thème (étape 2)
  const tokensInTheme = Boolean(theme && hasThemeColors(read(theme)) && !SHADCN_VARIABLES.test(read(theme)));
  const tokens =
    option('tokens') ??
    byName('tokens.css') ??
    sheets.find((file) => hasThemeColors(read(file)) && !file.endsWith('/theme.css')) ??
    (tokensInTheme ? theme : null) ??
    (entry && hasThemeColors(read(entry)) ? entry : null);
  const componentsCss = byName('components.css');
  const styles = option('styles') ?? (theme ? dirname(theme) : join(src, 'styles'));
  const docs = option('docs') ?? join(src, 'design-system');

  // Application qui consomme le design system d'un paquet du dépôt (`@import '@acme/ui/global.css'`)
  const repo = repoRoot(root);
  const packageDir = (file) => {
    for (let dir = dirname(file); dir.startsWith(repo) && dir !== repo; dir = dirname(dir)) {
      if (existsSync(join(dir, 'package.json'))) return existsSync(join(dir, 'components.json')) ? dir : null;
    }
    return null;
  };
  const designSystemPackage = componentsJson ? null : (sheets.map((file) => !file.startsWith(root + sep) && packageDir(file)).find(Boolean) ?? null);
  const daisyui = detectDaisyui(root, [entry, ...sheets].filter(Boolean), deps);

  return {
    root,
    repo,
    designSystemPackage,
    src,
    ui,
    components,
    layouts,
    entry,
    tokens,
    tokensInTheme: tokens === theme && tokensInTheme,
    theme,
    componentsCss,
    styles,
    docs,
    storybook: existsSync(join(root, '.storybook')) ? join(root, '.storybook') : null,
    componentsJson,
    deps,
    // Primitives des composants : Base UI (style « base-* » de components.json, ou paquet installé), sinon Radix
    primitives:
      componentsJson?.style?.startsWith('base-') || (!componentsJson?.style && (deps['@base-ui/react'] || deps['@base-ui-components/react'])) ? 'base' : 'radix',
    // Dépendance de pair seulement (bibliothèque de composants qui accepte `next` sans en dépendre)
    peerOnly: (name) => Boolean(pkg.peerDependencies?.[name] && !pkg.dependencies?.[name] && !pkg.devDependencies?.[name]),
    // Import de `cn` : le paquet officiel `cn` de shadcn s'il est installé, sinon l'alias utils de components.json
    cnImport: deps.cn ? 'cn' : (componentsJson?.aliases?.utils ?? '@/lib/utils'),
    // Classes sémantiques : celles de daisyUI quand une feuille déclare son greffon, sinon celles du projet (à la
    // daisyUI). Le paquet seul ne génère aucune classe : il ne change pas le mode
    daisyui,
    classes: overrides.classes ?? (daisyui?.plugin ? 'daisyui' : 'own'),
  };
}

// ---------- daisyUI ----------

/** Dossier d'un paquet installé, cherché dans les node_modules de `fromDir` et de ses parents (monorepo). */
export function packageDirOf(fromDir, name) {
  for (let dir = resolve(fromDir); dir !== dirname(dir); dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

/** Déclarations `nom: valeur;` d'un bloc, avec leur ligne dans la feuille. */
function blockDeclarations(css, bodyStart, body) {
  const declarations = [];
  for (const m of body.matchAll(/([\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) {
    declarations.push({ name: m[1], value: m[2].trim(), line: css.slice(0, bodyStart + m.index).split('\n').length });
  }
  return declarations;
}

/**
 * Blocs de daisyUI d'une feuille : `@plugin "daisyui" { … }` (options : thèmes intégrés, préfixe) et chaque
 * `@plugin "daisyui/theme" { … }` (nom, défaut, variables).
 */
export function daisyuiBlocks(file) {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const plugins = [];
  for (const m of css.matchAll(/@plugin\s+(['"])daisyui\1\s*(?:;|\{([^}]*)\})/g)) {
    const options = Object.fromEntries(blockDeclarations(css, 0, m[2] ?? '').map((d) => [d.name, d.value.replace(/^['"]|['"]$/g, '')]));
    plugins.push({ file, line: css.slice(0, m.index).split('\n').length, options });
  }
  const themes = [];
  for (const m of css.matchAll(/@plugin\s+(['"])daisyui\/theme\1\s*\{([^}]*)\}/g)) {
    const bodyStart = m.index + m[0].indexOf('{') + 1;
    const declarations = blockDeclarations(css, bodyStart, m[2]);
    const option = (name) => declarations.find((d) => d.name === name)?.value.replace(/^['"]|['"]$/g, '');
    themes.push({
      file,
      line: css.slice(0, m.index).split('\n').length,
      name: option('name') ?? 'custom-theme',
      isDefault: option('default') === 'true',
      prefersdark: option('prefersdark') === 'true',
      variables: declarations.filter((d) => d.name.startsWith('--')),
    });
  }
  return { plugins, themes };
}

/**
 * daisyUI dans l'application : greffon déclaré dans une feuille (`@plugin "daisyui"`) ou paquet installé. Les thèmes
 * intégrés (light et dark par défaut) sont dans la couche base, qui l'emporte sur la couche theme des tokens : ils
 * écrasent `--color-primary` et les autres couleurs de même nom.
 */
function detectDaisyui(root, sheets, deps) {
  const blocks = sheets.map(daisyuiBlocks);
  const plugin = blocks.flatMap((b) => b.plugins)[0] ?? null;
  if (!plugin && !deps.daisyui) return null;
  const dir = packageDirOf(root, 'daisyui');
  const version = (dir && readJsonc(join(dir, 'package.json'))?.version) ?? deps.daisyui?.replace(/^[^\d]*/, '') ?? null;
  const themesOption = plugin?.options.themes;
  // Sans option, daisyUI pose light (défaut) et dark (préférence du système) ; sans greffon déclaré, aucun thème
  const builtinThemes = !plugin
    ? []
    : themesOption === undefined
      ? ['light', 'dark']
      : themesOption === 'false'
        ? []
        : themesOption === 'all'
          ? ['all']
          : themesOption.split(',').map((t) => t.trim().split(/\s+/)[0]).filter(Boolean);
  return {
    version,
    dir,
    plugin,
    prefix: plugin?.options.prefix ?? '',
    builtinThemes,
    themes: blocks.flatMap((b) => b.themes),
  };
}

// Variables qu'un thème daisyUI doit donner quand les thèmes intégrés sont coupés : sans elles, les composants perdent
// leurs couleurs ou leurs bordures (var() sans valeur de repli)
export const DAISYUI_THEME_VARIABLES = [
  ...['base-100', 'base-200', 'base-300', 'base-content'],
  ...['primary', 'secondary', 'accent', 'neutral', 'info', 'success', 'warning', 'error'].flatMap((c) => [c, `${c}-content`]),
].map((name) => `--color-${name}`).concat(['--radius-selector', '--radius-field', '--radius-box', '--size-selector', '--size-field', '--border', '--depth', '--noise']);

// Racines des classes de daisyUI 5, quand le paquet n'est pas installé (dossier components/ du paquet)
const DAISYUI_ROOTS = [
  'alert', 'aura', 'avatar', 'badge', 'breadcrumbs', 'btn', 'calendar', 'card', 'carousel', 'chat', 'checkbox', 'collapse',
  'countdown', 'diff', 'divider', 'dock', 'drawer', 'dropdown', 'fab', 'fieldset', 'file-input', 'filter', 'footer', 'glass',
  'hero', 'hover-3d', 'hover-gallery', 'indicator', 'input', 'join', 'kbd', 'label', 'link', 'list', 'loading', 'mask', 'menu',
  'mockup', 'modal', 'navbar', 'otp', 'progress', 'radial-progress', 'radio', 'range', 'rating', 'select', 'skeleton', 'stack',
  'stat', 'stats', 'status', 'steps', 'swap', 'tab', 'tabs', 'table', 'textarea', 'text-rotate', 'timeline', 'toast', 'toggle',
  'tooltip', 'validator',
];

/**
 * Classes de daisyUI, lues dans les feuilles du paquet installé (components/, utilities/), avec son préfixe éventuel ;
 * et la sous-couche de la règle de base de chaque classe (`daisyui.l1.l2.l3` en 5.x), la plus basse : ses modificateurs
 * (`btn-sm`, `btn-primary`) sont dans des sous-couches au-dessus. Sans le paquet : les racines connues, et toute classe
 * `<racine>-…` comptée comme une classe de daisyUI.
 */
export function daisyuiCatalog(project) {
  const prefix = project.daisyui?.prefix ?? '';
  const classes = new Set();
  // Première sous-couche de chaque feuille de composant : celle de sa règle de base
  const firstLayers = new Map();
  const dir = project.daisyui?.dir;
  const sheets = dir ? ['components', 'utilities'].flatMap((sub) => (isDir(join(dir, sub)) ? readdirSync(join(dir, sub)).filter((f) => f.endsWith('.css')).map((f) => join(dir, sub, f)) : [])) : [];
  for (const file of sheets) {
    const css = read(file);
    const first = css.match(/@layer\s+(daisyui[\w.]*)\s*\{/)?.[1];
    if (first && file.includes(`${sep}components${sep}`)) firstLayers.set(first, (firstLayers.get(first) ?? 0) + 1);
    // Feuille à plat (règles imbriquées par &) : chaque bloc le plus intérieur, avec le sélecteur qui le précède
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      // Le sélecteur suit la dernière déclaration du bloc parent (règle imbriquée : `…;&:hover{`)
      const selector = m[1].split(';').pop().trim();
      // Classes de base, sans les variantes de point de rupture que daisyUI génère (.sm\:btn) ni les décimales (.75rem)
      // ni les noms de ses sous-couches (@layer daisyui.l1.l2)
      if (selector.startsWith('@')) continue;
      // Classes d'état génériques des bibliothèques de calendrier que daisyUI met en forme (is-disabled, is-hidden) : un
      // projet peut les employer pour lui
      for (const c of selector.matchAll(/\.((?:\\.|[\w-])+)/g)) if (/^[a-z][\w-]*$/.test(c[1]) && !/^(l\d|is-[\w-]+)$/.test(c[1])) classes.add(`${prefix}${c[1]}`);
    }
  }
  const roots = new Set(DAISYUI_ROOTS.map((r) => `${prefix}${r}`));
  const has = classes.size
    ? (name) => classes.has(name)
    : (name) => [...roots].some((r) => name === r || name.startsWith(`${r}-`));
  const baseLayer = [...firstLayers].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'daisyui.l1.l2.l3';
  return { classes, roots, has, baseLayer, installed: Boolean(classes.size) };
}

/** Chemin lisible, relatif au dossier de l'application. */
export const rel = (project, file) => (file ? relative(project.root, file) || '.' : '—');

/** Dossier existant ? */
export const isDir = (path) => existsSync(path) && statSync(path).isDirectory();

/** Options `--nom valeur` et drapeaux `--nom` de la ligne de commande. */
export function parseArgs(argv, flags = []) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) positional.push(arg);
    else if (flags.includes(arg.slice(2))) options[arg.slice(2)] = true;
    else options[arg.slice(2)] = argv[++i];
  }
  return { options, positional };
}

/** kebab-case d'un nom de composant : DialogContent → dialog-content. */
export const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

/** PascalCase d'un nom de dossier : dropdown-menu → DropdownMenu. */
export const pascal = (name) => name.replace(/(^|[-_/])([a-z0-9])/g, (_, __, char) => char.toUpperCase());

/**
 * Texte de la configuration ESLint de l'application et des configurations partagées qu'elle importe (fichiers
 * relatifs, paquets du dépôt résolus par leur champ exports), pour savoir quelles règles s'appliquent.
 */
export function lintConfigText(project) {
  const seen = new Set();
  const queue = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.ts', 'eslint.config.cjs'].map((f) => join(project.root, f)).filter(existsSync);
  let text = '';
  while (queue.length && seen.size < 12) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const content = read(file);
    text += content;
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      let target = null;
      if (spec.startsWith('.')) target = resolve(dirname(file), spec);
      else if (!/eslint-plugin|eslint-config|typescript-eslint|^@eslint\/|^globals$/.test(spec)) {
        const parts = spec.split('/');
        const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
        const sub = `./${parts.slice(spec.startsWith('@') ? 2 : 1).join('/')}`;
        const pkgDir = join(project.root, 'node_modules', name);
        const pkg = readJsonc(join(pkgDir, 'package.json'));
        const exported = pkg?.exports?.[sub === './' ? '.' : sub];
        const path = typeof exported === 'string' ? exported : (exported?.import ?? exported?.default);
        if (path) target = join(pkgDir, path);
      }
      if (target && existsSync(target)) queue.push(target);
    }
  }
  return text;
}

/**
 * Réécrit une classe de shadcn ou de daisyUI avec les tokens : couleurs d'après les variables de theme.css
 * (`--card: var(--color-surface)` : bg-card → bg-surface) et du thème daisyUI (`--color-base-100: var(--color-surface)` :
 * bg-base-100 → bg-surface), ombres et rayons vers les tokens qui existent. Un nom qui est
 * aussi un token (`muted`, `primary`) garde son sens de token, sauf en fond (bg-muted) : la réécriture peut être
 * relancée sans dommage.
 */
export function shadcnTokenizer(project) {
  const themeCss = read(project.theme);
  const tokensCss = read(project.tokens);
  const rootBlock = themeCss.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  const hasToken = (name) => new RegExp(`--${name}\\s*:`).test(tokensCss);
  // Thème daisyUI pointé sur les tokens (--color-base-100: var(--color-surface)) : bg-base-100 → bg-surface
  const daisyuiVariables = (project.daisyui?.themes ?? []).filter((t) => t.isDefault || project.daisyui.themes.length === 1).flatMap((t) => t.variables);
  const daisyuiColors = daisyuiVariables.map((v) => [v.name.match(/^--color-([\w-]+)$/)?.[1], v.value.match(/^var\(--color-([\w-]+)\)$/)?.[1]]).filter(([from, to]) => from && to);
  // Couleur de shadcn pointée sur un token dans @theme inline (mode daisyUI : --color-border: var(--color-line), --border
  // étant l'épaisseur des bordures de daisyUI)
  const inlineBlock = themeCss.match(/@theme\s+inline\s*\{([^}]*)\}/)?.[1] ?? '';
  const themeColors = [
    ...[...rootBlock.matchAll(/--([\w-]+)\s*:\s*var\(--color-([\w-]+)\)/g)].map((m) => [m[1], m[2]]),
    ...[...inlineBlock.matchAll(/--color-([\w-]+)\s*:\s*var\(--color-([\w-]+)\)/g)].map((m) => [m[1], m[2]]),
    ...daisyuiColors,
  ].filter(([from, to]) => from !== to);
  const colorMap = new Map(themeColors.filter(([from]) => !hasToken(`color-${from}`)));
  // Nom de shadcn qui est aussi un token d'un autre rôle : `muted` est un fond chez shadcn (--muted: surface-alt), le
  // texte secondaire dans les tokens. En fond, il suit le thème (bg-muted → bg-surface-alt) ; en texte, il reste le token
  const backgroundMap = new Map(themeColors.filter(([from]) => hasToken(`color-${from}`)));
  const SCALE_MAP = [
    [/^shadow-(2xs|xs|sm)$/, 'shadow-card', 'shadow-card'],
    [/^shadow(-md|-lg|-xl|-2xl)?$/, 'shadow-overlay', 'shadow-overlay'],
    [/^rounded-md$/, 'rounded-control', 'radius-control'],
    // Rayons de daisyUI pointés sur les tokens (--radius-box: var(--radius-card)) : rounded-box → rounded-card
    ...daisyuiVariables
      .map((v) => [v.name.match(/^--radius-(box|field|selector)$/)?.[1], v.value.match(/^var\(--radius-([\w-]+)\)$/)?.[1]])
      .filter(([from, to]) => from && to)
      .map(([from, to]) => [new RegExp(`^rounded-${from}$`), `rounded-${to}`, `radius-${to}`]),
  ];
  let count = 0;
  const toTokens = (utility) => {
    const parts = utility.split(':');
    let last = parts.pop();
    const important = last.startsWith('!') ? '!' : '';
    last = last.replace(/^!/, '');
    const match = last.match(/^(-?)(bg|text|border(?:-[trblxyse])?|ring|ring-offset|fill|stroke|outline|divide|from|via|to|placeholder|decoration|caret|accent)-([\w-]+?)(\/\d+)?$/);
    let changed = false;
    const mapped = match && (colorMap.get(match[3]) ?? (match[2] === 'bg' ? backgroundMap.get(match[3]) : undefined));
    if (mapped) {
      last = `${match[1]}${match[2]}-${mapped}${match[4] ?? ''}`;
      changed = true;
    } else {
      const scale = SCALE_MAP.find(([pattern, , token]) => pattern.test(last) && hasToken(token));
      if (scale) {
        last = scale[1];
        changed = true;
      }
    }
    if (changed) count++;
    return [...parts, `${important}${last}`].join(':');
  };
  return { toTokens, count: () => count };
}

/**
 * Échelles restreintes : une famille remise à zéro dans les tokens (`--spacing-*: initial`) ne garde que les pas
 * redéclarés (tokens et thème). Renvoie la famille d'un utilitaire hors de l'échelle (`p-5` → `spacing`), sinon null.
 */
export function scaleChecker(project) {
  const css = `${read(project.tokens)}\n${read(project.theme)}`;
  const reset = (family) => new RegExp(`--${family}-\\*\\s*:\\s*initial`).test(css);
  const declared = (family) => new Set([...css.matchAll(new RegExp(`--${family}-([\\w\\\\.-]+?)\\s*:`, 'g'))].map((m) => m[1].replace('\\.', '.')));
  const families = Object.fromEntries(['spacing', 'text', 'radius', 'shadow'].filter(reset).map((family) => [family, declared(family)]));
  const SPACING = /^-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|w|h|size|min-w|min-h|max-w|max-h|inset(?:-[xy])?|top|left|right|bottom|start|end|translate-[xy]|scroll-[mp][xytrblse]?|basis|indent)-(\d+(?:\.\d+)?|px)$/;
  const TEXT = /^text-(xs|sm|base|lg|xl|\dxl)$/;
  // rounded sans suffixe : la clé implicite de la famille, retirée elle aussi par la remise à zéro
  const RADIUS = /^rounded(?:-[trblse]{1,2})?(?:-(xs|sm|md|lg|xl|\dxl))?$/;
  const SHADOW = /^shadow-(2xs|xs|sm|md|lg|xl|2xl)$/;
  return (utility) => {
    const base = utility.split(':').pop().replace(/^!/, '');
    const check = (family, pattern, group) => {
      const m = families[family] && base.match(pattern);
      return m && !families[family].has(m[group] ?? 'DEFAULT') ? family : null;
    };
    return check('spacing', SPACING, 1) ?? check('text', TEXT, 1) ?? check('radius', RADIUS, 1) ?? check('shadow', SHADOW, 1);
  };
}

// ---------- Tokens copiés depuis les specs ----------
// Les specs (skill specs-ui) vivent dans un dépôt à part : l'application en garde une copie, précédée d'un en-tête
// de provenance, qu'on ne modifie jamais à la main.

/** Fichier de tokens d'un projet de specs : son dossier (`<projet>/ui`) ou le fichier lui-même. */
export function specsTokensFile(path) {
  const file = resolve(path);
  return isDir(file) ? join(file, 'tokens.css') : file;
}

/** Fichier de tokens qui appartient à un projet de specs (à côté de `sources/site.json`). */
export const isSpecsTokens = (file) => Boolean(file) && existsSync(join(dirname(file), 'sources', 'site.json'));

/** Empreinte du contenu, insensible à la mise en forme (espaces, guillemets) qu'un formateur peut changer. */
export const tokensHash = (text) =>
  createHash('sha256')
    .update(text.replace(/\s+/g, '').replaceAll("'", '"'))
    .digest('hex')
    .slice(0, 16);

/** Provenance lisible : dépôt git (owner/repo, d'après origin) et chemin dans ce dépôt, sinon le nom du fichier. */
export function sourceLabel(file) {
  const git = (...args) => {
    try {
      return execFileSync('git', ['-C', dirname(file), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  const top = git('rev-parse', '--show-toplevel');
  if (!top) return file.split(sep).slice(-3).join('/');
  // Deux derniers segments de l'URL : ni identifiants ni hôte
  const remote = git('remote', 'get-url', 'origin')?.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).slice(-2).join('/');
  const path = relative(top, file).split(sep).join('/');
  return `${remote || top.split(sep).at(-1)} · ${path}`;
}

/** Contenu de la copie : en-tête de provenance, puis le fichier des specs tel quel. */
export function tokensCopy(sourceFile) {
  const text = read(sourceFile);
  return `/*\n * Copie des tokens des specs (skill specs-ui) : ne pas modifier ici.\n * Une couleur, une police ou un rayon se change dans les specs, puis tokens.mjs (skill design-system) recopie ce fichier.\n * Source : ${sourceLabel(sourceFile)} · sha256:${tokensHash(text)}\n */\n${text}`;
}

/** En-tête d'une copie : { source, hash, body, edited }, ou null si le fichier n'est pas une copie des specs. */
export function parseTokensCopy(text) {
  const match = text.match(/^\/\*\s*\n\s*\* Copie des tokens des specs[\s\S]*?\* Source : (.+?) · sha256:([0-9a-f]{16})\s*\n\s*\*\/\n/);
  if (!match) return null;
  const body = text.slice(match[0].length);
  return { source: match[1], hash: match[2], body, edited: tokensHash(body) !== match[2] };
}

/** Noms des tokens déclarés (`--color-surface`…), hors blocs remis à zéro (`--spacing-*`). */
export const tokenNames = (css) => new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));


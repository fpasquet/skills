/**
 * Repérage d'une application et de son design system, partagé par les scripts du skill.
 *
 * Point de départ : le dossier de l'application (celui de `components.json` ou de `package.json`). Les chemins se
 * déduisent de `components.json` (alias de shadcn/ui, feuille d'entrée de Tailwind), de `tsconfig.json` (alias `@/`)
 * et des `@import` de la feuille d'entrée ; une option de la ligne de commande les remplace.
 */
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
  const entry = option('entry') ?? entryCandidates.find((file) => existsSync(file)) ?? null;

  // Les feuilles importées par l'entrée, sur deux niveaux : tokens, thème, classes
  const imported = entry ? cssImports(entry) : [];
  const nested = imported.flatMap((file) => cssImports(file));
  const sheets = [...imported, ...nested].filter((file) => existsSync(file));
  const byName = (name) => sheets.find((file) => file.endsWith(`/${name}`)) ?? null;

  const tokens =
    option('tokens') ??
    byName('tokens.css') ??
    sheets.find((file) => hasThemeColors(read(file)) && !file.endsWith('/theme.css')) ??
    (entry && hasThemeColors(read(entry)) ? entry : null);
  const theme = byName('theme.css');
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
    theme,
    componentsCss,
    styles,
    docs,
    storybook: existsSync(join(root, '.storybook')) ? join(root, '.storybook') : null,
    componentsJson,
    deps,
    // Dépendance de pair seulement (bibliothèque de composants qui accepte `next` sans en dépendre)
    peerOnly: (name) => Boolean(pkg.peerDependencies?.[name] && !pkg.dependencies?.[name] && !pkg.devDependencies?.[name]),
    // Import de `cn` : le paquet officiel `cn` de shadcn s'il est installé, sinon l'alias utils de components.json
    cnImport: deps.cn ? 'cn' : (componentsJson?.aliases?.utils ?? '@/lib/utils'),
  };
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
 * Réécrit une classe de shadcn avec les tokens : couleurs d'après les variables de theme.css
 * (`--card: var(--color-surface)` : bg-card → bg-surface), ombres et rayons vers les tokens qui existent. Un nom qui est
 * aussi un token (`muted`, `primary`) garde son sens de token, sauf en fond (bg-muted) : la réécriture peut être
 * relancée sans dommage.
 */
export function shadcnTokenizer(project) {
  const themeCss = read(project.theme);
  const tokensCss = read(project.tokens);
  const rootBlock = themeCss.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  const hasToken = (name) => new RegExp(`--${name}\\s*:`).test(tokensCss);
  const themeColors = [...rootBlock.matchAll(/--([\w-]+)\s*:\s*var\(--color-([\w-]+)\)/g)].map((m) => [m[1], m[2]]).filter(([from, to]) => from !== to);
  const colorMap = new Map(themeColors.filter(([from]) => !hasToken(`color-${from}`)));
  // Nom de shadcn qui est aussi un token d'un autre rôle : `muted` est un fond chez shadcn (--muted: surface-alt), le
  // texte secondaire dans les tokens. En fond, il suit le thème (bg-muted → bg-surface-alt) ; en texte, il reste le token
  const backgroundMap = new Map(themeColors.filter(([from]) => hasToken(`color-${from}`)));
  const SCALE_MAP = [
    [/^shadow-(2xs|xs|sm)$/, 'shadow-card', 'shadow-card'],
    [/^shadow(-md|-lg|-xl|-2xl)?$/, 'shadow-overlay', 'shadow-overlay'],
    [/^rounded-md$/, 'rounded-control', 'radius-control'],
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

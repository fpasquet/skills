/**
 * Repérage d'une application et de son design system, partagé par les scripts du skill.
 *
 * Point de départ : le dossier de l'application (celui de `components.json` ou de `package.json`). Les chemins se
 * déduisent de `components.json` (alias de shadcn/ui, feuille d'entrée de Tailwind), de `tsconfig.json` (alias `@/`)
 * et des `@import` de la feuille d'entrée ; une option de la ligne de commande les remplace.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

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

export const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

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
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
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

/** Feuilles importées par une feuille CSS (`@import '...'`), en chemins absolus, sans les paquets. */
export function cssImports(file) {
  const imports = [];
  for (const match of read(file).matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    imports.push(resolve(dirname(file), match[1]));
  }
  return imports;
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
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Alias « @/… » de tsconfig (le plus courant : "@/*": ["./src/*"])
  const paths = tsconfig?.compilerOptions?.paths ?? {};
  const aliasTarget = (paths['@/*']?.[0] ?? (existsSync(join(root, 'src')) ? './src/*' : './*')).replace(/\*$/, '');
  const fromAlias = (alias) => (alias?.startsWith('@/') ? join(root, aliasTarget, alias.slice(2)) : null);
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

  return {
    root,
    repo: repoRoot(root),
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

#!/usr/bin/env node
/**
 * Pose le socle du design system dans une application React + Tailwind v4 : tokens (si l'application n'en a pas),
 * thème shadcn sur les tokens, feuille des classes, Storybook (configuration, pages Introduction, Tokens et
 * Classes), projet vitest des histoires, configuration ESLint, document de conventions et mémoire.
 *
 * Aucun fichier existant n'est écrasé : il est gardé et signalé. Seule la feuille d'entrée est complétée par les
 * @import qui lui manquent. Les dépendances ne sont pas installées : la commande à lancer est affichée.
 *
 * Usage : node scaffold.mjs <app-dir> [--mode create|maintain|migrate] [--tokens <file>] [--rule <file>] [--dry-run]
 *                            [--src …] [--ui …] [--components …] [--entry …] [--styles …] [--docs …]
 *   --tokens  fichier de tokens existant (par défaut : celui que la feuille d'entrée importe, sinon specs/ui/tokens.css
 *             à la racine du dépôt, sinon un nouveau <styles>/tokens.css à remplir)
 *   --rule    où écrire les conventions (par défaut .claude/rules/design-system.md si le dépôt a .claude/rules/,
 *             sinon docs/design-system.md)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectProject, isDir, lintConfigText, parseArgs, read, rel } from './project.mjs';

const { options, positional } = parseArgs(process.argv.slice(2), ['dry-run']);
if (!positional[0] || !isDir(positional[0])) {
  console.error('Usage: node scaffold.mjs <app-dir> [--mode create|maintain|migrate] [--tokens <file>] [--rule <file>] [--dry-run]');
  process.exit(2);
}
const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const template = (path) => readFileSync(join(templates, path), 'utf8');
const versions = JSON.parse(template('versions.json'));
const project = detectProject(positional[0], options);
const dry = options['dry-run'];
const written = [];
const kept = [];
const notes = [];

const posix = (path) => path.split('\\').join('/');
const fromRepo = (path) => posix(relative(project.repo, path)) || '.';
/** Import relatif d'un fichier vers un autre, toujours préfixé (./ ou ../). */
const importPath = (from, to) => {
  const path = posix(relative(dirname(from), to));
  return path.startsWith('.') ? path : `./${path}`;
};
function write(file, content) {
  if (existsSync(file)) {
    kept.push(rel(project, file));
    return false;
  }
  if (!dry) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  written.push(rel(project, file));
  return true;
}
const fill = (text, values) => text.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in values ? values[key] : match));

// ---------- Tokens ----------
const specsTokens = join(project.repo, 'specs', 'ui', 'tokens.css');
// Couleurs déclarées par la feuille d'entrée elle-même (shadcn d'origine) : ce ne sont pas encore des tokens
const tokensInEntry = project.tokens && project.tokens === project.entry;
const tokens = (!tokensInEntry && project.tokens) || (existsSync(specsTokens) ? specsTokens : join(project.styles, 'tokens.css'));
const tokensFromSpecs = tokens === specsTokens;
if (!existsSync(tokens) && write(tokens, template('styles/tokens.css'))) {
  notes.push(
    tokensInEntry
      ? `${rel(project, tokens)}: template values. ${rel(project, project.entry)} declares the colours itself (:root, .dark, @theme inline): move their values into the tokens with the names of references/tokens.md, point the shadcn variables of theme.css at them, then delete them from the entry (step 2).`
      : `${rel(project, tokens)}: template values. Replace them with the colours found by audit.mjs (rule hardcoded-color, palette-class) or the brand.`,
  );
}

// ---------- Thème, classes, utilitaires ----------
const tokensCss = existsSync(tokens) ? read(tokens) : template('styles/tokens.css');
const colorTokens = [...tokensCss.matchAll(/^\s*(--color-[\w-]+)\s*:\s*([^;]+);/gm)];
const darkTokens = colorTokens.map(([, name, value]) => `  /* ${name}: ; clair : ${value.trim()} */`).join('\n');
const theme = project.theme ?? join(project.styles, 'theme.css');
const componentsCss = project.componentsCss ?? join(project.styles, 'components.css');
const values = {
  tokens: fromRepo(tokens),
  ui: fromRepo(project.ui),
  components: fromRepo(project.components),
  layouts: fromRepo(project.layouts),
  styles: fromRepo(project.styles),
  docs: fromRepo(project.docs),
  app: fromRepo(project.root),
  darkTokens,
};
write(theme, fill(template('styles/theme.css'), values));
write(componentsCss, fill(template('styles/components.css'), { ...values, ui: posix(relative(project.root, project.ui)) }));
write(join(dirname(componentsCss), 'utilities.css'), template('styles/utilities.css'));
// Voile des fenêtres et apparition des calques flottants, communs aux composants de Radix
write(join(dirname(componentsCss), 'classes', 'overlay.css'), template('styles/classes/overlay.css'));

// ---------- Feuille d'entrée ----------
// Une bibliothèque qui n'a `next` qu'en dépendance de pair se documente avec Vite
const isNext = Boolean(project.deps.next) && !project.peerOnly('next');
const entry =
  project.entry ??
  (project.componentsJson?.tailwind?.css ? join(project.root, project.componentsJson.tailwind.css) : join(project.src, isNext ? 'app' : '', isNext ? 'globals.css' : 'index.css'));
const wanted = [
  ['tailwindcss', `@import 'tailwindcss';`],
  ['tw-animate-css', `@import 'tw-animate-css';`],
  [tokens, `@import '${importPath(entry, tokens)}';`],
  [theme, `@import '${importPath(entry, theme)}';`],
  [componentsCss, `@import '${importPath(entry, componentsCss)}';`],
];
if (!existsSync(entry)) {
  write(entry, `${wanted.map(([, line]) => line).join('\n')}\n`);
} else {
  const css = read(entry);
  if (/@tailwind\s+(base|components|utilities)/.test(css)) {
    notes.push(`${rel(project, entry)} is a Tailwind v3 entry (@tailwind …): migrate it to v4 first (references/migration.md), then rerun scaffold.mjs.`);
  } else {
    const imported = [...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => (m[1].startsWith('.') ? resolve(dirname(entry), m[1]) : m[1]));
    const missing = wanted.filter(([target]) => !imported.includes(target));
    if (missing.length) {
      // Après le dernier @import existant : l'ordre tailwindcss → tokens → thème → classes est gardé
      const lastImport = [...css.matchAll(/^@import[^\n]*$/gm)].at(-1);
      const at = lastImport ? lastImport.index + lastImport[0].length : 0;
      const block = missing.map(([, line]) => line).join('\n');
      const updated = lastImport ? `${css.slice(0, at)}\n${block}${css.slice(at)}` : `${block}\n${css}`;
      if (!dry) writeFileSync(entry, updated);
      written.push(`${rel(project, entry)} (+ ${missing.map(([target]) => (target.includes('/') ? rel(project, target) : target)).join(', ')})`);
      if (missing.some(([target]) => target === 'tailwindcss') && imported.length) {
        notes.push(`${rel(project, entry)}: @import 'tailwindcss' was missing and has been added after the other imports: move it to the top.`);
      }
    }
  }
}

// ---------- Storybook ----------
const framework = isNext ? '@storybook/nextjs-vite' : '@storybook/react-vite';
const storybookDir = join(project.root, '.storybook');
if (project.storybook) {
  kept.push('.storybook/');
  notes.push('.storybook/ kept: compare it with templates/storybook/ (a11y test "error", storySort, themes, autodocs).');
} else {
  write(join(storybookDir, 'main.ts'), fill(template('storybook/main.ts'), { framework }));
  write(join(storybookDir, 'preview.tsx'), fill(template('storybook/preview.tsx'), { framework, entryImport: importPath(join(storybookDir, 'preview.tsx'), entry) }));
}
const vitestConfig = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.mjs'].map((f) => join(project.root, f)).find(existsSync);
if (vitestConfig) {
  if (!/storybookTest/.test(read(vitestConfig))) notes.push(`${rel(project, vitestConfig)}: add the "stories" project of templates/storybook/vitest.config.ts.`);
} else write(join(project.root, 'vitest.config.ts'), template('storybook/vitest.config.ts'));

// ---------- Pages du design system ----------
const docsValues = { ...values, tokens: fromRepo(tokens), styles: posix(relative(project.root, project.styles)), ui: posix(relative(project.root, project.ui)) };
write(join(project.docs, 'introduction.mdx'), fill(template('docs/introduction.mdx'), docsValues));
write(join(project.docs, 'tokens.mdx'), fill(template('docs/tokens.mdx'), docsValues));
write(join(project.docs, 'classes.mdx'), fill(template('docs/classes.mdx'), docsValues));
write(join(project.docs, 'raw.d.ts'), template('docs/raw.d.ts'));
const tokensTs = join(project.docs, 'tokens', 'tokens.ts');
write(tokensTs, fill(template('docs/tokens/tokens.ts'), { tokensImport: importPath(tokensTs, tokens), themeImport: importPath(tokensTs, theme) }));
write(join(project.docs, 'tokens', 'color-tokens.tsx'), template('docs/tokens/color-tokens.tsx'));
write(join(project.docs, 'tokens', 'scale-tokens.tsx'), template('docs/tokens/scale-tokens.tsx'));

// ---------- ESLint ----------
// La configuration de l'application ou une configuration partagée qu'elle importe a déjà les règles : rien à poser
const lintReady = /better-tailwindcss/.test(lintConfigText(project));
const eslintConfig = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.ts'].map((f) => join(project.root, f)).find(existsSync);
if (!lintReady) {
  write(join(project.root, 'eslint.design-system.mjs'), template('eslint/design-system.mjs'));
  notes.push(
    `ESLint: in ${eslintConfig ? rel(project, eslintConfig) : 'eslint.config.mjs'}, import { designSystem } from './eslint.design-system.mjs' and add ...designSystem({ entryPoint: '${posix(relative(project.root, entry))}'${options.mode === 'migrate' ? ", level: 'warn'" : ''} }).`,
  );
}

// ---------- Conventions et mémoire ----------
const rulesDir = join(project.repo, '.claude', 'rules');
const rule = options.rule ? resolve(options.rule) : isDir(rulesDir) ? join(rulesDir, 'design-system.md') : join(project.repo, 'docs', 'design-system.md');
const memory = join(project.docs, 'DESIGN-SYSTEM.md');
const ruleValues = {
  ...values,
  entry: fromRepo(entry),
  memory: fromRepo(memory),
  cn: project.cnImport === 'cn' ? 'paquet officiel `cn` de shadcn' : `\`${project.cnImport}\``,
  tokensSource: tokensFromSpecs
    ? ' Le fichier est partagé avec les maquettes des specs (skill `specs-ui`) : une couleur, un rayon ou une police se change dans les specs, jamais dans l\'application.'
    : '',
};
let ruleText = fill(template('rule.md'), { ...ruleValues, uiAlias: project.componentsJson?.aliases?.ui ?? '@/…' });
// Composants d'interface et blocs partagés dans le même dossier (paquet de composants d'un monorepo) : une seule mention
const sameDir = project.ui === project.components;
const dedupe = (text) =>
  sameDir
    ? text
        .replace(/\s*\(ou de `[^`]+` s'il assemble plusieurs\s+composants\)/, '')
        .replace(/dans (`[^`]+`) comme dans \1/, 'dans $1')
        .replace(/^\s*- `Shared\/<Composant>` : `[^`]+` ;\n/m, '')
        .replace(/(`[^`]+`), \1 \|/, '$1 |')
    : text;
ruleText = dedupe(ruleText);
if (rule.startsWith(rulesDir)) {
  // Règle de Claude Code : chargée seule quand un fichier de l'interface est ouvert
  const app = fromRepo(project.root);
  ruleText = `---\npaths:\n  - "${app}/src/**"\n  - "${app}/.storybook/**"\n---\n\n${ruleText}`;
}
if (write(rule, ruleText) && !rule.startsWith(rulesDir)) {
  notes.push(`Point to ${fromRepo(rule)} from AGENTS.md (or CLAUDE.md) so that every agent reads it before touching the interface.`);
}
write(
  memory,
  dedupe(fill(template('memory.md'), { ...values, entry: fromRepo(entry), rule: fromRepo(rule), mode: options.mode ?? 'create', date: new Date().toISOString().slice(0, 10) })),
);

// ---------- Dépendances ----------
const lockfile = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'package-lock.json'].find((f) => existsSync(join(project.repo, f)));
const manager = { 'pnpm-lock.yaml': 'pnpm add -E', 'yarn.lock': 'yarn add -E', 'bun.lock': 'bun add -E' }[lockfile] ?? 'npm install -E';
const hasPostcssTailwind = ['postcss.config.mjs', 'postcss.config.js', 'postcss.config.cjs'].some((f) => /@tailwindcss\/postcss/.test(read(join(project.root, f))));
// Déjà fournis sous une autre forme : playwright par @playwright/test, radix-ui par les paquets @radix-ui/react-*,
// cn par la fonction de components.json (aliases.utils), le greffon de lint par une configuration partagée, le
// greffon Vite de Tailwind par une configuration PostCSS (que Vite lit aussi)
const provided = (name) =>
  project.deps[name] ||
  (name === 'playwright' && project.deps['@playwright/test']) ||
  (name === 'radix-ui' && Object.keys(project.deps).some((dep) => dep.startsWith('@radix-ui/react-'))) ||
  (name === 'cn' && project.componentsJson?.aliases?.utils) ||
  (name === 'eslint-plugin-better-tailwindcss' && lintReady) ||
  (name === '@tailwindcss/vite' && hasPostcssTailwind);
const missingDeps = (list) => Object.entries(list).filter(([name]) => !provided(name)).map(([name, version]) => `${name}@${version}`);
const deps = missingDeps(versions.dependencies);
const devDeps = missingDeps({ ...versions.devDependencies, ...versions.framework[isNext ? 'next' : 'vite'] });

// Catalogue pnpm (`catalog:` dans package.json) : les versions s'ajoutent à pnpm-workspace.yaml, pas au paquet
const workspaceYaml = read(join(project.repo, 'pnpm-workspace.yaml'));
const usesCatalog = /"catalog:/.test(read(join(project.root, 'package.json'))) && /^catalog:/m.test(workspaceYaml);
const catalogBlock = workspaceYaml.match(/^catalog:\n((?:[ \t]+[^\n]*\n?)*)/m)?.[1] ?? '';
const catalog = Object.fromEntries(
  [...catalogBlock.matchAll(/^\s+'?([^':\s]+)'?:\s*['"]?([^'"\s#]+)/gm)].map(([, name, version]) => [name, version]),
);
// Une version du dépôt plus ancienne que celle des gabarits (majeure en dessous) : à trancher avant d'installer
const major = (version) => Number(String(version).replace(/^[^\d]*/, '').split('.')[0]);
const resolvedVersion = (name) => (project.deps[name]?.startsWith('catalog:') ? catalog[name] : project.deps[name]);
for (const [name, version] of Object.entries({ ...versions.dependencies, ...versions.devDependencies })) {
  const current = resolvedVersion(name) ?? catalog[name];
  if (current && major(current) < major(version)) {
    notes.push(
      `${name}: the repository has ${current}, the templates were tested with ${version}.${name === 'vitest' ? ' @storybook/addon-vitest needs vitest 4 or later: upgrade it, or give the Storybook packages their own version (pnpm named catalog, catalogs.storybook) in this package only.' : ''}`,
    );
  }
}

// ---------- Rapport ----------
console.log(`${dry ? 'Would write' : 'Written'} (${written.length}):`);
for (const file of written) console.log(`  ${file}`);
if (kept.length) {
  console.log(`\nKept, already there (${kept.length}):`);
  for (const file of kept) console.log(`  ${file}`);
}
if (deps.length || devDeps.length) {
  console.log(`\nDependencies to install in ${positional[0]} (versions tested together on ${versions.testedOn}):`);
  if (usesCatalog) {
    console.log('  pnpm catalog: add to the catalog of pnpm-workspace.yaml, then "catalog:" in package.json');
    for (const dep of [...deps, ...devDeps]) {
      const [name, version] = dep.split(/@(?=[^@]+$)/);
      console.log(`    ${name.startsWith('@') ? `'${name}'` : name}: ${catalog[name] ? `${catalog[name]} (already in the catalog)` : version}${devDeps.includes(dep) ? '  (dev)' : ''}`);
    }
  } else {
    if (deps.length) console.log(`  ${manager} ${deps.join(' ')}`);
    if (devDeps.length) console.log(`  ${manager.replace(/ -E$/, ' -D -E')} ${devDeps.join(' ')}`);
  }
}
const scripts = readFileSync(join(project.root, 'package.json'), 'utf8');
const wantedScripts = { storybook: 'storybook dev -p 6006 --no-open', 'build-storybook': 'storybook build -o storybook-static --quiet', 'test:stories': 'vitest run --project stories' };
const missingScripts = Object.entries(wantedScripts).filter(([name]) => !new RegExp(`"${name}"\\s*:`).test(scripts));
if (missingScripts.length) {
  console.log('\nScripts to add to package.json:');
  for (const [name, command] of missingScripts) console.log(`  "${name}": "${command}"`);
}
// Dépôt piloté par un Makefile : une cible pour ouvrir Storybook sans connaître le paquet ni le gestionnaire
const makefile = join(project.repo, 'Makefile');
if (existsSync(makefile) && !/^storybook\s*:/m.test(read(makefile))) {
  const run = lockfile === 'pnpm-lock.yaml' && project.repo !== project.root ? `pnpm --filter=${JSON.parse(scripts).name} storybook` : `cd ${fromRepo(project.root)} && npm run storybook`;
  notes.push(`Makefile: add a "storybook" target (and its line in "help"): ${run}`);
}
if (notes.length) {
  console.log('\nTo do:');
  for (const note of notes) console.log(`  - ${note}`);
}
console.log(`\nNext: fill ${rel(project, memory)}, then node audit.mjs ${positional[0]} for the state of the code.`);

#!/usr/bin/env node
/**
 * Pose le socle du design system dans une application React + Tailwind v4 : tokens (si l'application n'en a pas),
 * thème shadcn sur les tokens, feuille des classes, Storybook (configuration, pages Introduction, Tokens et
 * Classes), projet vitest des histoires, configuration ESLint, document de conventions et mémoire.
 *
 * Aucun fichier existant n'est écrasé : il est gardé et signalé. Seule la feuille d'entrée est complétée par les
 * @import qui lui manquent. Les dépendances ne sont pas installées : la commande à lancer est affichée.
 *
 * Usage : node scaffold.mjs <app-dir> [--mode create|maintain|migrate] [--classes own|daisyui] [--specs <projet>/ui]
 *                            [--tokens <file>] [--rule <file>] [--dry-run] [--src …] [--ui …] [--components …] [--entry …]
 *                            [--styles …] [--docs …]
 *   --classes classes sémantiques du projet (own, à la daisyUI) ou de daisyUI (daisyui) ; par défaut daisyui si
 *             l'application utilise déjà daisyUI
 *   --specs   specs du skill specs-ui, dans le dépôt de specs (dossier <projet>/ui ou son tokens.css, depuis le dossier
 *             courant) : leurs tokens sont copiés dans <styles>/tokens.css avec leur provenance (tokens.mjs les recopie)
 *   --tokens  fichier de tokens existant de l'application (par défaut : celui que la feuille d'entrée importe, sinon
 *             specs/ui/tokens.css à la racine du dépôt, ancienne disposition, sinon un nouveau <styles>/tokens.css)
 *   --rule    où écrire les conventions (par défaut .claude/rules/design-system.md si le dépôt a .claude/rules/,
 *             sinon docs/design-system.md)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAISYUI_THEME_VARIABLES,
  cssImports,
  detectProject,
  isDir,
  isSpecsTokens,
  lintConfigText,
  parseArgs,
  parseTokensCopy,
  read,
  rel,
  sourceLabel,
  specsTokensFile,
  tokensCopy,
} from './project.mjs';

const { options, positional } = parseArgs(process.argv.slice(2), ['dry-run']);
if (!positional[0] || !isDir(positional[0])) {
  console.error('Usage: node scaffold.mjs <app-dir> [--mode create|maintain|migrate] [--classes own|daisyui] [--tokens <file>] [--rule <file>] [--dry-run]');
  process.exit(2);
}
if (options.classes && !['own', 'daisyui'].includes(options.classes)) {
  console.error('--classes: own or daisyui');
  process.exit(2);
}
const project = detectProject(positional[0], options);
const withDaisyui = project.classes === 'daisyui';
// Sections des gabarits propres à une bibliothèque de classes : `/* if:daisyui */ … /* end:daisyui */` (CSS),
// `<!-- if:own --> … <!-- end:own -->` (Markdown), `{/* if:daisyui */} … {/* end:daisyui */}` (MDX)
const flags = { own: !withDaisyui, daisyui: withDaisyui };
const SECTION = /^[ \t]*(?:<!--|\{?\/\*) if:([\w-]+) (?:-->|\*\/\}?)[ \t]*\n([\s\S]*?)^[ \t]*(?:<!--|\{?\/\*) end:\1 (?:-->|\*\/\}?)[ \t]*\n/gm;
const sections = (text) => text.replace(SECTION, (_, name, body) => (flags[name] ? body : ''));
const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const template = (path) => sections(readFileSync(join(templates, path), 'utf8'));
const versions = JSON.parse(template('versions.json'));
// Tokens des specs : le dépôt de specs est à part, ses tokens se copient (l'application ne peut pas les importer)
const specsSource = options.specs ? specsTokensFile(options.specs) : null;
if (specsSource && !existsSync(specsSource)) {
  console.error(`Specs tokens not found: ${specsSource} (--specs takes the specs folder, <projet>/ui, or its tokens.css).`);
  process.exit(2);
}
if (options.tokens && !resolve(project.root, options.tokens).startsWith(project.repo)) {
  console.error('--tokens names a file of the application. For the tokens of a specs repository, pass --specs <projet>/ui: they are copied, not imported.');
  process.exit(2);
}
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
/** Feuilles importées par une feuille, sur trois niveaux. */
function sheetsOf(file) {
  const sheets = [];
  for (let level = [file], depth = 0; level.length && depth < 3; depth++) {
    level = level.flatMap((sheet) => cssImports(sheet)).filter((sheet) => existsSync(sheet) && !sheets.includes(sheet));
    sheets.push(...level);
  }
  return sheets;
}
const fill = (text, values) => text.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in values ? values[key] : match));

// ---------- Tokens ----------
// Ancienne disposition : specs/ dans le dépôt de l'application, tokens importés sans copie
const specsTokens = join(project.repo, 'specs', 'ui', 'tokens.css');
// Couleurs déclarées par la feuille d'entrée elle-même (shadcn d'origine) : ce ne sont pas encore des tokens
const tokensInEntry = project.tokens && project.tokens === project.entry;
// Tokens rangés dans theme.css (design system maison) : ils iront dans <styles>/tokens.css à l'étape 2, que les pages et
// les conventions citent déjà
const tokens = project.tokensInTheme
  ? join(project.styles, 'tokens.css')
  : specsSource
    ? (!tokensInEntry && project.tokens && !isSpecsTokens(project.tokens) && project.tokens) || join(project.styles, 'tokens.css')
    : (!tokensInEntry && project.tokens) || (existsSync(specsTokens) ? specsTokens : join(project.styles, 'tokens.css'));
const tokensFromSpecs = tokens === specsTokens;
const tokensCopied = Boolean(specsSource) && !project.tokensInTheme;
if (tokensCopied) {
  const existing = read(tokens);
  if (!existing) {
    write(tokens, tokensCopy(specsSource));
  } else if (parseTokensCopy(existing)) {
    kept.push(rel(project, tokens));
    notes.push(`${rel(project, tokens)} is already a copy of the specs tokens: node <skill>/scripts/tokens.mjs ${positional[0]} --from ${options.specs} refreshes it.`);
  } else {
    kept.push(rel(project, tokens));
    notes.push(
      `${rel(project, tokens)} holds the application tokens, not a copy of the specs: compare them with ${relative(process.cwd(), specsSource)}, then replace them with tokens.mjs --from ${options.specs} --force.`,
    );
  }
} else if (tokensFromSpecs) {
  notes.push(
    `${fromRepo(specsTokens)} is imported directly (old layout, specs/ in the application). Once the specs move to the specs repository, copy their tokens: node <skill>/scripts/tokens.mjs ${positional[0]} --from <projet>/ui.`,
  );
}
if (project.tokensInTheme) {
  notes.push(
    `${rel(project, project.theme)} holds the tokens of the project: at step 2, move them to ${rel(project, join(project.styles, 'tokens.css'))} with the names of references/tokens.md (restricted scales, no responsive token), and keep in theme.css only the shadcn variables of templates/styles/theme.css.`,
  );
}
// daisyUI déjà en place : les couleurs, rayons et hauteurs de son thème deviennent les tokens (base-100 → surface,
// d'après le thème daisyUI du gabarit), pour que l'interface garde son rendu une fois le thème pointé sur les tokens
const daisyuiSource = withDaisyui && project.daisyui ? effectiveDaisyuiTheme(project.daisyui) : null;
const prefilled = [];
let tokensTemplate = template('styles/tokens.css');
if (daisyuiSource && !project.tokens && !tokensCopied) {
  const mapping = new Map(['primary', 'success', 'warning', 'info'].map((name) => [`--color-${name}`, `--color-${name}`]));
  for (const m of template('styles/theme.css').matchAll(/^\s*(--(?:color|radius)-[\w-]+)\s*:\s*var\((--[\w-]+)\)/gm)) mapping.set(m[1], m[2]);
  const assigned = new Map();
  // Ordre du thème daisyUI (base-100 avant les couleurs de contenu qui reprennent aussi la surface), le rayon des
  // champs avant celui des cases pour radius-control
  const order = (name) => (name === '--radius-field' ? -1 : DAISYUI_THEME_VARIABLES.indexOf(name));
  for (const [from, to] of [...mapping].sort(([a], [b]) => order(a) - order(b))) {
    const value = daisyuiSource.values.get(from);
    // Couleurs d'état d'un thème intégré : des fonds clairs (btn-success, avec success-content), alors que le token est
    // la couleur du texte sur la surface (AA) ; les valeurs du gabarit restent. Celles du thème du projet sont reprises
    const builtinState = /^--color-(info|success|warning|error)(-content)?$/.test(from) && !daisyuiSource.own.has(from);
    if (value && !builtinState && !assigned.has(to)) assigned.set(to, [from, cssColorToHex(value)]);
  }
  // 10 × --size-field : la hauteur des boutons et des champs de daisyUI
  const sizeField = daisyuiSource.values.get('--size-field')?.match(/^([\d.]+)rem$/);
  if (sizeField) assigned.set('--spacing-control', ['--size-field', `${Number((Number(sizeField[1]) * 10).toFixed(4))}rem`]);
  for (const [token, [from, value]] of assigned) {
    // Valeur remplacée, commentaire d'usage gardé dans sa colonne
    const line = new RegExp(`^(\\s*${token.replace(/[\\.]/g, '\\$&')}\\s*:\\s*)([^;]+);([ \\t]*)`, 'm');
    if (!line.test(tokensTemplate)) continue;
    tokensTemplate = tokensTemplate.replace(line, (_, head, old, space) => `${head}${value};${space && ' '.repeat(Math.max(1, old.length + space.length - value.length))}`);
    prefilled.push(`${token.replace(/^--/, '')} ← ${from.replace(/^--/, '')}`);
  }
}
if (!project.tokensInTheme && !tokensCopied && !existsSync(tokens) && write(tokens, tokensTemplate)) {
  notes.push(
    prefilled.length
      ? `${rel(project, tokens)}: pre-filled from the daisyUI theme (${daisyuiSource.sources.join(' + ')}): ${prefilled.join(', ')}. The other tokens keep the template values: fill them from the code (audit.mjs, rules hardcoded-color, palette-class) and check the contrasts (step 2): a state colour of daisyUI is a background, the token is a text colour on surface.`
      : tokensInEntry
      ? `${rel(project, tokens)}: template values. ${rel(project, project.entry)} declares the colours itself (:root, .dark, @theme inline): move their values into the tokens with the names of references/tokens.md, point the shadcn variables of theme.css at them, then delete them from the entry (step 2).`
      : `${rel(project, tokens)}: template values. Replace them with the colours found by audit.mjs (rule hardcoded-color, palette-class) or the brand.`,
  );
}

// ---------- Thème, classes, utilitaires ----------
const tokensCss = existsSync(tokens) ? read(tokens) : tokensCopied ? read(specsSource) : tokensTemplate;
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
  daisyuiVersion: `daisyUI ${project.daisyui?.version ?? versions.classes.daisyui.daisyui}`,
  classesLibrary: withDaisyui
    ? `daisyUI ${project.daisyui?.version ?? versions.classes.daisyui.daisyui}, réglé par les tokens (thème daisyUI de theme.css)`
    : 'classes du projet, à la daisyUI, dans @layer components',
  daisyuiMemory: withDaisyui ? ', daisyUI' : '',
  // Primitives des composants : Radix (asChild, data-state) ou Base UI (render, data-open / data-closed)
  ...(project.primitives === 'base'
    ? {
        primitives: 'Base UI',
        asChild: 'prop `render`',
        stateAttributes:
          "- Seuls `data-open` et `data-closed`, posés par Base UI, servent aux animations d'ouverture et de fermeture\n  (avec `data-starting-style` et `data-ending-style` pour les transitions), et `data-side` pour leur direction.\n  `data-placeholder` (Select) et `data-orientation` (Separator) sont les seuls autres attributs de Base UI lus,\n  faute d'équivalent ARIA.",
        stateAttributesShort: "Seuls `data-open` et `data-closed`, posés par Base UI, servent aux animations d'ouverture et de fermeture.",
      }
    : {
        primitives: 'Radix',
        asChild: '`asChild`',
        stateAttributes:
          "- Seul `data-state`, posé par Radix, sert aux animations d'ouverture et de fermeture, avec `data-side` pour leur\n  direction. `data-placeholder` (Select) et `data-orientation` (Separator) sont les seuls autres attributs de Radix\n  lus, faute d'équivalent ARIA.",
        stateAttributesShort: "Seul `data-state`, posé par Radix, sert aux animations d'ouverture et de fermeture.",
      }),
};
if (!write(theme, fill(template('styles/theme.css'), values)) && withDaisyui && !project.daisyui?.themes.some((t) => t.file === theme && t.variables.some((v) => /^var\(--color-/.test(v.value)))) {
  notes.push(`${rel(project, theme)} kept: add the daisyUI theme on the tokens (section if:daisyui of templates/styles/theme.css), see references/daisyui.md.`);
}
write(componentsCss, fill(template('styles/components.css'), { ...values, ui: posix(relative(project.root, project.ui)) }));
write(join(dirname(componentsCss), 'utilities.css'), template('styles/utilities.css'));
// Voile des fenêtres et apparition des calques flottants, communs aux composants de Radix ou de Base UI
write(join(dirname(componentsCss), 'classes', 'overlay.css'), template(`styles/classes/${project.primitives === 'base' ? 'overlay-base' : 'overlay'}.css`));

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
// daisyUI : le greffon, thèmes intégrés coupés (ils écraseraient les tokens depuis la couche base)
const daisyuiPlugin = withDaisyui && !project.daisyui?.plugin ? '@plugin "daisyui" { themes: false; }' : null;
if (!existsSync(entry)) {
  write(entry, `${[...wanted.map(([, line]) => line), ...(daisyuiPlugin ? [daisyuiPlugin] : [])].join('\n')}\n`);
} else {
  const css = read(entry);
  if (/@tailwind\s+(base|components|utilities)/.test(css)) {
    notes.push(`${rel(project, entry)} is a Tailwind v3 entry (@tailwind …): migrate it to v4 first (references/migration.md), then rerun scaffold.mjs.`);
  } else {
    // Feuilles importées par l'entrée, ou par une feuille qu'elle importe (index.css qui importe Tailwind)
    const imported = [entry, ...sheetsOf(entry)].flatMap((file) =>
      [...read(file).matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => (m[1].startsWith('.') ? resolve(dirname(file), m[1]) : m[1])),
    );
    const missing = wanted.filter(([target], index) => !imported.includes(target) && wanted.findIndex(([other]) => other === target) === index);
    if (daisyuiPlugin) missing.push(['@plugin daisyui', daisyuiPlugin]);
    if (missing.length) {
      // Après le dernier @import existant : l'ordre tailwindcss → tokens → thème → classes est gardé
      const lastImport = [...css.matchAll(/^@import[^\n]*$/gm)].at(-1);
      const at = lastImport ? lastImport.index + lastImport[0].length : 0;
      const block = missing.map(([, line]) => line).join('\n');
      const updated = lastImport ? `${css.slice(0, at)}\n${block}${css.slice(at)}` : `${block}\n${css}`;
      if (!dry) writeFileSync(entry, updated);
      written.push(`${rel(project, entry)} (+ ${missing.map(([target]) => (target.includes('/') && !target.startsWith('@') ? rel(project, target) : target)).join(', ')})`);
      if (missing.some(([target]) => target === 'tailwindcss') && imported.length) {
        notes.push(`${rel(project, entry)}: @import 'tailwindcss' was missing and has been added after the other imports: move it to the top.`);
      }
    }
  }
}

// ---------- daisyUI : thèmes en place ----------
if (withDaisyui && project.daisyui) {
  const dz = project.daisyui;
  if (dz.builtinThemes.length && dz.plugin) {
    notes.push(
      `${rel(project, dz.plugin.file)}:${dz.plugin.line}: @plugin "daisyui" keeps the built-in themes (${dz.builtinThemes.join(', ')}), which override the tokens from the base layer: once their values are in the tokens, write @plugin "daisyui" { themes: false; } (audit rule daisyui-builtin-theme).`,
    );
  }
  for (const t of dz.themes.filter((t) => t.file !== theme && t.variables.some((v) => v.name.startsWith('--color-') && !/^var\(/.test(v.value)))) {
    notes.push(`${rel(project, t.file)}:${t.line}: the daisyUI theme ${t.name} has its own values: once they are in the tokens, delete it; theme.css points daisyUI at the tokens.`);
  }
  const darkSource = dz.themes.find((t) => t.prefersdark)?.name ?? (dz.builtinThemes.includes('dark') || dz.builtinThemes.includes('all') ? 'dark (built-in)' : null);
  if (darkSource) {
    notes.push(`Dark mode came from the daisyUI theme ${darkSource} (prefers-color-scheme): to keep it, fill the .dark block of ${rel(project, theme)} with its values, and set the class dark on <html> (references/daisyui.md).`);
  }
}
if (withDaisyui && !project.daisyui) notes.push('daisyUI: install it (dependencies above), then read references/daisyui.md before the first component.');

// ---------- cn ----------
// tailwind-merge ne connaît pas les noms propres aux tokens (text-compact, h-control) : la fonction du projet les déclare
if (/^\s*--(text-(?!(xs|sm|base|lg|xl|[2-9]xl)\b)[a-z][\w-]*|spacing-[a-z][\w-]*)\s*:/m.test(read(tokens) || tokensCss)) {
  notes.push(
    `cn: declare the token names of the scales to tailwind-merge (extendTailwindMerge) in ${project.componentsJson?.aliases?.utils ?? 'the cn function'}, see references/setup.md ("cn et tailwind-merge"); audit rule merge-config.`,
  );
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
  tokensSource: tokensCopied
    ? ' Le fichier est une copie des tokens des specs (skill `specs-ui`, dépôt de specs) : une couleur, un rayon ou une police se change dans les specs, puis `tokens.mjs` recopie le fichier ; jamais dans l\'application.'
    : tokensFromSpecs
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
  dedupe(
    fill(template('memory.md'), {
      ...values,
      entry: fromRepo(entry),
      rule: fromRepo(rule),
      mode: options.mode ?? 'create',
      date: new Date().toISOString().slice(0, 10),
      // Copie des specs : provenance, et chemin du clone local pour recopier avec tokens.mjs --from
      specsTokens: tokensCopied
        ? `${sourceLabel(specsSource)}, clone local \`${posix(relative(project.repo, dirname(specsSource)))}\` (\`tokens.mjs --from\`)`
        : tokensFromSpecs
          ? `\`${fromRepo(specsTokens)}\`, importé tel quel (ancienne disposition)`
          : 'aucun',
    }),
  ),
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
const deps = missingDeps({ ...versions.dependencies, ...versions.primitives[project.primitives] });
const devDeps = missingDeps({ ...versions.devDependencies, ...versions.framework[isNext ? 'next' : 'vite'], ...(withDaisyui ? versions.classes.daisyui : {}) });

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
for (const [name, version] of Object.entries({ ...versions.dependencies, ...versions.primitives[project.primitives], ...versions.devDependencies, ...(withDaisyui ? versions.classes.daisyui : {}) })) {
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
// Clés de "scripts" seulement : la dépendance "storybook" n'est pas le script du même nom
const scriptNames = Object.keys(JSON.parse(scripts).scripts ?? {});
const missingScripts = Object.entries(wantedScripts).filter(([name]) => !scriptNames.includes(name));
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
console.log(`\nNext: fill ${rel(project, memory)}, then node audit.mjs ${positional[0]} for the state of the code.${withDaisyui ? ' daisyUI: references/daisyui.md.' : ''}`);

// ---------- daisyUI : thème en place et couleurs ----------

/**
 * Variables du thème daisyUI qui s'applique à la racine : le thème intégré par défaut (ou celui dont le thème du projet
 * reprend le nom, que daisyUI fusionne), recouvert par le thème du projet marqué `default`.
 */
function effectiveDaisyuiTheme(dz) {
  const values = new Map();
  const sources = [];
  const own = dz.themes.find((t) => t.isDefault) ?? (dz.themes.length === 1 ? dz.themes[0] : null);
  // Thèmes intégrés en feuilles (daisyUI 5 : theme/light.css…) ; daisyUI 4 n'en a pas
  const themeDir = dz.dir && join(dz.dir, 'theme');
  const builtinNames = themeDir && isDir(themeDir) ? new Set(readdirSync(themeDir).filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4))) : new Set();
  const base = own && builtinNames.has(own.name) ? own.name : dz.builtinThemes.length ? (dz.builtinThemes.includes('dark') && !dz.builtinThemes.includes('light') ? dz.builtinThemes[0] : 'light') : null;
  if (base && base !== 'all' && builtinNames.has(base)) {
    for (const m of read(join(dz.dir, 'theme', `${base}.css`)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) values.set(m[1], m[2].trim());
    sources.push(`built-in ${base}`);
  }
  if (own) {
    for (const v of own.variables) values.set(v.name, v.value);
    sources.push(own.name);
  }
  return values.size ? { values, sources, own: new Set(own?.variables.map((v) => v.name) ?? []) } : null;
}

/** Couleur CSS en hexadécimal : #rgb, #rrggbb, oklch() ; une autre écriture est gardée telle quelle. */
function cssColorToHex(value) {
  const hex = (channels) => `#${channels.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return value.toLowerCase();
  const m = value.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i);
  if (!m) return value;
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s];
  const srgb = linear.map((c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  const alpha = m[5] === undefined ? [] : [Number(m[5]) / (m[6] ? 100 : 1)];
  return hex([...srgb, ...alpha.filter((x) => x < 1)]);
}

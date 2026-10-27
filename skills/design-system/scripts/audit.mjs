#!/usr/bin/env node
/**
 * État des lieux du design system d'une application React + Tailwind : ce qui respecte les conventions du skill et
 * ce qui reste à faire. Sert à créer un design system à partir de l'existant, à le maintenir et à suivre une
 * migration. Lecture seule : aucun fichier n'est modifié.
 *
 * Usage : node audit.mjs <app-dir> [--rule <id>] [--limit 8] [--json] [--strict] [--min-classes 4]
 *                         [--src …] [--ui …] [--components …] [--layouts …] [--entry …] [--tokens …] [--docs …]
 *
 *   --rule        une seule règle, par son identifiant (hardcoded-color, repeated-classes…), avec --limit 0 pour tout
 *   --limit       exemples montrés par règle (8 par défaut ; 0 : tous)
 *   --json        rapport complet en JSON
 *   --strict      code de sortie 1 s'il reste une erreur (CI, fin de migration)
 *   --min-classes une liste de classes répétée compte à partir de ce nombre de classes (4 par défaut)
 *
 * Erreurs : couleur en dur, couleur de la palette de Tailwind, valeur ou variante arbitraire, attribut data-slot /
 * data-variant / data-size, feuille de composant non importée, sélecteur déclaré deux fois, `--color-muted` redéfini.
 * Avertissements : composant hors de son dossier, sans index.ts ou sans histoire, plusieurs composants par fichier,
 * import relatif entre composants partagés, animation sans prefers-reduced-motion, histoire hors de sa section,
 * @apply à valeur arbitraire, sélecteur sur un autre attribut data-* que data-state.
 * Suggestions : listes de classes répétées (classe sémantique ou composant à créer), classes non documentées.
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { detectProject, isDir, lintConfigText, parseArgs, read, rel, walk } from './project.mjs';

const { options, positional } = parseArgs(process.argv.slice(2), ['json', 'strict']);
if (!positional[0] || !isDir(positional[0])) {
  console.error('Usage: node audit.mjs <app-dir> [--rule <id>] [--limit 8] [--json] [--strict] [--min-classes 4]');
  process.exit(2);
}
const project = detectProject(positional[0], options);
const limit = options.limit === undefined ? 8 : Number(options.limit);
const minClasses = Number(options['min-classes'] ?? 4);

const RULES = {
  'hardcoded-color': ['error', 'Hard-coded colour: use a token (bg-surface, text-muted) or a shadcn variable'],
  'palette-class': ['error', 'Tailwind palette colour: use a token class instead'],
  'arbitrary-class': ['error', 'Arbitrary value or variant: Tailwind scale, token, named theme entry or @custom-variant'],
  'data-attribute': ['error', 'data-slot / data-variant / data-size: use a modifier class (btn-primary)'],
  'css-not-imported': ['error', 'Component stylesheet not imported by components.css: its classes are not loaded'],
  'css-import-missing': ['error', 'components.css imports a file that does not exist'],
  'duplicate-selector': ['error', 'Selector declared twice in the same context: the second one silently wins'],
  'muted-redefined': ['error', '--color-muted redefined by the theme: in the tokens it is the secondary text colour'],
  'flat-component': ['warning', 'Component file at the root of ui/: move it to its folder (rehome.mjs)'],
  'missing-index': ['warning', 'Component folder without index.ts re-exporting its names'],
  'missing-story': ['warning', 'Stateless component without a *.stories.tsx next to it'],
  'multi-component-file': ['warning', 'Several components in one file: one file per component (sub-components too)'],
  'relative-component-import': ['warning', 'Relative import between shared components: import through the @/ alias'],
  'reduced-motion': ['warning', 'Animation without a prefers-reduced-motion rule in the same stylesheet'],
  'story-section': ['warning', 'Story title outside the section of its folder (UI/, Shared/, Layouts/, Features/, Pages/)'],
  'arbitrary-apply': ['warning', '@apply with an arbitrary value: write standard CSS in a stylesheet'],
  'data-selector': ['warning', 'Selector on a data-* attribute other than data-state: use ARIA attributes or pseudo-classes'],
  'repeated-classes': ['suggestion', 'Class list repeated: candidate semantic class or shared component'],
  'undocumented-class': ['suggestion', 'Semantic class missing from the Classes page of Storybook'],
};
const findings = Object.fromEntries(Object.keys(RULES).map((id) => [id, []]));
const add = (id, file, line, detail) => findings[id].push({ file: rel(project, file), line, detail });

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
const stripJsComments = (code) =>
  code.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) =>
    string ?? match.replace(/[^\n]/g, ' '),
  );
const inside = (file, dir) => dir && (file === dir || file.startsWith(dir + sep));

// ---------- Fichiers ----------
const codeFiles = walk(project.src, ['.tsx', '.jsx', '.ts', '.js', '.mdx']).filter((f) => !f.endsWith('.d.ts'));
const cssFiles = walk(project.src, ['.css']);
if (project.tokens && !cssFiles.includes(project.tokens)) cssFiles.push(project.tokens);
const shared = [project.ui, project.components, project.layouts].filter((dir) => isDir(dir));

// ---------- Classes dans le code : className="…", cn(…), cva(…), clsx(…) ----------
const COLOR_NAMES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PALETTE = new RegExp(
  `^-?(bg|text|border(-[trblxyse])?|ring|ring-offset|fill|stroke|from|via|to|outline|divide|placeholder|decoration|shadow|accent|caret)-((${COLOR_NAMES})-(50|[1-9]00|950)|black|white)(/\\d+)?$`,
);
const VISUAL = /^-?(bg|border|rounded|shadow|ring|divide|font|tracking|leading|text|uppercase|italic|underline|decoration|opacity)\b/;
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/;

/** Chaînes littérales d'un appel (cn, cva…) ouvert à `start`, parenthèses équilibrées. */
function callStrings(code, start) {
  const strings = [];
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const char = code[i];
    if (char === '(' || char === '{' || char === '[') depth++;
    else if (char === ')' || char === '}' || char === ']') {
      depth--;
      if (depth === 0) break;
    } else if (char === '"' || char === "'" || char === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== char) j += code[j] === '\\' ? 2 : 1;
      strings.push({ value: code.slice(i + 1, j).replace(/\$\{[^}]*\}/g, ' '), index: i });
      i = j;
    }
  }
  return strings;
}

function classLists(code) {
  const lists = [];
  const attribute = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)\s*\})/g;
  for (const match of code.matchAll(attribute)) {
    const value = match.slice(1).find((group) => group !== undefined) ?? '';
    lists.push({ value: value.replace(/\$\{[^}]*\}/g, ' '), index: match.index });
  }
  for (const match of code.matchAll(/\b(?:cn|clsx|cx|cva|twMerge|tv)\(/g)) {
    lists.push(...callStrings(code, match.index + match[0].length - 1));
  }
  return lists;
}

const repeated = new Map();
for (const file of codeFiles) {
  const code = stripJsComments(read(file));
  // Histoires et pages du design system montrent les classes : ni classes répétées ni data-* à y chercher
  const isStory = /\.stories\.[jt]sx?$|\.mdx$/.test(file) || inside(file, project.docs);
  for (const { value, index } of classLists(code)) {
    const classes = value.split(/\s+/).filter(Boolean);
    for (const token of classes) {
      const base = token.split(':').pop().replace(/^!/, '');
      if (token.includes('[')) add('arbitrary-class', file, lineOf(code, index), token);
      else if (PALETTE.test(base)) add('palette-class', file, lineOf(code, index), token);
    }
    // Une liste qui ne fait que placer (flex, gap, marges) reste en utilitaires : seules comptent celles qui habillent
    if (!isStory && classes.length >= minClasses && classes.some((token) => VISUAL.test(token.split(':').pop()))) {
      const key = [...new Set(classes)].sort().join(' ');
      const entry = repeated.get(key) ?? [];
      entry.push(`${rel(project, file)}:${lineOf(code, index)}`);
      repeated.set(key, entry);
    }
  }
  // Couleurs en dur : style={{ color: '#…' }}, fill="#…"
  for (const match of code.matchAll(
    /\b(color|background|backgroundColor|borderColor|outlineColor|boxShadow|fill|stroke|stopColor)\s*[:=]\s*\{?\s*['"`]([^'"`]*)['"`]/g,
  )) {
    if (COLOR_LITERAL.test(match[2]) && !/var\(--/.test(match[2])) {
      add('hardcoded-color', file, lineOf(code, match.index), `${match[1]}: ${match[2]}`);
    }
  }
  for (const match of code.matchAll(/\bdata-(slot|variant|size)\s*=/g)) {
    if (!isStory) add('data-attribute', file, lineOf(code, match.index), match[0].replace(/\s*=$/, ''));
  }
}
for (const [key, places] of repeated) {
  if (places.length >= 2) findings['repeated-classes'].push({ file: places[0].split(':')[0], line: Number(places[0].split(':')[1]), detail: `${places.length}× "${key}"`, places, count: places.length });
}
findings['repeated-classes'].sort((a, b) => b.count - a.count || b.detail.length - a.detail.length);

// ---------- Feuilles de style ----------
const selectorKeys = new Map();
const definedClasses = new Map();
for (const file of cssFiles) {
  const css = stripCssComments(read(file));
  const isTokens = file === project.tokens;
  // Déclarations : une couleur en dur hors d'une variable (--x: #…) est une erreur
  if (!isTokens) {
    for (const match of css.matchAll(/(^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+);/g)) {
      if (match[2].startsWith('--') || match[2] === 'apply') continue;
      if (COLOR_LITERAL.test(match[3]) && !/^url\(/.test(match[3].trim())) {
        add('hardcoded-color', file, lineOf(css, match.index), `${match[2]}: ${match[3].trim()}`);
      }
    }
  }
  for (const match of css.matchAll(/@apply\s+([^;]+);/g)) {
    for (const token of match[1].split(/\s+/).filter(Boolean)) {
      const base = token.split(':').pop().replace(/^!/, '');
      if (token.includes('[')) add('arbitrary-apply', file, lineOf(css, match.index), token);
      else if (PALETTE.test(base)) add('palette-class', file, lineOf(css, match.index), token);
    }
  }
  // Règles : contexte (at-rules et règles parentes) + sélecteur
  const stack = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '{') {
      const prelude = css.slice(start, i).replace(/\s+/g, ' ').trim();
      stack.push(prelude);
      if (!prelude.startsWith('@') && !isTokens) {
        const key = stack.join(' » ');
        const places = selectorKeys.get(key) ?? [];
        places.push({ file, line: lineOf(css, start + css.slice(start, i).search(/\S/)) });
        selectorKeys.set(key, places);
        if (/\[data-(?!state\b)[\w-]+/.test(prelude)) add('data-selector', file, lineOf(css, i), prelude);
        if (/\[data-(slot|variant|size)\b/.test(prelude)) add('data-attribute', file, lineOf(css, i), prelude);
        if (inside(file, project.src) && file !== project.theme) {
          for (const cls of prelude.matchAll(/\.([a-z][\w-]*)/g)) {
            if (!definedClasses.has(cls[1])) definedClasses.set(cls[1], { file, line: lineOf(css, i) });
          }
        }
      }
      start = i + 1;
    } else if (char === '}') {
      stack.pop();
      start = i + 1;
    } else if (char === ';') start = i + 1;
  }
  if (/animate-(in|out)\b|\banimation\s*:|@keyframes|\b(slide|zoom|fade)-(in|out)/.test(css) && !/prefers-reduced-motion/.test(css)) {
    add('reduced-motion', file, 1, 'add @media (prefers-reduced-motion: reduce) { … animation: none; }');
  }
}
for (const [key, places] of selectorKeys) {
  if (places.length < 2) continue;
  const where = places.map((p) => `${rel(project, p.file)}:${p.line}`).join(', ');
  findings['duplicate-selector'].push({ file: rel(project, places[0].file), line: places[0].line, detail: `${key.split(' » ').pop()} (${where})` });
}

// --color-muted redéfini par le thème alors que les tokens en font la couleur du texte secondaire
if (project.theme && project.tokens && /--color-muted\s*:/.test(read(project.tokens))) {
  const theme = stripCssComments(read(project.theme));
  for (const block of theme.matchAll(/@theme[^{]*\{([^}]*)\}/g)) {
    const at = block[1].search(/--color-muted\s*:/);
    if (at >= 0) add('muted-redefined', project.theme, lineOf(theme, block.index + at), '--color-muted');
  }
}

// ---------- Feuilles importées par components.css ----------
if (project.componentsCss) {
  const css = read(project.componentsCss);
  const imported = new Set();
  for (const match of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    const target = resolve(dirname(project.componentsCss), match[1]);
    imported.add(target);
    if (!existsSync(target)) add('css-import-missing', project.componentsCss, lineOf(css, match.index), match[1]);
  }
  const entryImports = new Set(project.entry ? [...read(project.entry).matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => resolve(dirname(project.entry), m[1])) : []);
  for (const file of cssFiles) {
    if ([project.entry, project.componentsCss, project.theme, project.tokens].includes(file)) continue;
    if (imported.has(file) || entryImports.has(file)) continue;
    const inComponents = shared.some((dir) => inside(file, dir)) || inside(file, join(project.src, 'features')) || inside(file, join(project.styles, 'classes'));
    if (inComponents) add('css-not-imported', file, 1, `@import '${relative(dirname(project.componentsCss), file).split(sep).join('/')}';`);
  }
}

// ---------- Composants partagés ----------
const TOP_LEVEL_COMPONENT = /^(?:export\s+)?(?:default\s+)?(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*(?:\(|(?:React\.)?(?:forwardRef|memo)\b))/gm;
for (const dir of shared) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name) && !entry.name.includes('.stories.')) {
      add('flat-component', path, 1, `node rehome.mjs <app-dir> ${entry.name.replace(/\.(tsx|jsx)$/, '')}`);
    }
    if (!entry.isDirectory()) continue;
    const files = readdirSync(path);
    const sources = files.filter((f) => /\.(tsx|jsx)$/.test(f) && !f.includes('.stories.') && !f.includes('.test.'));
    if (!sources.length) continue;
    if (!files.includes('index.ts') && !files.includes('index.tsx')) add('missing-index', path, 0, entry.name);
    if (!files.some((f) => f.includes('.stories.'))) add('missing-story', path, 0, entry.name);
  }
}
for (const file of codeFiles) {
  if (!/\.(tsx|jsx)$/.test(file) || file.includes('.stories.') || file.includes('.test.')) continue;
  const code = stripJsComments(read(file));
  const names = [...code.matchAll(TOP_LEVEL_COMPONENT)].map((m) => m[1] ?? m[2]);
  if (names.length > 1) add('multi-component-file', file, 1, names.join(', '));
  if (shared.some((dir) => inside(file, dir))) {
    for (const match of code.matchAll(/from\s+['"](\.\.\/[^'"]+)['"]/g)) {
      add('relative-component-import', file, lineOf(code, match.index), match[1]);
    }
  }
}

// ---------- Storybook : section du titre selon le dossier ----------
function expectedSection(file) {
  const path = relative(project.src, file).split(sep).join('/');
  if (inside(file, project.ui)) return 'UI';
  if (inside(file, project.components)) return 'Shared';
  if (inside(file, project.layouts) || /\/layouts\//.test(path)) return 'Layouts';
  if (inside(file, project.docs)) return 'Design system';
  if (/-screen\.stories\.[jt]sx?$/.test(path)) return 'Pages';
  if (path.startsWith('features/')) return 'Features';
  return null;
}
for (const file of codeFiles) {
  if (!/\.stories\.[jt]sx?$|\.mdx$/.test(file)) continue;
  const code = read(file);
  const title = code.match(/\btitle\s*[:=]\s*["'`]([^"'`]+)["'`]/)?.[1];
  const section = expectedSection(file);
  if (title && section && !title.startsWith(`${section}/`)) add('story-section', file, lineOf(code, code.indexOf(title)), `"${title}" → ${section}/…`);
}

// ---------- Documentation : classes absentes de la page Classes ----------
const classesPage = walk(project.docs, ['.mdx']).find((file) => /classes/i.test(basename(file)));
if (classesPage) {
  const page = read(classesPage);
  // Classes racines seulement : btn-primary est documentée avec btn
  const names = [...definedClasses.keys()];
  for (const [name, where] of definedClasses) {
    if (names.some((other) => other !== name && name.startsWith(`${other}-`))) continue;
    if (!new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(page)) add('undocumented-class', where.file, where.line, name);
  }
}

// ---------- Outillage ----------
const lint = lintConfigText(project);
const tokensCount = project.tokens ? (read(project.tokens).match(/^\s*--[\w-]+\s*:/gm) ?? []).length : 0;
const uiCount = isDir(project.ui) ? readdirSync(project.ui, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0;
const storiesCount = codeFiles.filter((f) => /\.stories\.[jt]sx?$/.test(f)).length;
const preview = project.storybook ? walk(project.storybook, ['.ts', '.tsx', '.js', '.jsx']).map(read).join('\n') : '';
const layout = {
  entry: rel(project, project.entry),
  tokens: project.tokens ? `${rel(project, project.tokens)} (${tokensCount} tokens)` : 'none',
  theme: rel(project, project.theme),
  components: project.componentsCss ? `${rel(project, project.componentsCss)} (${(read(project.componentsCss).match(/@import/g) ?? []).length} imports)` : 'none',
  ui: `${rel(project, project.ui)} (${uiCount} component folders)`,
  storybook: project.storybook ? `${storiesCount} stories, a11y ${/a11y[\s\S]{0,80}test:\s*['"]error['"]/.test(preview) ? 'blocking' : 'not blocking'}` : 'none',
  lint: /better-tailwindcss/.test(lint)
    ? `better-tailwindcss${/no-restricted-classes/.test(lint) ? ', arbitrary values blocked' : ', arbitrary values allowed'}${/no-unknown-classes/.test(lint) ? ', unknown classes' : ''}`
    : 'no Tailwind class lint',
  shadcn: project.componentsJson ? `style ${project.componentsJson.style ?? '?'}, cn from ${project.cnImport}` : 'no components.json',
};

// ---------- Rapport ----------
const selected = options.rule ? [options.rule] : Object.keys(RULES);
if (options.rule && !RULES[options.rule]) {
  console.error(`Unknown rule ${options.rule}. Rules: ${Object.keys(RULES).join(', ')}`);
  process.exit(2);
}
const counts = { error: 0, warning: 0, suggestion: 0 };
for (const id of selected) counts[RULES[id][0]] += findings[id].length;

if (options.json) {
  console.log(JSON.stringify({ app: project.root, layout, counts, findings: Object.fromEntries(selected.map((id) => [id, findings[id]])) }, null, 2));
} else {
  console.log(`Design system audit: ${relative(process.cwd(), project.root) || '.'}`);
  for (const [key, value] of Object.entries(layout)) console.log(`  ${key.padEnd(10)} ${value}`);
  for (const level of ['error', 'warning', 'suggestion']) {
    const ids = selected.filter((id) => RULES[id][0] === level && findings[id].length);
    if (!ids.length) continue;
    console.log(`\n${level === 'error' ? 'Errors' : level === 'warning' ? 'Warnings' : 'Suggestions'} (${counts[level]})`);
    for (const id of ids) {
      const list = findings[id];
      console.log(`  [${id}] ${list.length} · ${RULES[id][1]}`);
      for (const item of limit ? list.slice(0, limit) : list) {
        const where = item.line ? `${item.file}:${item.line}` : item.file;
        console.log(`    ${where}  ${item.detail}`);
      }
      if (limit && list.length > limit) console.log(`    … ${list.length - limit} more (--rule ${id} --limit 0)`);
    }
  }
  if (!counts.error && !counts.warning && !counts.suggestion) console.log('\nNo problem found.');
}
process.exit(options.strict && counts.error ? 1 : 0);

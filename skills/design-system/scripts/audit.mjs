#!/usr/bin/env node
/**
 * État des lieux du design system d'une application React + Tailwind : ce qui respecte les conventions du skill et
 * ce qui reste à faire. Sert à créer un design system à partir de l'existant, à le maintenir et à suivre une
 * migration. Lecture seule : aucun fichier n'est modifié.
 *
 * Usage : node audit.mjs <app-dir> [--rule <id>] [--limit 8] [--json] [--strict] [--min-classes 4] [--allow-data a,b]
 *                         [--src …] [--ui …] [--components …] [--layouts …] [--entry …] [--tokens …] [--docs …]
 *
 *   --rule        une seule règle, par son identifiant (hardcoded-color, repeated-classes…), avec --limit 0 pour tout
 *   --limit       exemples montrés par règle (8 par défaut ; 0 : tous)
 *   --json        rapport complet en JSON
 *   --strict      code de sortie 1 s'il reste une erreur (CI, fin de migration)
 *   --min-classes une liste de classes répétée compte à partir de ce nombre de classes (4 par défaut)
 *   --allow-data  attributs data-* d'une bibliothèque permis dans les sélecteurs (streamdown : data-streamdown)
 *
 * Erreurs : couleur en dur, couleur de la palette de Tailwind, valeur ou variante arbitraire, attribut data-slot /
 * data-variant / data-size, feuille de composant non importée, sélecteur déclaré deux fois, `--color-muted` redéfini,
 * fond `bg-muted` de shadcn alors que `muted` est la couleur du texte.
 * Avertissements : composant hors de son dossier, sans index.ts ou sans histoire, plusieurs composants par fichier,
 * import relatif entre composants partagés, animation sans prefers-reduced-motion, histoire hors de sa section,
 * @apply à valeur arbitraire, sélecteur sur un autre attribut data-* que data-state.
 * Suggestions : listes de classes répétées (classe sémantique ou composant à créer), classes non documentées.
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { detectProject, isDir, lintConfigText, parseArgs, read, readJsonc, rel, scaleChecker, walk } from './project.mjs';

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
  'responsive-token': ['warning', 'Token redefined at a breakpoint: sizes are fixed, the variation goes in the JSX (md:) or in a component class'],
  'unrestricted-scale': ['suggestion', 'Tailwind scale not restricted: reset the family in the tokens (--spacing-*: initial) and redeclare the steps used'],
  'off-scale': ['error', 'Step outside the restricted scale of the tokens: not generated; use a step of the scale or add one to the tokens'],
  'arbitrary-class': ['error', 'Arbitrary value or variant: Tailwind scale, token, named theme entry or @custom-variant'],
  'data-attribute': ['error', 'data-slot / data-variant / data-size: use a modifier class (btn-primary)'],
  'css-not-imported': ['error', 'Component stylesheet not imported by components.css: its classes are not loaded'],
  'css-import-missing': ['error', 'components.css imports a file that does not exist'],
  'duplicate-selector': ['error', 'Selector declared twice in the same context: the second one silently wins'],
  'merge-config': ['error', 'tailwind-merge does not know a token of the scales: cn() drops it (text-compact taken for a colour); extend it with extendTailwindMerge'],
  'breakpoint-literal': ['warning', 'Media query on a literal width: use the breakpoint tokens (@variant md, theme(--breakpoint-md))'],
  'react18-ref': ['warning', 'Control written for React 19 (ref as a prop): in React 18 its ref is dropped, wrap it in forwardRef'],
  'muted-redefined': ['error', '--color-muted redefined by the theme: in the tokens it is the secondary text colour'],
  'shadcn-alias': ['error', 'components.json alias that tsconfig does not resolve: the shadcn CLI refuses to add components'],
  'muted-background': ['error', 'bg-muted is a shadcn background, but muted is the text colour of the tokens: use bg-surface-alt'],
  'flat-component': ['warning', 'Component file at the root of ui/: move it to its folder (rehome.mjs)'],
  'missing-index': ['warning', 'Component folder without index.ts re-exporting its names'],
  'missing-story': ['warning', 'Stateless component without a *.stories.tsx next to it'],
  'multi-component-file': ['warning', 'Several components in one file: one file per component (sub-components too)'],
  'relative-component-import': ['warning', 'Relative import between shared components: import through the @/ alias'],
  'reduced-motion': ['warning', 'Animation without a prefers-reduced-motion rule in the same stylesheet'],
  'story-export': ['warning', 'Named export of a stories file that is not a story: Storybook shows it as one; shared story data goes in src/stories/'],
  'a11y-todo': ['warning', 'Accessibility of these stories reported without failing (a11y test todo): fix them, then remove it'],
  'story-section': ['warning', 'Story title outside the section of its folder (UI/, Shared/, Layouts/, Features/, Pages/)'],
  'arbitrary-apply': ['warning', '@apply with an arbitrary value: write standard CSS in a stylesheet'],
  'data-selector': ['warning', 'Selector on a data-* attribute other than the open/close state of the primitives: use ARIA attributes or pseudo-classes'],
  'repeated-classes': ['suggestion', 'Class list repeated: candidate semantic class or shared component'],
  'doc-unknown-name': ['warning', 'Class or token cited by the conventions or a documentation page, defined nowhere'],
  'doc-placeholder': ['warning', 'Template text left to fill in the documentation (« À compléter »)'],
  'undocumented-class': ['suggestion', 'Semantic class missing from the Classes page of Storybook'],
};
// data-* permis dans les sélecteurs : ceux que Radix pose sans équivalent ARIA, et ceux d'une bibliothèque sans classe
// stable, déclarés par --allow-data (streamdown pour data-streamdown='link')
// Base UI marque l'ouverture et les transitions par data-open, data-closed, data-starting-style et data-ending-style
const baseUiData = project.primitives === 'base' ? ['open', 'closed', 'starting-style', 'ending-style'] : [];
const allowedData = ['state', 'side', 'align', 'orientation', 'placeholder', ...baseUiData, ...String(options['allow-data'] ?? '').split(',').filter(Boolean)];
const dataSelector = new RegExp(`\\[data-(?!(${allowedData.join('|')})\\b)[\\w-]+`);
const findings = Object.fromEntries(Object.keys(RULES).map((id) => [id, []]));
const add = (id, file, line, detail) => findings[id].push({ file: rel(project, file), line, detail });

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
const stripJsComments = (code) =>
  code.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) =>
    string ?? match.replace(/[^\n]/g, ' '),
  );
const inside = (file, dir) => dir && (file === dir || file.startsWith(dir + sep));

// ---------- components.json ----------
// La CLI de shadcn résout chaque alias par les chemins du tsconfig : une clé exacte (@acme/ui/utils) ou un préfixe
// (@acme/ui/* pour @acme/ui/components). @acme/ui/components/* ne résout pas @acme/ui/components : dans un paquet du
// monorepo, la CLI s'arrête alors sur « Could not resolve the following aliases »
if (project.componentsJson?.aliases) {
  const paths = readJsonc(join(project.root, 'tsconfig.json'))?.compilerOptions?.paths;
  if (paths) {
    const resolves = (alias) => Object.keys(paths).some((key) => key === alias || (key.endsWith('/*') && alias.startsWith(key.slice(0, -1))));
    const missing = Object.entries(project.componentsJson.aliases).filter(([, alias]) => typeof alias === 'string' && !resolves(alias));
    if (missing.length) {
      const scope = missing[0][1].split('/').slice(0, missing[0][1].startsWith('@') ? 2 : 1).join('/');
      add('shadcn-alias', join(project.root, 'tsconfig.json'), 1, `${missing.map(([key, alias]) => `${key} (${alias})`).join(', ')}: add "${scope}/*": ["./src/*"] to compilerOptions.paths`);
    }
  }
}

// ---------- Fichiers ----------
// Fichiers générés que le lint ignore (icônes de svgr…) : ni lus ni comptés par l'audit
const lintIgnores = [...lintConfigText(project).matchAll(/ignores\s*:\s*\[([\s\S]*?)\]/g)]
  .flatMap((m) => [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/['"`]([^'"`]+)['"`]/g)].map((g) => g[1]))
  .filter((glob) => !/^\*\*\/\*\.|node_modules|dist|coverage|storybook-static/.test(glob))
  .map((glob) => new RegExp(`^${glob.replace(/[.+^${}()|]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`));
const ignoredByLint = (file) => lintIgnores.some((pattern) => pattern.test(relative(project.root, file).split(sep).join('/')));
const codeFiles = walk(project.src, ['.tsx', '.jsx', '.ts', '.js', '.mdx']).filter((f) => !f.endsWith('.d.ts') && !ignoredByLint(f));
const cssFiles = walk(project.src, ['.css']);
if (project.tokens && !cssFiles.includes(project.tokens)) cssFiles.push(project.tokens);
const shared = [...new Set([project.ui, project.components, project.layouts])].filter((dir) => isDir(dir));

// ---------- Classes dans le code : className="…", cn(…), cva(…), clsx(…) ----------
const COLOR_NAMES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PALETTE = new RegExp(
  `^-?(bg|text|border(-[trblxyse])?|ring|ring-offset|fill|stroke|from|via|to|outline|divide|placeholder|decoration|shadow|accent|caret)-((${COLOR_NAMES})-(50|[1-9]00|950)|black|white)(/\\d+)?$`,
);
// Fond « muted » de shadcn (bg-muted, bg-muted/50) quand les tokens font de muted la couleur du texte secondaire
const MUTED_SURFACE = /^-?(bg|fill|stroke|border(-[trblxyse])?|from|via|to|ring|outline|divide)-muted(\/\d+)?$/;
// Seulement quand --color-muted est une couleur des tokens : `var(--muted)` (thème shadcn d'origine) reste un fond
const mutedIsText = project.tokens ? /--color-muted\s*:(?!\s*var\(--muted\))/.test(read(project.tokens)) : false;
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

const offScale = scaleChecker(project);
const spacingRestricted = /--spacing-\*\s*:\s*initial/.test(`${read(project.tokens)}\n${read(project.theme)}`);
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
      else if (mutedIsText && MUTED_SURFACE.test(base)) add('muted-background', file, lineOf(code, index), token);
      else if (offScale(token)) add('off-scale', file, lineOf(code, index), token);
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
/** Première classe du dernier composé de chaque sélecteur de la liste (hors parenthèses et crochets). */
function definedBy(prelude) {
  const classes = [];
  let depth = 0;
  let compound = '';
  const flush = () => {
    const cls = compound.match(/^[^(\[]*?\.([a-z][\w-]*)/)?.[1] ?? compound.match(/\.([a-z][\w-]*)/)?.[1];
    return cls;
  };
  let last = '';
  for (const char of `${prelude},`) {
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    if (depth === 0 && char === ',') {
      compound = last.trim();
      const cls = flush();
      if (cls) classes.push(cls);
      last = '';
    } else if (depth === 0 && /[\s>+~]/.test(char)) {
      if (last.trim()) compound = last;
      last = last.trim() ? '' : last;
    } else last += char;
  }
  return classes;
}
for (const file of cssFiles) {
  const css = stripCssComments(read(file));
  const isTokens = file === project.tokens;
  // Déclarations : une couleur en dur est une erreur, variable locale d'un composant comprise (--x: #…) ; seuls les
  // tokens et le thème (bloc .dark) déclarent des valeurs
  if (!isTokens) {
    for (const match of css.matchAll(/(^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+);/g)) {
      if ((match[2].startsWith('--') && file === project.theme) || match[2] === 'apply') continue;
      if (COLOR_LITERAL.test(match[3]) && !/^url\(/.test(match[3].trim())) {
        add('hardcoded-color', file, lineOf(css, match.index), `${match[2]}: ${match[3].trim()}`);
      }
    }
  }
  // Point de rupture écrit en dur (48rem, 1001px) : il ne suit pas les tokens, et diffère s'ils sont redéfinis
  if (!isTokens && file !== project.theme) {
    for (const match of css.matchAll(/@media[^{]*\b(?:min-width|max-width|width\s*[<>]=?)\s*:?\s*(\d+(?:\.\d+)?(?:px|rem|em))/g)) {
      add('breakpoint-literal', file, lineOf(css, match.index), match[0].trim());
    }
  }
  // --spacing(8) demande la variable --spacing du thème, retirée par une échelle restreinte : build cassé
  if (spacingRestricted) {
    for (const match of css.matchAll(/--spacing\(([^)]*)\)/g)) add('off-scale', file, lineOf(css, match.index), `${match[0]} → var(--spacing-${match[1].trim()})`);
  }
  for (const match of css.matchAll(/@apply\s+([^;]+);/g)) {
    for (const token of match[1].split(/\s+/).filter(Boolean)) {
      const base = token.split(':').pop().replace(/^!/, '');
      if (token.includes('[')) add('arbitrary-apply', file, lineOf(css, match.index), token);
      else if (PALETTE.test(base)) add('palette-class', file, lineOf(css, match.index), token);
      else if (mutedIsText && MUTED_SURFACE.test(base)) add('muted-background', file, lineOf(css, match.index), token);
      else if (offScale(token)) add('off-scale', file, lineOf(css, match.index), token);
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
        // data-state, et les attributs que Radix pose sans équivalent ARIA (côté et alignement d'un calque, valeur
        // absente d'un Select), restent permis
        if (dataSelector.test(prelude)) add('data-selector', file, lineOf(css, i), prelude);
        if (/\[data-(slot|variant|size)\b/.test(prelude)) add('data-attribute', file, lineOf(css, i), prelude);
        if (inside(file, project.src) && file !== project.theme) {
          // Classe définie : la première du sujet de chaque sélecteur (dernier composé). Dans .card-header.border-b,
          // border-b est un utilitaire ; dans .group[data-disabled] .label ou .card-content .calendar, l'ancêtre est
          // le contexte, pas la classe définie
          for (const cls of definedBy(prelude)) {
            // Une classe du design system reprise par un bloc partagé (.card.post-card-dark) garde sa définition
            const known = definedClasses.get(cls);
            const inBlock = (f) => project.components !== project.ui && inside(f, project.components);
            if (!known || (inBlock(known.file) && !inBlock(file))) definedClasses.set(cls, { file, line: lineOf(css, i) });
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
// `group` : sous-dossier qui regroupe des composants à plat (registre ai-elements de shadcn), pas un composant
const scanComponents = (dir, group = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name) && !entry.name.includes('.stories.') && !entry.name.includes('.test.')) {
      add('flat-component', path, 1, `node rehome.mjs <app-dir> ${group}${entry.name.replace(/\.(tsx|jsx)$/, '')}`);
    }
    if (!entry.isDirectory()) continue;
    const files = readdirSync(path);
    const sources = files.filter((f) => /\.(tsx|jsx)$/.test(f) && !f.includes('.stories.') && !f.includes('.test.'));
    if (!sources.length) continue;
    const hasIndex = files.includes('index.ts') || files.includes('index.tsx');
    if (!group && !hasIndex && sources.length > 1 && !sources.some((f) => f.startsWith(`${entry.name}.`))) {
      scanComponents(path, `${entry.name}/`);
      continue;
    }
    if (!hasIndex) add('missing-index', path, 0, `${group}${entry.name}`);
    if (!files.some((f) => f.includes('.stories.'))) add('missing-story', path, 0, `${group}${entry.name}`);
  }
};
for (const dir of shared) scanComponents(dir);
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
/** Titre du fichier d'histoires : `<Meta title>` d'une page MDX, ou clé `title` au premier niveau de l'objet meta
 * (pas la prop `title` d'un composant dans `args`). Sans titre, Storybook le tire du chemin : rien à vérifier. */
function storyTitle(code) {
  const mdx = code.match(/<Meta[^>]*\btitle\s*=\s*["'`]([^"'`]+)["'`]/);
  if (mdx) return mdx[1];
  const start = code.search(/\bconst meta\b[^=]*=\s*\{|\bexport default\s*\{/);
  if (start < 0) return null;
  let depth = 0;
  for (let i = code.indexOf('{', start); i < code.length; i++) {
    const char = code[i];
    if (char === '{' || char === '[' || char === '(') depth++;
    else if (char === '}' || char === ']' || char === ')') {
      if (--depth === 0) return null;
    } else if (depth === 1 && /\btitle\s*:/y.test(code.slice(i, i + 40)) && /[\s,{]/.test(code[i - 1])) {
      return code.slice(i).match(/^title\s*:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? null;
    }
  }
  return null;
}
for (const file of codeFiles) {
  if (!/\.stories\.[jt]sx?$|\.mdx$/.test(file)) continue;
  const code = read(file);
  // Donnée exportée par un fichier d'histoires (const postCardArgs) : Storybook en fait une histoire de plus
  if (/\.stories\.[jt]sx?$/.test(file) && !/excludeStories/.test(code)) {
    for (const m of code.matchAll(/^export const ([a-z]\w*)/gm)) add('story-export', file, lineOf(code, m.index), m[1]);
  }
  const todo = code.match(/a11y\s*:\s*\{[^}]*test\s*:\s*['"]todo['"]/);
  if (todo) add('a11y-todo', file, lineOf(code, todo.index), 'todo');
  const title = storyTitle(code);
  const section = expectedSection(file);
  if (title && section && !title.startsWith(`${section}/`)) add('story-section', file, lineOf(code, code.indexOf(title)), `"${title}" → ${section}/…`);
}

// ---------- Échelles des tokens ----------
for (const file of [project.tokens, project.theme].filter((f, i, all) => f && all.indexOf(f) === i)) {
  const css = stripCssComments(read(file));
  for (const m of css.matchAll(/@media[^{]*\{\s*:root\s*\{([^}]*)\}/g)) {
    for (const v of m[1].matchAll(/(--[\w-]+)\s*:/g)) add('responsive-token', file, lineOf(css, m.index), v[1]);
  }
}
if (project.tokens) {
  const css = `${read(project.tokens)}\n${read(project.theme)}`;
  for (const family of ['spacing', 'text']) {
    if (!new RegExp(`--${family}-\\*\\s*:\\s*initial`).test(css)) add('unrestricted-scale', project.tokens, 1, `--${family}-*`);
  }
}

// ---------- React 18 : les composants de shadcn reçoivent la ref en prop (React 19) ----------
// En React 18, une fonction ne reçoit pas `ref` : le champ d'une combobox (downshift, react-hook-form) ou le déclencheur
// d'un calque perd la sienne, sans erreur au build
const reactMajor = Number(String(project.deps.react ?? '').replace(/^[^\d]*/, '').split('.')[0]);
if (reactMajor && reactMajor < 19 && isDir(project.ui)) {
  for (const file of codeFiles.filter((f) => inside(f, project.ui) && f.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(f))) {
    const code = read(file);
    // Props du composant lui-même (pas d'une prop) : un contrôle natif, ou la primitive d'un contrôle ou d'un déclencheur
    const control = code.match(
      /\}\s*:\s*(?:React\.)?ComponentProps<'(input|textarea|button|select)'>|\}\s*:\s*\w*(Input|Textarea|Button|Select|Checkbox|Switch|Radio|Toggle|Trigger)\w*Primitive(\.\w+)?\.Props\b/,
    );
    if (control && /export (function|const) [A-Z]/.test(code) && !/forwardRef/.test(code)) add('react18-ref', file, lineOf(code, control.index), control[0]);
  }
}

// ---------- cn() : tailwind-merge doit connaître les tokens des échelles ----------
// Sans configuration, `text-compact` est pris pour une couleur : cn('text-compact', 'text-ink') supprime la taille, et
// cn('h-control', 'h-row') garde les deux. La fonction de components.json (aliases.utils) les déclare.
// Une application qui consomme le paquet du design system : la fonction cn est celle du paquet, auditée avec lui
if (project.tokens && !project.designSystemPackage) {
  const tokensCss = read(project.tokens);
  const TAILWIND_TEXT = /^(xs|sm|base|lg|xl|[2-9]xl)$/;
  const names = (family) => [...tokensCss.matchAll(new RegExp(`^\\s*--${family}-([a-z][\\w-]*)\\s*:`, 'gm'))].map((m) => m[1]).filter((n) => !n.includes('--'));
  const custom = [
    ...names('text').filter((n) => !TAILWIND_TEXT.test(n)).map((n) => `text-${n}`),
    ...names('spacing').filter((n) => n !== 'px').map((n) => `spacing-${n}`),
  ];
  // Alias de l'application (@/lib/utils) ou du paquet du design system (@acme/ui/utils → src/utils)
  const pkgName = readJsonc(join(project.root, 'package.json'))?.name;
  const alias = project.cnImport.startsWith('@/')
    ? project.cnImport.slice(2)
    : pkgName && project.cnImport.startsWith(`${pkgName}/`)
      ? project.cnImport.slice(pkgName.length + 1)
      : null;
  // Sans components.json : le fichier du projet qui exporte `cn`
  const helper =
    (alias && ['.ts', '.tsx', '.js', '/index.ts'].map((ext) => join(project.src, `${alias}${ext}`)).find(existsSync)) ||
    codeFiles.find((file) => /export\s+(const|function)\s+cn\b/.test(read(file)));
  const helperText = read(helper);
  const configured = /extendTailwindMerge|extendTailwindMerge\(|twMergeConfig/.test(helperText);
  // tailwind-merge 2 est écrit pour Tailwind v3 : il ne connaît ni la syntaxe ni les familles de la v4
  const mergeVersion = readJsonc(join(project.root, 'node_modules', 'tailwind-merge', 'package.json'))?.version;
  if (mergeVersion && Number(mergeVersion.split('.')[0]) < 3) add('merge-config', helper ?? project.root, 1, `tailwind-merge ${mergeVersion}: version 3 or later for Tailwind v4`);
  for (const name of custom) {
    const bare = name.replace(/^(text|spacing)-/, '');
    if (!configured || !new RegExp(`['"]${bare}['"]`).test(helperText)) add('merge-config', helper ?? project.tokens, 1, name);
  }
}

// ---------- Documentation : classes absentes de la page Classes ----------
const classesPage = walk(project.docs, ['.mdx']).find((file) => /classes/i.test(basename(file)));
// Classes posées par du HTML qui n'appartient pas au design system (markdown, service tiers) : `externalClasses` du lint
const externalBlock = lintConfigText(project).match(/externalClasses\s*:\s*\[([\s\S]*?)\]\s*,?\s*\}/)?.[1] ?? '';
const externalClasses = [...externalBlock.replace(/\/\/[^\n]*/g, '').matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => new RegExp(`^(?:${m[1]})$`));
if (classesPage) {
  const page = read(classesPage);
  // Classes racines seulement : btn-primary est documentée avec btn
  const names = [...definedClasses.keys()];
  for (const [name, where] of definedClasses) {
    if (names.some((other) => other !== name && name.startsWith(`${other}-`))) continue;
    if (externalClasses.some((pattern) => pattern.test(name))) continue;
    // Classes d'un bloc partagé : documentées par l'histoire du bloc, pas par la page Classes du design system
    if (project.components !== project.ui && inside(where.file, project.components)) continue;
    if (!new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(page)) add('undocumented-class', where.file, where.line, name);
  }
}

// ---------- Documentation : exemples qui existent ----------
// Les conventions et les pages MDX viennent de gabarits : leurs exemples (form-input, text-caption, max-w-measure)
// doivent être remplacés par ceux du projet. Un nom cité entre accents graves est vérifié quand il a la forme d'une
// classe sémantique (pas de préfixe d'utilitaire) ou d'un utilitaire tiré d'un token (text-caption → --text-caption)
const conventionFiles = [join(project.repo, '.claude', 'rules', 'design-system.md'), join(project.repo, 'docs', 'design-system.md')].filter(existsSync);
// Une application qui consomme le paquet du design system laisse ce contrôle à l'audit du paquet
const docFiles = project.designSystemPackage ? [] : [...conventionFiles, ...walk(project.docs, ['.mdx'])];
if (docFiles.length) {
  const allCss = walk(project.repo, ['.css']).map((file) => stripCssComments(read(file))).join('\n');
  // Classes des feuilles, et utilitaires déclarés par @utility (body-s, focus-ring)
  const known = new Set([...allCss.matchAll(/\.([a-z][\w-]*)|@utility\s+([a-z][\w-]*)/g)].map((m) => m[1] ?? m[2]));
  const tokenNames = new Set([...`${read(project.tokens)}\n${read(project.theme)}`.matchAll(/--(?:color|text|container|spacing|radius|shadow|grid-template-columns|font)-([\w-]+)\s*:/g)].map((m) => m[1]));
  const UTILITY = /^-?(bg|text|border|ring|outline|fill|stroke|rounded|shadow|h|w|min-w|min-h|max-w|max-h|size|p[xytrblse]?|m[xytrblse]?|gap(-[xy])?|grid|grid-cols|grid-rows|col|row|flex|items|justify|self|place|font|leading|tracking|space-[xy]|inset(-[xy])?|top|left|right|bottom|z|opacity|aria|data|group|peer|not|has|in|translate-[xy]|scale|rotate|animate|transition|duration|ease|line-clamp|truncate|whitespace|break|overflow|object|aspect|cursor|select|pointer-events|sr|focus|hover|active|disabled|placeholder|decoration|underline|list|divide|backdrop|blur|from|via|to|order|basis|grow|shrink|table|caption|align|content|columns|scrollbar)(-|$)/;
  // Noms de Tailwind (échelle, mots-clés) que l'utilitaire peut prendre sans token
  const TAILWIND_WORDS = /^(xs|sm|md|lg|xl|[2-9]xl|base|none|full|auto|screen|min|max|fit|px|prose|inner|current|inherit|transparent|black|white|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|svh|lvh|dvh|lg|subgrid)$/;
  const isTokenUtility = (name) => {
    const m = name.match(/^-?(?:bg|text|border|ring|outline|fill|stroke|rounded|shadow|h|w|min-w|min-h|max-w|max-h|size|gap|grid-cols|font)-([a-z][a-z-]*)$/);
    return m ? !tokenNames.has(m[1]) && !TAILWIND_WORDS.test(m[1]) && !known.has(name) : false;
  };
  // Noms de dossiers et de fichiers du projet (design-system, ai-elements) : cités comme chemins, pas comme classes
  const pathNames = new Set(codeFiles.concat(cssFiles).flatMap((file) => relative(project.repo, file).split(sep).map((part) => part.replace(/\.[\w.]+$/, ''))));
  // Nom de paquet (dépendance, paquet installé, lien vers sa page, ligne qui parle d'une bibliothèque) : pas une classe
  const isPackage = (name, text, index) => {
    const line = text.slice(text.lastIndexOf('\n', index) + 1, text.indexOf('\n', index) >>> 0);
    return Boolean(project.deps[name]) || existsSync(join(project.root, 'node_modules', name)) || text.startsWith('](', index + name.length + 2) || /librar|package|paquet|biblioth|npm/i.test(line);
  };
  for (const file of docFiles) {
    const text = read(file);
    for (const m of text.matchAll(/_À compléter[^_\n]*_/g)) add('doc-placeholder', file, lineOf(text, m.index), m[0].slice(0, 60));
    for (const m of text.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g)) {
      const name = m[1];
      if (isPackage(name, text, m.index)) continue;
      const semantic = !UTILITY.test(name) && !known.has(name) && !pathNames.has(name) && !/^(use|on|aria|data|eslint|prefers)-/.test(name);
      // Un nom de paquet, d'option ou de fichier n'est pas une classe : seulement s'il apparaît comme classe ailleurs
      // dans la page (className, liste de classes) ou s'il a la forme d'un utilitaire de token
      if ((semantic && /^[a-z]+(-[a-z]+){0,2}$/.test(name) && definedClasses.size && !tokenNames.has(name)) || isTokenUtility(name)) {
        add('doc-unknown-name', file, lineOf(text, m.index), name);
      }
    }
  }
}

// ---------- Outillage ----------
const lint = lintConfigText(project);
const tokensCount = project.tokens ? (read(project.tokens).match(/^\s*--[\w-]+\s*:/gm) ?? []).length : 0;
const uiCount = isDir(project.ui)
  ? readdirSync(project.ui, { withFileTypes: true }).filter((e) => e.isDirectory() && ['index.ts', 'index.tsx'].some((f) => existsSync(join(project.ui, e.name, f)))).length
  : 0;
const storiesCount = codeFiles.filter((f) => /\.stories\.[jt]sx?$/.test(f)).length;
const preview = project.storybook ? walk(project.storybook, ['.ts', '.tsx', '.js', '.jsx']).map(read).join('\n') : '';
const layout = {
  entry: rel(project, project.entry),
  tokens: project.tokens
    ? `${rel(project, project.tokens)} (${tokensCount} tokens${project.tokensInTheme ? ', in theme.css: move them to tokens.css' : ''})`
    : 'none',
  theme: rel(project, project.theme),
  components: project.componentsCss ? `${rel(project, project.componentsCss)} (${(read(project.componentsCss).match(/@import/g) ?? []).length} imports)` : 'none',
  ui: isDir(project.ui) ? `${rel(project, project.ui)} (${uiCount} component folders)` : 'none',
  ...(project.designSystemPackage && {
    package: `${rel(project, project.designSystemPackage)}: design system of a workspace package, audit it there`,
  }),
  storybook: project.storybook ? `${storiesCount} stories, a11y ${/a11y[\s\S]{0,80}test:\s*['"]error['"]/.test(preview) ? 'blocking' : 'not blocking'}` : 'none',
  lint: /better-tailwindcss/.test(lint)
    ? `better-tailwindcss${/no-restricted-classes/.test(lint) ? ', arbitrary values blocked' : ', arbitrary values allowed'}${/no-unknown-classes/.test(lint) ? ', unknown classes' : ''}`
    : /eslint-plugin-tailwindcss/.test(lint)
      ? 'eslint-plugin-tailwindcss: replace it with the better-tailwindcss fragment (references/setup.md)'
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
// exitCode plutôt que exit() : un rapport JSON envoyé dans un pipe serait coupé à 64 Ko
process.exitCode = options.strict && counts.error ? 1 : 0;

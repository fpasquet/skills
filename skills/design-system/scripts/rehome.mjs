#!/usr/bin/env node
/**
 * Range un composant ajouté par la CLI de shadcn/ui (un fichier à plat dans ui/) selon les conventions du skill, et
 * prépare sa réécriture en classes sémantiques :
 *
 *   ui/dialog.tsx  →  ui/dialog/dialog.tsx, dialog-content.tsx… (un fichier par composant), index.ts, dialog.css
 *
 * - chaque composant va dans son fichier, exporté ; une constante (cva…) ou un type va avec le seul composant qui
 *   s'en sert, sinon avec le composant principal ; les imports sont réduits à ce que chaque fichier utilise ;
 * - les attributs data-slot, data-variant et data-size sont retirés ;
 * - les listes de classes utilitaires deviennent des classes sémantiques (`dialog-content`, variantes de cva en
 *   classes de modificateur `btn-outline`), et leurs utilitaires passent dans un premier jet de `<nom>.css` :
 *   `@apply` pour les classes simples, sélecteurs pour data-[state=open]:, [&_svg]:, has-[>svg]:, CSS standard pour
 *   les valeurs arbitraires connues, commentaire TODO pour le reste ; règle prefers-reduced-motion si ça s'anime ;
 * - la feuille est ajoutée à components.css.
 *
 * Le résultat est un premier jet à relire : noms des classes et des variantes (default → primary, destructive →
 * danger), couleurs de shadcn à remplacer par les tokens si besoin, TODO, textes à traduire, histoire à écrire.
 *
 * Usage : node rehome.mjs <app-dir> <component> [--class <prefix>] [--keep-classes] [--dry-run] [--ui <dir>]
 *   --class         préfixe des classes (par défaut le nom du composant : --class btn pour button)
 *   --keep-classes  range seulement, sans toucher aux classes (composant déjà réécrit, ou réécriture à la main)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { detectProject, isDir, kebab, parseArgs, pascal, rel } from './project.mjs';

const { options, positional } = parseArgs(process.argv.slice(2), ['dry-run', 'keep-classes']);
const [appDir, name] = positional;
if (!appDir || !name || !isDir(appDir)) {
  console.error('Usage: node rehome.mjs <app-dir> <component> [--class <prefix>] [--keep-classes] [--dry-run] [--ui <dir>]');
  process.exit(2);
}
const project = detectProject(appDir, options);
const source = [join(project.ui, `${name}.tsx`), join(project.ui, `${name}.jsx`)].find(existsSync);
const folder = join(project.ui, name);
if (!source) {
  console.error(`${rel(project, join(project.ui, `${name}.tsx`))} not found: add the component with the shadcn CLI first.`);
  process.exit(1);
}
if (existsSync(folder)) {
  console.error(
    `${rel(project, folder)}/ already exists. The new version stays in ${rel(project, source)} for comparison: report its changes by hand, then delete it.`,
  );
  process.exit(1);
}
const code = readFileSync(source, 'utf8');
const ext = source.endsWith('.jsx') ? '.jsx' : '.tsx';
const quote = code.includes("from '") ? "'" : '"';
const prefix = options.class ?? name;
const todos = [];
const classMap = [];

// ---------- En-tête : directive et imports ----------
let rest = code;
const directive = rest.match(/^\s*(["'])use client\1;?[^\S\n]*\n/)?.[0].trim() ?? null;
if (directive) rest = rest.replace(/^\s*(["'])use client\1;?[^\S\n]*\n/, '');
const imports = [];
for (;;) {
  const match = rest.match(/^\s*import\s([\s\S]*?)\sfrom\s*(["'])([^"']+)\2;?[^\S\n]*\n/) ?? rest.match(/^\s*import\s*(["'])([^"']+)\1;?[^\S\n]*\n/);
  if (!match) break;
  rest = rest.slice(match[0].length);
  if (match.length === 3) {
    imports.push({ side: true, from: match[2], specifiers: [] });
    continue;
  }
  let clause = match[1].trim();
  const typeOnly = clause.startsWith('type ');
  if (typeOnly) clause = clause.slice(5).trim();
  const entry = { from: match[3], typeOnly, defaultName: null, namespace: null, named: [] };
  const named = clause.match(/\{([\s\S]*)\}/);
  const head = clause.replace(/\{[\s\S]*\}/, '').replace(/,\s*$/, '').trim();
  if (head.startsWith('* as ')) entry.namespace = head.slice(5).trim();
  else if (head) entry.defaultName = head.replace(/,$/, '').trim();
  if (named) {
    for (const part of named[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const local = part.replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim();
      entry.named.push({ text: part, local });
    }
  }
  if (project.cnImport === 'cn' && entry.named.some((n) => n.local === 'cn') && entry.from !== 'cn' && entry.named.length === 1) entry.from = 'cn';
  imports.push(entry);
}

// ---------- Corps : un morceau par déclaration de premier niveau ----------
const DECLARATION = /^(export\s+)?(default\s+)?(async\s+)?(function|const|let|type|interface|class|enum)\s+([A-Za-z_$][\w$]*)/;
const chunks = [];
let pending = [];
let current = null;
const exported = new Set();
const lines = rest.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^export\s*\{/.test(line)) {
    // Liste finale d'exports : noms à garder exportés
    let block = line;
    while (!block.includes('}') && i + 1 < lines.length) block += `\n${lines[++i]}`;
    for (const part of block.replace(/^export\s*\{|\}.*$/gs, '').split(',')) {
      const exportedName = part.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (exportedName) exported.add(exportedName);
    }
    current = null;
    continue;
  }
  const declaration = line.match(DECLARATION);
  if (declaration) {
    current = { name: declaration[5], kind: declaration[4], lines: [...pending, line] };
    if (declaration[1]) exported.add(declaration[5]);
    pending = [];
    chunks.push(current);
  } else if (/^\s*(\/\/|\/\*|\*)/.test(line) && (!current || /^(\/\/|\/\*)/.test(line))) {
    pending.push(line);
    current = /^(\/\/|\/\*)/.test(line) ? null : current;
  } else if (current) current.lines.push(line);
  else if (line.trim()) pending.push(line);
}
for (const chunk of chunks) {
  chunk.text = chunk.lines.join('\n').replace(/\s+$/, '');
  chunk.component = /^[A-Z]/.test(chunk.name) && (chunk.kind === 'function' || chunk.kind === 'const');
}
const components = chunks.filter((c) => c.component);
if (!components.length) {
  console.error(`No component found in ${rel(project, source)}.`);
  process.exit(1);
}
const main = components.find((c) => kebab(c.name) === name) ?? components[0];
const uses = (text, identifier) => new RegExp(`(^|[^\\w$.])${identifier.replace('$', '\\$')}([^\\w$]|$)`).test(text);
const bodyOf = (chunk) => chunk.text.split('\n').slice(1).join('\n');

// Fichier de chaque déclaration
for (const chunk of chunks) {
  if (chunk.component) chunk.file = chunk === main ? name : kebab(chunk.name);
  else {
    const users = components.filter((c) => uses(c.text, chunk.name));
    chunk.owner = users.length === 1 ? users[0] : main;
    chunk.file = chunk.owner === main ? name : kebab(chunk.owner.name);
  }
}
const classOf = (component) => {
  const base = kebab(component.name);
  const mainBase = kebab(main.name);
  return base === mainBase ? prefix : base.startsWith(`${mainBase}-`) ? `${prefix}-${base.slice(mainBase.length + 1)}` : base;
};

// ---------- Classes : utilitaires → classe sémantique + règles CSS ----------
const css = new Map(); // sélecteur → { apply: [], declarations: [], todo: [] }
const rule = (selector) => {
  if (!css.has(selector)) css.set(selector, { apply: [], declarations: [], todo: [] });
  return css.get(selector);
};
const ARBITRARY_CSS = {
  w: 'width',
  h: 'height',
  'min-w': 'min-width',
  'max-w': 'max-width',
  'min-h': 'min-height',
  'max-h': 'max-height',
  top: 'top',
  left: 'left',
  right: 'right',
  bottom: 'bottom',
  gap: 'gap',
  'grid-cols': 'grid-template-columns',
  'grid-rows': 'grid-template-rows',
};
const FRACTIONS = { 'top-[50%]': 'top-1/2', 'left-[50%]': 'left-1/2', 'translate-x-[-50%]': '-translate-x-1/2', 'translate-y-[-50%]': '-translate-y-1/2' };

/** Découpe « a:[&_svg]:b-[x:y] » sur les « : » hors crochets. */
function splitVariants(token) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === '[') depth++;
    else if (token[i] === ']') depth--;
    else if (token[i] === ':' && depth === 0) {
      parts.push(token.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(token.slice(start));
  return parts;
}
// Valeur arbitraire en CSS : « _ » est une espace, et Tailwind espace les opérateurs de calc()
const unescape = (value) =>
  value.replace(/_/g, ' ').replace(/(calc|min|max|clamp)\(([^)]*)\)/g, (_, fn, inner) => `${fn}(${inner.replace(/([\d%)])([+-])(?=[\d(.a-z])/gi, '$1 $2 ')})`);

/**
 * `modifiers` : attributs data-* du composant qui deviennent des classes de modificateur ({ size: 'select-trigger' } :
 * data-[size=sm]: → .select-trigger.select-trigger-sm).
 */
function addUtilities(selector, utilities, modifiers = {}) {
  for (const token of utilities.split(/\s+/).filter(Boolean)) {
    const parts = splitVariants(token);
    let base = parts.pop();
    let suffix = '';
    const kept = [];
    let unsupported = false;
    for (const variant of parts) {
      let match;
      if ((match = variant.match(/^data-\[([\w-]+)=([^\]]+)\]$/)) && modifiers[match[1]]) suffix += `.${modifiers[match[1]]}-${match[2]}`;
      else if (match) suffix += `[data-${match[1]}='${match[2]}']`;
      else if ((match = variant.match(/^data-\[([\w-]+)\]$/))) suffix += `[data-${match[1]}]`;
      else if ((match = variant.match(/^aria-\[([\w-]+)=([^\]]+)\]$/))) suffix += `[aria-${match[1]}='${match[2]}']`;
      else if ((match = variant.match(/^has-\[(.+)\]$/))) suffix += `:has(${unescape(match[1]).replace(/^>/, '> ')})`;
      else if ((match = variant.match(/^\[&(.+)\]$/))) suffix += unescape(match[1]).replace(/^>/, ' > ').replace(/^([^ :[.])/, ' $1');
      else if (/[[\]]|^(group|peer|in|\*|supports)/.test(variant)) unsupported = true;
      else kept.push(variant);
    }
    if (FRACTIONS[base]) base = FRACTIONS[base];
    // Largeur en pixels qui existe dans l'échelle : ring-[3px] → ring-3
    base = base.replace(/^(ring|border|outline|ring-offset)-\[(\d)px\]$/, '$1-$2');
    if (unsupported) {
      rule(selector).todo.push(token);
      continue;
    }
    const target = rule(`${selector}${suffix}`);
    const arbitrary = base.match(/^(-?)([\w-]+?)-\[(.+)\]$/);
    if (arbitrary) {
      const property = ARBITRARY_CSS[arbitrary[2]];
      if (property && !kept.length && !arbitrary[1]) target.declarations.push(`${property}: ${unescape(arbitrary[3])};`);
      else target.todo.push(token);
      continue;
    }
    if (base.includes('[')) {
      target.todo.push(token);
      continue;
    }
    target.apply.push([...kept, base].join(':'));
  }
}

/** Nom de la partie à partir de la balise : DialogPrimitive.Close → close, XIcon → icon, span → span. */
function partName(tag) {
  const last = tag.split('.').pop();
  if (/Icon$/.test(last) || /^[A-Z]\w*Icon$/.test(last)) return 'icon';
  return kebab(last);
}

if (!options['keep-classes']) {
  // cva : base et valeurs des variantes
  for (const chunk of chunks.filter((c) => !c.component && /\bcva\(/.test(c.text))) {
    const owner = chunk.owner ?? main;
    const cls = classOf(owner);
    let text = chunk.text;
    const call = text.indexOf('cva(');
    const baseMatch = text.slice(call).match(/^cva\(\s*(["'`])([\s\S]*?)\1/);
    if (baseMatch) {
      addUtilities(`.${cls}`, baseMatch[2]);
      text = text.slice(0, call) + text.slice(call).replace(baseMatch[0], `cva(${quote}${cls}${quote}`);
      classMap.push([`${owner.name} (cva base)`, cls]);
    }
    // Objet `variants: { … }` seul (pas defaultVariants ni compoundVariants), accolades équilibrées
    const variantsAt = text.search(/[\s{,]variants\s*:\s*\{/);
    if (variantsAt >= 0) {
      const open = text.indexOf('{', variantsAt);
      let depth = 0;
      let close = open;
      for (; close < text.length; close++) {
        if (text[close] === '{') depth++;
        else if (text[close] === '}' && --depth === 0) break;
      }
      const used = new Set();
      text =
        text.slice(0, open) +
        text.slice(open, close + 1).replace(/(\n\s*)(\w+):\s*\{([\s\S]*?)\n\s*\},?/g, (group, indent, groupName, body) => {
          if (groupName === 'variants') return group;
          const replaced = body.replace(/(\n\s*)("?[\w-]+"?):\s*\n?\s*(["'`])([\s\S]*?)\3/g, (entry, space, key, q, utilities) => {
            const clean = key.replace(/"/g, '');
            if (!utilities.trim()) return entry;
            let modifier = `${cls}-${clean}`;
            if (used.has(modifier)) modifier = `${cls}-${groupName}-${clean}`;
            used.add(modifier);
            addUtilities(`.${modifier}`, utilities);
            classMap.push([`${groupName}=${clean}`, modifier]);
            return `${space}${key}: ${quote}${modifier}${quote}`;
          });
          return group.replace(body, replaced);
        }) +
        text.slice(close + 1);
    }
    chunk.text = text;
  }
  // className={cn("…", className)} et className="…" dans les composants
  for (const chunk of components) {
    const cls = classOf(chunk);
    const parts = new Map();
    let rootDone = false;
    // data-size={size}, data-variant={variant} : la variante devient une classe de modificateur (select-trigger-sm)
    const dataModifiers = [...chunk.text.matchAll(/\sdata-(size|variant)=\{([\w.]+)\}/g)].map((m) => ({ attribute: m[1], expression: m[2] }));
    const modifiers = Object.fromEntries(dataModifiers.map((m) => [m.attribute, cls]));
    chunk.text = chunk.text.replace(
      /className=(?:\{cn\(\s*(["'`])([\s\S]*?)\1|"([^"]*)"|'([^']*)')/g,
      (match, q1, cnUtilities, doubleQuoted, singleQuoted, offset, whole) => {
        const plainUtilities = doubleQuoted ?? singleQuoted;
        const utilities = cnUtilities ?? plainUtilities;
        if (utilities.includes('${') || utilities.trim().split(/\s+/).length < 2) return match;
        const tag = whole.slice(0, offset).match(/<([\w.]+)[^<]*$/)?.[1] ?? 'part';
        let className = cls;
        if (rootDone || !cnUtilities) {
          const part = partName(tag);
          const base = `${cls}-${part}`;
          parts.set(base, (parts.get(base) ?? 0) + 1);
          className = parts.get(base) > 1 ? `${base}-${parts.get(base)}` : base;
        }
        const isRoot = className === cls;
        if (cnUtilities !== undefined) rootDone = true;
        addUtilities(`.${className}`, utilities, isRoot ? modifiers : {});
        classMap.push([`${chunk.name}${isRoot ? '' : ` <${tag}>`}`, className]);
        const extra = isRoot ? dataModifiers.map((m) => `, \`${className}-\${${m.expression}}\``).join('') : '';
        if (extra) for (const m of dataModifiers) classMap.push([`${chunk.name} data-${m.attribute}={${m.expression}}`, `${className}-<${m.expression}>`]);
        return cnUtilities !== undefined ? `className={cn(${quote}${className}${quote}${extra}` : `className=${quote}${className}${quote}`;
      },
    );
  }
}

// data-slot, data-variant, data-size
for (const chunk of chunks) chunk.text = chunk.text.replace(/\s+data-(?:slot|variant|size)=(?:"[^"]*"|'[^']*'|\{[^}]*\})/g, '');

// ---------- Fichiers ----------
const files = new Map();
for (const chunk of chunks) {
  if (!files.has(chunk.file)) files.set(chunk.file, []);
  files.get(chunk.file).push(chunk);
}
const definedIn = new Map(chunks.map((c) => [c.name, c.file]));
const output = new Map();
const exportsOf = new Map();
for (const [file, list] of files) {
  const body = list
    .map((chunk) => {
      const needsExport = chunk.component || exported.has(chunk.name) || chunks.some((other) => other.file !== file && uses(other.text, chunk.name));
      if (needsExport) exportsOf.set(file, [...(exportsOf.get(file) ?? []), chunk.name]);
      return needsExport && !/^export\s/.test(chunk.text.split('\n').find((l) => DECLARATION.test(l)) ?? '')
        ? chunk.text.replace(/^((?:\s*(?:\/\/|\/\*|\*).*\n)*)(?=(?:async\s+)?(?:function|const|let|type|interface|class|enum)\s)/, '$1export ')
        : chunk.text;
    })
    .join('\n\n');
  const header = [];
  for (const entry of imports) {
    if (entry.side) {
      header.push(`import ${quote}${entry.from}${quote}`);
      continue;
    }
    const named = entry.named.filter((n) => uses(body, n.local));
    const keepDefault = entry.defaultName && uses(body, entry.defaultName);
    const keepNamespace = entry.namespace && new RegExp(`\\b${entry.namespace}\\.`).test(body);
    if (!named.length && !keepDefault && !keepNamespace) continue;
    const clause = [keepNamespace ? `* as ${entry.namespace}` : keepDefault ? entry.defaultName : null, named.length ? `{ ${named.map((n) => n.text).join(', ')} }` : null]
      .filter(Boolean)
      .join(', ');
    header.push(`import ${entry.typeOnly ? 'type ' : ''}${clause} from ${quote}${entry.from}${quote}`);
  }
  const siblings = new Map();
  for (const [identifier, otherFile] of definedIn) {
    if (otherFile === file || !uses(body, identifier)) continue;
    siblings.set(otherFile, [...(siblings.get(otherFile) ?? []), identifier]);
  }
  for (const [otherFile, names] of siblings) header.push(`import { ${names.sort().join(', ')} } from ${quote}./${otherFile}${quote}`);
  output.set(`${file}${ext}`, `${directive ? `${directive}\n\n` : ''}${header.join('\n')}\n\n${body}\n`);
}
const indexLines = [...exportsOf]
  .sort(([a], [b]) => (a === name ? -1 : b === name ? 1 : a.localeCompare(b)))
  .map(([file, names]) => `export { ${names.sort().join(', ')} } from './${file}';`);
output.set('index.ts', `${indexLines.join('\n')}\n`);

// Premier jet de la feuille de style
const cssLines = [`/* ${pascal(name)} : classes posées par le composant (premier jet de rehome.mjs, à relire). */`, '@layer components {'];
for (const [selector, { apply, declarations, todo }] of css) {
  if (!apply.length && !declarations.length && !todo.length) continue;
  cssLines.push(`  ${selector} {`);
  if (apply.length) cssLines.push(`    @apply ${[...new Set(apply)].join(' ')};`);
  for (const declaration of declarations) cssLines.push(`    ${declaration}`);
  for (const token of todo) {
    cssLines.push(`    /* TODO ${token} */`);
    todos.push(`${selector}: ${token}`);
  }
  cssLines.push('  }');
}
cssLines.push('}');
const animated = [...css].filter(([, r]) => r.apply.some((u) => /animate-|zoom-|fade-|slide-/.test(u))).map(([selector]) => selector.match(/^\.[\w-]+/)[0]);
if (animated.length) {
  cssLines.push('', '/* Moins de mouvement demandé par le système : apparition sans animation. */', '@media (prefers-reduced-motion: reduce) {');
  cssLines.push(`  ${[...new Set(animated)].join(',\n  ')} {`, '    animation: none;', '  }', '}');
}
if (!options['keep-classes']) output.set(`${name}.css`, `${cssLines.join('\n')}\n`);

// Classes restées dans le TSX (conditionnelles, calculées) : à transformer en classes de modificateur
const leftovers = [];
if (!options['keep-classes']) {
  for (const [file, content] of output) {
    if (!/\.[jt]sx$/.test(file)) continue;
    for (const match of content.matchAll(/(["'`])([^"'`\n]*)\1/g)) {
      const tokens = match[2].trim().split(/\s+/);
      const utility = (t) => /^[\w-]*[a-z]-[\w./[\]%-]+$|^[\w-]+:[\w[\]=&>*.()/%-]+$|\[/.test(t);
      if (tokens.length >= 2 && tokens.every(utility) && !/^(\.|@|\/)/.test(match[2])) leftovers.push(`${file}: ${match[2].trim()}`);
    }
  }
}

// Textes en dur à passer par les messages du projet
const texts = [];
for (const [file, content] of output) {
  for (const match of content.matchAll(/>\s*([A-Z][A-Za-z]+(?: [A-Za-z]+)*)\s*</g)) texts.push(`${file}: "${match[1]}"`);
}

// ---------- Écriture ----------
const relFolder = rel(project, folder);
if (options['dry-run']) {
  for (const [file, content] of output) console.log(`\n=== ${relFolder}/${file}\n${content}`);
} else {
  mkdirSync(folder, { recursive: true });
  for (const [file, content] of output) writeFileSync(join(folder, file), content);
  rmSync(source);
  if (project.componentsCss && !options['keep-classes']) {
    const sheet = readFileSync(project.componentsCss, 'utf8');
    const target = relative(dirname(project.componentsCss), join(folder, `${name}.css`)).split('\\').join('/');
    const line = `@import '${target.startsWith('.') ? target : `./${target}`}';`;
    if (!sheet.includes(line)) {
      const uiImports = [...sheet.matchAll(new RegExp(`^@import ['"][^'"]*/${relative(project.src, project.ui).split('\\').join('/')}/[^\\n]*$`, 'gm'))];
      // Après le dernier composant importé, sinon sous le commentaire « Composants » du gabarit
      const after = uiImports.at(-1) ?? sheet.match(/^\/\* Composants[^\n]*$/m);
      const updated = after ? `${sheet.slice(0, after.index + after[0].length)}\n${line}${sheet.slice(after.index + after[0].length)}` : `${sheet.trimEnd()}\n${line}\n`;
      writeFileSync(project.componentsCss, updated);
    }
  }
}

console.log(`${options['dry-run'] ? 'Would move' : 'Moved'} ${rel(project, source)} → ${relFolder}/ (${[...output.keys()].join(', ')})`);
if (classMap.length) {
  console.log('\nClasses (rename to the conventions: default → primary, destructive → danger, short prefix such as btn):');
  for (const [where, cls] of classMap) console.log(`  ${cls.padEnd(28)} ${where}`);
}
if (todos.length) {
  console.log(`\nTODO in ${name}.css (${todos.length}): arbitrary values or variants to rewrite with the scale, a token or standard CSS:`);
  for (const todo of todos) console.log(`  ${todo}`);
}
if (leftovers.length) {
  console.log('\nUtility classes left in the TSX (conditional or computed): turn them into modifier classes:');
  for (const leftover of leftovers) console.log(`  ${leftover}`);
}
if (texts.length) {
  console.log('\nHard-coded texts to move to the messages of the project:');
  for (const text of texts) console.log(`  ${text}`);
}
console.log(
  `\nNext: review ${name}.css (shadcn colours → tokens if needed), write ${name}.stories.tsx, run the formatter and the linter${project.componentsCss || options['keep-classes'] ? '' : ', import the stylesheet (no components.css found)'}.`,
);

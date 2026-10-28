#!/usr/bin/env node
/**
 * Range un composant ajouté par la CLI de shadcn/ui, ou promu depuis l'application (un fichier à plat dans ui/), selon les
 * conventions du skill, et prépare sa réécriture en classes sémantiques :
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
import { basename, dirname, join, relative } from 'node:path';
import { cssImports, detectProject, isDir, kebab, lintConfigText, parseArgs, pascal, rel, scaleChecker, shadcnTokenizer, walk } from './project.mjs';

const { options, positional } = parseArgs(process.argv.slice(2), ['dry-run', 'keep-classes']);
const [appDir, name] = positional;
if (!appDir || !name || !isDir(appDir)) {
  console.error('Usage: node rehome.mjs <app-dir> <component> [--class <prefix>] [--keep-classes] [--dry-run] [--ui <dir>]');
  process.exit(2);
}
const project = detectProject(appDir, options);
const source = [join(project.ui, `${name}.tsx`), join(project.ui, `${name}.jsx`)].find(existsSync);
// Fichier déjà dans son dossier (profiles-table/profiles-table.tsx) : découpé sur place, à côté de lui
const inPlace = Boolean(source) && basename(dirname(source)) === name.split('/').pop();
const folder = inPlace ? dirname(source) : join(project.ui, name);
if (!source) {
  console.error(`${rel(project, join(project.ui, `${name}.tsx`))} not found: add the component with the shadcn CLI first.`);
  process.exit(1);
}
if (!inPlace && existsSync(folder)) {
  console.error(
    `${rel(project, folder)}/ already exists. The new version stays in ${rel(project, source)} for comparison: report its changes by hand, then delete it.`,
  );
  process.exit(1);
}
const inPlaceImports = inPlace;
const code = readFileSync(source, 'utf8');
const ext = source.endsWith('.jsx') ? '.jsx' : '.tsx';
const quote = code.includes("from '") ? "'" : '"';
// Point-virgule en fin d'import, comme dans le fichier d'origine
const semi = /from\s*["'][^"']+["'];/.test(code) ? ';' : '';
// Composant d'un sous-dossier de registre (ai-elements/message) : le nom de fichier et de classe est la fin du chemin
const base = name.split('/').pop();
const prefix = options.class ?? base;
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
    const from = inPlaceImports ? match[2] : match[2].startsWith('./') ? `../${match[2].slice(2)}` : match[2].startsWith('../') ? `../${match[2]}` : match[2];
    imports.push({ side: true, from, specifiers: [] });
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
  // Styles récents de la CLI : `cn` importé du paquet, alors que le projet a sa fonction (aliases.utils de components.json)
  else if (project.cnImport !== 'cn' && entry.from === 'cn') entry.from = project.cnImport;
  // Les fichiers descendent d'un niveau (dans le dossier du composant) : ./shimmer devient ../shimmer
  if (!inPlaceImports && entry.from.startsWith('./')) entry.from = `../${entry.from.slice(2)}`;
  else if (!inPlaceImports && entry.from.startsWith('../')) entry.from = `../${entry.from}`;
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
  // Chat.displayName = 'Chat' : la ligne suit son composant, où qu'elle soit dans le fichier
  const property = line.match(/^([A-Z]\w*)\.(displayName|defaultProps)\s*=/);
  if (property && chunks.some((c) => c.name === property[1])) {
    chunks.find((c) => c.name === property[1]).lines.push(line);
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
  // PascalCase seulement : une constante en majuscules (SIDEBAR_WIDTH) n'est pas un composant
  chunk.component = /^[A-Z](?![A-Z0-9_]*$)/.test(chunk.name) && (chunk.kind === 'function' || chunk.kind === 'const');
}
const components = chunks.filter((c) => c.component);
if (!components.length) {
  console.error(`No component found in ${rel(project, source)}.`);
  process.exit(1);
}
const main = components.find((c) => kebab(c.name) === base) ?? components[0];
// Contenu des chaînes retiré, sauf les expressions ${…} des gabarits (`${DASHBOARD_PATHS.HOME}`)
const withoutStrings = (text) =>
  text
    // Réexport (export type { X } from '…') : il n'utilise pas l'import de X
    .replace(/^export (type )?\{[^}]*\} from[^\n]*$/gm, '')
    // Commentaires (JSDoc qui cite un composant) : ils n'utilisent rien
    .replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, (comment, before) => before ?? '')
    .replace(/(["'])(?:(?!\1)[^\\\n]|\\.)*\1|`(?:[^`\\]|\\.)*`/g, (literal) =>
    literal.startsWith('`') ? ` ${[...literal.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' ')} ` : '""',
  );
const uses = (text, identifier) => new RegExp(`(^|[^\\w$.])${identifier.replace('$', '\\$')}([^\\w$]|$)`).test(text);
const bodyOf = (chunk) => chunk.text.split('\n').slice(1).join('\n');

// Fichier de chaque déclaration
for (const chunk of chunks) {
  // Le fichier du composant principal porte le nom du dossier ; sans composant de ce nom, chacun porte le sien
  if (chunk.component) chunk.file = chunk === main && kebab(main.name) === base ? base : kebab(chunk.name);
  else {
    const users = components.filter((c) => uses(c.text, chunk.name));
    // Déclaration qu'aucun composant n'utilise mais qui en cite plusieurs (table des composants d'un rendu MDX) :
    // son propre fichier, sinon chacun importerait l'autre
    const cited = users.length ? [] : components.filter((c) => uses(chunk.text, c.name));
    if (cited.length > 1) {
      chunk.file = kebab(chunk.name);
      continue;
    }
    chunk.owner = users.length === 1 ? users[0] : (cited[0] ?? main);
    chunk.file = chunk.owner.file ?? (chunk.owner === main && kebab(main.name) === base ? base : kebab(chunk.owner.name));
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
  rounded: 'border-radius',
  m: 'margin',
  mx: 'margin-inline',
  my: 'margin-block',
  ml: 'margin-left',
  mr: 'margin-right',
  mt: 'margin-top',
  mb: 'margin-bottom',
  p: 'padding',
  px: 'padding-inline',
  py: 'padding-block',
  pl: 'padding-left',
  pr: 'padding-right',
  pt: 'padding-top',
  pb: 'padding-bottom',
};
// Pseudo-classes de group-* et peer-* (group-hover:, peer-disabled:) ; aria-* au sens de Tailwind (valeur true)
const PSEUDO = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'disabled', 'enabled', 'checked', 'invalid', 'required', 'placeholder-shown', 'first', 'last', 'open']);
/** Condition d'un variant group-…/peer-… : data-[k=v], has-[…], aria-x, pseudo-classe. */
// Variantes déclarées par shadcn/tailwind.css (styles récents de la CLI, Radix comme Base UI), que le projet n'importe
// pas : réécrites en sélecteurs sur les attributs que posent les primitives, ARIA d'abord
const SHADCN_VARIANTS = {
  'data-horizontal': "[data-orientation='horizontal']",
  'data-vertical': "[data-orientation='vertical']",
  'data-open': project.primitives === 'base' ? '[data-open]' : "[data-state='open']",
  'data-closed': project.primitives === 'base' ? '[data-closed]' : "[data-state='closed']",
  'data-checked': "[aria-checked='true']",
  'data-unchecked': "[aria-checked='false']",
  'data-selected': "[aria-selected='true']",
  'data-disabled': "[aria-disabled='true']",
  'data-active': ":is([aria-selected='true'], [aria-current='page'])",
};
function stateSelector(state, group) {
  let match;
  if (SHADCN_VARIANTS[state]) return SHADCN_VARIANTS[state];
  // data-variant / data-size retirés par le script : la classe de modificateur du composant qui les posait. Un groupe
  // nommé d'après une autre partie (group-data-[variant=outline]/field-group, variante que FieldLegend pose) : aucune
  // partie ne la porte, à revoir à la main
  if ((match = state.match(/^data-\[(variant|size)=([^\]]+)\]$/)) && fileModifiers[match[1]]) {
    const owner = group && markerOwners.get(group);
    return owner && owner !== fileModifiers[match[1]] ? null : `.${fileModifiers[match[1]]}-${match[2]}`;
  }
  if ((match = state.match(/^data-\[([\w-]+)=([^\]]+)\]$/))) return `[data-${match[1]}='${match[2]}']`;
  if ((match = state.match(/^data-\[([\w-]+)\]$/))) return `[data-${match[1]}]`;
  if ((match = state.match(/^aria-\[([\w-]+)=([^\]]+)\]$/))) return `[aria-${match[1]}='${match[2]}']`;
  if ((match = state.match(/^aria-([\w-]+)$/))) return `[aria-${match[1]}='true']`;
  if ((match = state.match(/^has-\[(.+)\]$/))) return `:has(${slotsToClasses(unescape(match[1])).replace(/^>/, '> ')})`;
  if ((match = state.match(/^has-data-\[([\w-]+)=([^\]]+)\]$/))) return `:has([data-${match[1]}='${match[2]}'])`;
  // group-[.is-user]: le groupe porte aussi cette classe
  if ((match = state.match(/^\[(\.[\w-]+)\]$/))) return match[1];
  if (PSEUDO.has(state)) return `:${{ first: 'first-child', last: 'last-child' }[state] ?? state}`;
  return null;
}
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
// (parenthèses imbriquées comprises : calc(var(--radius)-5px) → calc(var(--radius) - 5px))
function unescape(value) {
  let text = value.replace(/_/g, ' ');
  for (let at = text.search(/(calc|min|max|clamp)\(/); at >= 0; ) {
    const open = text.indexOf('(', at);
    let depth = 0;
    let close = open;
    for (; close < text.length; close++) {
      if (text[close] === '(') depth++;
      else if (text[close] === ')' && --depth === 0) break;
    }
    const inner = text.slice(open + 1, close).replace(/(\d[a-z%]*|\))([+-])(?=[\d(.a-z])/gi, '$1 $2 ');
    text = `${text.slice(0, open + 1)}${inner}${text.slice(close)}`;
    const next = text.slice(open + inner.length + 2).search(/(calc|min|max|clamp)\(/);
    at = next < 0 ? -1 : open + inner.length + 2 + next;
  }
  return text;
}

/**
 * `modifiers` : attributs data-* du composant qui deviennent des classes de modificateur ({ size: 'select-trigger' } :
 * data-[size=sm]: → .select-trigger.select-trigger-sm).
 */
// data-variant={variant} posé par un composant du fichier : ses descendants le ciblent par sa classe de modificateur
const fileModifiers = {};
for (const chunk of chunks.filter((c) => c.component)) {
  for (const m of chunk.text.matchAll(/\sdata-(size|variant)=\{[\w.]+\}/g)) fileModifiers[m[1]] ??= classOf(chunk);
}

// Partie qui porte un marqueur nommé (group/field-group sur FieldGroup) : une condition data-variant du groupe ne vaut
// que si c'est elle qui pose la variante
const markerOwners = new Map();
for (const chunk of chunks.filter((c) => c.component)) {
  for (const m of chunk.text.matchAll(/(?<=["'`\s])(?:group|peer)\/([\w-]+)(?=["'`\s])/g)) markerOwners.set(m[1], classOf(chunk));
}

// [data-slot=x] dans un sélecteur arbitraire : la classe de la partie ; chaque classe ainsi visée est notée pour
// vérifier que la partie la porte bien
const targetedSlots = new Set();
const slotsToClasses = (selector) =>
  selector.replace(/\[data-slot=['"]?([\w-]+)['"]?\]/g, (_, slot) => {
    targetedSlots.add(slotClass(slot));
    return `.${slotClass(slot)}`;
  });
// Partie désignée par son data-slot (card-action) : sa classe, préfixe court compris (--class btn)
const slotClass = (slot) => (slot === base ? prefix : slot.startsWith(`${base}-`) ? `${prefix}-${slot.slice(base.length + 1)}` : slot);

/**
 * Rend les marqueurs `group`, `group/nom`, `peer` : ils restent dans le JSX (Tailwind ne les accepte pas dans @apply),
 * et les variants group-…/peer-… deviennent des sélecteurs qui les ciblent.
 */
// Marqueurs qui ne sont pas des utilitaires : group, peer, not-prose (typographie), et les classes que le lint du
// projet déclare connues (ignore de no-unregistered-classes : toaster…). Tailwind les refuse dans @apply.
const lintIgnores = [...lintConfigText(project).matchAll(/ignore\s*:\s*\[([\s\S]*?)\]/g)].flatMap((m) =>
  [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((q) => (q[1] ?? q[2]).replace(/\\\\/g, '\\')),
);
// Classes sémantiques déjà définies par les feuilles du projet (field-trigger…) : Tailwind les refuse aussi dans @apply
const projectClasses = new Set();
for (const queue = project.entry ? [project.entry] : [], seen = new Set(); queue.length; ) {
  const file = queue.shift();
  if (seen.has(file) || !existsSync(file)) continue;
  seen.add(file);
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.matchAll(/(?:^|[}{;])\s*([^{}@;]+)\{/g)) for (const m of rule[1].matchAll(/\.([a-z][\w-]*)/g)) projectClasses.add(m[1]);
  queue.push(...cssImports(file));
}
const isMarker = (token) =>
  /^(group|peer)(\/[\w-]+)?$|^(not-)?prose$/.test(token) ||
  projectClasses.has(token) ||
  lintIgnores.some((pattern) => {
    try {
      return !/[[\]:]/.test(token) && new RegExp(`^(?:${pattern})$`).test(token);
    } catch {
      return false;
    }
  });

function addUtilities(selector, utilities, modifiers = {}) {
  const markers = [];
  for (const token of utilities.split(/\s+/).filter(Boolean)) {
    if (isMarker(token)) {
      markers.push(token);
      continue;
    }
    const parts = splitVariants(token);
    let base = parts.pop();
    let suffix = '';
    let ancestor = '';
    let element = '';
    const kept = [];
    let unsupported = false;
    for (const variant of parts) {
      let match;
      // data-slot retiré par le script : la partie se désigne par sa classe
      if ((match = variant.match(/^data-\[slot=([\w-]+)\]$/)) && targetedSlots.add(slotClass(match[1]))) suffix = suffix.endsWith(' > *') ? `${suffix.slice(0, -1)}.${slotClass(match[1])}` : `${suffix} .${slotClass(match[1])}`;
      else if ((match = variant.match(/^has-data-\[slot=([\w-]+)\]$/)) && targetedSlots.add(slotClass(match[1]))) suffix += `:has(.${slotClass(match[1])})`;
      // has-data-[state=checked]: un descendant porte l'état (Radix)
      else if ((match = variant.match(/^has-data-\[([\w-]+)=([^\]]+)\]$/))) {
        // data-variant / data-size retirés du JSX : la classe de modificateur de la partie qui les posait
        const modifier = /^(variant|size)$/.test(match[1]) && fileModifiers[match[1]];
        if (/^(variant|size)$/.test(match[1]) && !modifier) unsupported = true;
        else suffix += modifier ? `:has(.${modifier}-${match[2]})` : `:has([data-${match[1]}='${match[2]}'])`;
      }
      else if (variant === '*') suffix += ' > *';
      // in-data-[side=left]: un ancêtre porte l'attribut ; [[data-side=left][data-state=collapsed]_&]: idem, sélecteur libre
      else if ((match = variant.match(/^in-(.+)$/)) && stateSelector(match[1])) ancestor += `${stateSelector(match[1]).replace(/^:/, '*:')} `;
      else if ((match = variant.match(/^\[(.+)_&\]$/))) ancestor += `${slotsToClasses(unescape(match[1]))} `;
      // *:[span]: les enfants qui sont des span
      else if ((match = variant.match(/^\[([a-z]+)\]$/)) && suffix.endsWith(' > *')) suffix = `${suffix.slice(0, -1)}${match[1]}`;
      // group-data-[disabled=true]/input-group: → .group\/input-group[data-disabled='true'] .partie ; peer-disabled: → .peer:disabled ~ .partie
      else if ((match = variant.match(/^(group|peer)-(.+?)(?:\/([\w-]+))?$/)) && stateSelector(match[2], match[3])) {
        const marker = `.${match[1]}${match[3] ? `\\/${match[3]}` : ''}`;
        const combinator = match[1] === 'peer' ? ' ~ ' : ' ';
        // peer-data-[a]:peer-data-[b]: les deux conditions sur le même pair (ou le même groupe)
        if (ancestor.endsWith(combinator) && ancestor.slice(0, -combinator.length).split(/[ ~]+/).pop().startsWith(marker)) {
          ancestor = `${ancestor.slice(0, -combinator.length)}${stateSelector(match[2], match[3])}${combinator}`;
        } else ancestor += `${marker}${stateSelector(match[2], match[3])}${combinator}`;
      }
      // [a&]: le composant rendu comme lien ; [.border-b]: le composant qui porte aussi cette classe
      else if ((match = variant.match(/^\[([a-z]+)&\]$/))) element = match[1];
      else if ((match = variant.match(/^\[(\.[\w-]+)\]$/))) suffix += match[1];
      else if ((match = variant.match(/^data-\[([\w-]+)=([^\]]+)\]$/)) && modifiers[match[1]]) suffix += `.${modifiers[match[1]]}-${match[2]}`;
      else if (match) suffix += `[data-${match[1]}='${match[2]}']`;
      else if ((match = variant.match(/^data-\[([\w-]+)\]$/))) suffix += `[data-${match[1]}]`;
      else if ((match = variant.match(/^aria-\[([\w-]+)=([^\]]+)\]$/))) suffix += `[aria-${match[1]}='${match[2]}']`;
      else if ((match = variant.match(/^has-\[(.+)\]$/))) suffix += `:has(${slotsToClasses(unescape(match[1])).replace(/^>/, '> ')})`;
      else if ((match = variant.match(/^\[&(.+)\]$/))) suffix += slotsToClasses(unescape(match[1])).replace(/^>/, ' > ').replace(/^([^ :[.])/, ' $1');
      else if (SHADCN_VARIANTS[variant]) suffix += SHADCN_VARIANTS[variant];
      else if (/[[\]]|^(group|peer|in|\*|supports)/.test(variant)) unsupported = true;
      else kept.push(variant);
    }
    if (FRACTIONS[base]) base = FRACTIONS[base];
    // Largeur en pixels qui existe dans l'échelle : ring-[3px] → ring-3
    base = base.replace(/^(ring|border|outline|ring-offset)-\[(\d)px\]$/, '$1-$2');
    // Espacement en pixels : un quart de l'unité de Tailwind (4 px) ; w-[2px] → w-0.5, -ml-[6px] → -ml-1.5
    base = base.replace(
      /^(-?)(w|h|size|min-w|min-h|max-w|max-h|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|top|left|right|bottom|inset|inset-x|inset-y)-\[(\d+)px\]$/,
      (_, minus, utility, px) => `${minus}${utility}-${Number(px) / 4}`,
    );
    if (unsupported) {
      rule(selector).todo.push(token);
      continue;
    }
    const target = rule(`${ancestor}${element}${selector}${suffix}`);
    // Propriété arbitraire ([--cell-size:--spacing(8)]) : déclaration CSS telle quelle
    const property = base.match(/^\[(-{0,2}[a-z][\w-]*):(.+)\]$/);
    if (property && !kept.length) {
      target.declarations.push(`${property[1]}: ${unescape(property[2])};`);
      continue;
    }
    const arbitrary = base.match(/^(-?)([\w-]+?)-\[(.+)\]$/);
    // translate-x-[calc(100%-2px)] : propriété translate standard
    if (arbitrary && /^translate-[xy]$/.test(arbitrary[2]) && !kept.length) {
      const value = `${arbitrary[1]}${unescape(arbitrary[3])}`;
      target.declarations.push(`translate: ${arbitrary[2].endsWith('x') ? `${value} 0` : `0 ${value}`};`);
      continue;
    }
    // transition-[color,box-shadow] : les propriétés en CSS, la durée et la courbe par défaut de Tailwind
    if (arbitrary?.[2] === 'transition' && !kept.length) {
      target.declarations.push(
        `transition-property: ${arbitrary[3].split(',').join(', ')};`,
        'transition-timing-function: var(--tw-ease, var(--default-transition-timing-function));',
        'transition-duration: var(--tw-duration, var(--default-transition-duration));',
      );
      continue;
    }
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
  return markers;
}

/** Nom de la partie à partir de la balise : DialogPrimitive.Close → close, XIcon → icon, span → span. */
// Balise HTML qui dit déjà le rôle de la partie : <h4> est un titre, <p> une description, <img> une image
const TAG_ROLES = { h1: 'title', h2: 'title', h3: 'title', h4: 'title', h5: 'title', h6: 'title', p: 'description', img: 'image', ul: 'list', ol: 'list', li: 'item', span: 'label', label: 'label' };
function partName(tag) {
  const last = tag.split('.').pop();
  if (/Icon$/.test(last) || /^[A-Z]\w*Icon$/.test(last)) return 'icon';
  return TAG_ROLES[last] ?? kebab(last);
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
      const markers = addUtilities(`.${cls}`, baseMatch[2]);
      text = text.slice(0, call) + text.slice(call).replace(baseMatch[0], `cva(${quote}${[cls, ...markers].join(' ')}${quote}`);
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
          const replaced = body.replace(/(\n\s*)(["']?[\w-]+["']?):\s*\n?\s*(["'`])([\s\S]*?)\3/g, (entry, space, key, q, utilities) => {
            const clean = key.replace(/["']/g, '');
            if (!utilities.trim()) return entry;
            let modifier = `${cls}-${clean}`;
            if (used.has(modifier)) modifier = `${cls}-${groupName}-${clean}`;
            used.add(modifier);
            const markers = addUtilities(`.${modifier}`, utilities);
            classMap.push([`${groupName}=${clean}`, modifier]);
            return `${space}${key}: ${quote}${[modifier, ...markers].join(' ')}${quote}`;
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
      // cn('…', '…', `…`, className) : toutes les chaînes du début, commentaires compris, forment la liste
      /className=(?:\{cn\(\s*((?:(?:"[^"\n]*"|'[^'\n]*'|`[^`$]*`)\s*(?:,\s*)?(?:\/\/[^\n]*\n\s*)*)+)|"([^"]*)"|'([^']*)'|\{`([^`$]*)`\})/g,
      (match, cnStrings, doubleQuoted, singleQuoted, templated, offset, whole) => {
        const plainUtilities = doubleQuoted ?? singleQuoted ?? templated;
        const cnUtilities = cnStrings === undefined ? undefined : [...cnStrings.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`$]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]).join(' ');
        const rest = cnStrings?.trimEnd().endsWith(',') ? ', ' : '';
        const utilities = cnUtilities ?? plainUtilities;
        // La racine d'un composant (le premier cn(…) qui transmet la prop className) reçoit toujours sa classe
        // (card-content : px-6) ; une partie intérieure, à partir de deux utilitaires seulement : cn('size-4', …)
        // sur une icône reste en utilitaires
        const forwardsClassName = /^[^)]*\bclassName\b/.test(whole.slice(offset + match.length));
        const atRoot = cnUtilities !== undefined && !rootDone && forwardsClassName;
        if (utilities.includes('${') || !utilities.trim() || (!atRoot && utilities.trim().split(/\s+/).length < 2)) return match;
        const tag = whole.slice(0, offset).match(/<([\w.]+)[^<]*$/)?.[1] ?? 'part';
        let className = cls;
        if (rootDone || !atRoot) {
          const part = partName(tag);
          const base = `${cls}-${part}`;
          parts.set(base, (parts.get(base) ?? 0) + 1);
          className = parts.get(base) > 1 ? `${base}-${parts.get(base)}` : base;
        }
        const isRoot = className === cls;
        if (atRoot) rootDone = true;
        const markers = addUtilities(`.${className}`, utilities, isRoot ? modifiers : {});
        classMap.push([`${chunk.name}${isRoot ? '' : ` <${tag}>`}`, className]);
        const extra = isRoot ? dataModifiers.map((m) => `, \`${className}-\${${m.expression}}\``).join('') : '';
        if (extra) for (const m of dataModifiers) classMap.push([`${chunk.name} data-${m.attribute}={${m.expression}}`, `${className}-<${m.expression}>`]);
        const classes = [className, ...markers].join(' ');
        return cnUtilities !== undefined ? `className={cn(${quote}${classes}${quote}${extra}${rest}` : `className=${quote}${classes}${quote}`;
      },
    );
  }
}

// Classes conditionnelles dans cn(…) : variant === 'grid' && ['…', '…'] ou isListening && '…' deviennent une classe
// de modificateur de la partie (attachment-grid, prompt-input-speech-button-listening)
if (!options['keep-classes']) {
  // Props booléennes courantes, nommées sans préfixe : disabled && '…' donne file-drop-zone-disabled
  const BOOLEAN_PROPS = 'disabled|active|selected|checked|invalid|open|inline|compact|loading|required';
  const LITERAL = String.raw`(\[(?:\s*(?:'[^'\n]*'|"[^"\n]*"|\`[^\`$]*\`)\s*,?)+\s*\]|'[^'\n]*'|"[^"\n]*"|\`[^\`$]*\`)`;
  const CONDITIONAL = new RegExp(String.raw`(\b[\w.]+) === (['"])([\w-]+)\2 &&\s*${LITERAL}|(?<![\w.=!<>&|?:]\s*)\b((?:is|has|should|show)[A-Z]\w*|${BOOLEAN_PROPS}) &&\s*${LITERAL}`, 'g');
  for (const chunk of components) {
    chunk.text = chunk.text.replace(CONDITIONAL, (match, expression, q, value, payload, flag, flagPayload, offset, whole) => {
      // La partie : la première classe du même cn(…), ou la racine du composant si ce cn(…) est le premier
      const callStart = whole.lastIndexOf('className=', offset);
      const isRootCall = callStart >= 0 && whole.indexOf('className=') === callStart;
      const owner = whole.slice(callStart, offset).match(/cn\(\s*['"]([\w-]+)/)?.[1] ?? (isRootCall ? classOf(chunk) : null);
      if (callStart < 0 || !owner) return match;
      const literal = payload ?? flagPayload;
      const utilities = [...literal.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`$]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]).join(' ');
      const name = value ?? kebab(flag.replace(/^(is|has|should|show)(?=[A-Z])/, ''));
      const modifier = `${owner}-${name}`;
      const markers = addUtilities(`.${modifier}`, utilities);
      classMap.push([`${chunk.name} ${value ? `${expression} === '${value}'` : flag}`, modifier]);
      const classes = [modifier, ...markers].join(' ');
      return value ? `${expression} === ${q}${value}${q} && ${quote}${classes}${quote}` : `${flag} && ${quote}${classes}${quote}`;
    });
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
      // Un type est toujours exporté : un autre fichier peut l'utiliser sans le nommer (type inféré d'un hook)
      const needsExport =
        chunk.component ||
        chunk.kind === 'type' ||
        chunk.kind === 'interface' ||
        exported.has(chunk.name) ||
        chunks.some((other) => other.file !== file && uses(other.text, chunk.name));
      if (needsExport) exportsOf.set(file, [...(exportsOf.get(file) ?? []), chunk.kind === 'type' || chunk.kind === 'interface' ? `type ${chunk.name}` : chunk.name]);
      return needsExport && !/^export\s/.test(chunk.text.split('\n').find((l) => DECLARATION.test(l)) ?? '')
        ? chunk.text.replace(/^((?:\s*(?:\/\/|\/\*|\*).*\n)*)(?=(?:async\s+)?(?:function|const|let|type|interface|class|enum)\s)/, '$1export ')
        : chunk.text;
    })
    .join('\n\n');
  const header = [];
  for (const entry of imports) {
    if (entry.side) {
      header.push(`import ${quote}${entry.from}${quote}${semi}`);
      continue;
    }
    // Le contenu des chaînes ne compte pas : event.key === 'ArrowLeft' n'utilise pas l'icône ArrowLeft
    const code = withoutStrings(body);
    const named = entry.named.filter((n) => uses(code, n.local));
    const keepDefault = entry.defaultName && uses(code, entry.defaultName);
    const keepNamespace = entry.namespace && new RegExp(`\\b${entry.namespace}\\.`).test(body);
    if (!named.length && !keepDefault && !keepNamespace) continue;
    const clause = [keepNamespace ? `* as ${entry.namespace}` : keepDefault ? entry.defaultName : null, named.length ? `{ ${named.map((n) => n.text).join(', ')} }` : null]
      .filter(Boolean)
      .join(', ');
    header.push(`import ${entry.typeOnly ? 'type ' : ''}${clause} from ${quote}${entry.from}${quote}${semi}`);
  }
  const siblings = new Map();
  for (const [identifier, otherFile] of definedIn) {
    // Le contenu des chaînes ne compte pas (« used within <FormField> » dans un message d'erreur)
    // ni le texte du JSX (<span>Toggle Sidebar</span>)
    const code = withoutStrings(body).replace(/>[^<>{}]*</g, '><');
    if (otherFile === file || !uses(code, identifier)) continue;
    siblings.set(otherFile, [...(siblings.get(otherFile) ?? []), identifier]);
  }
  for (const [otherFile, names] of siblings) header.push(`import { ${names.sort().join(', ')} } from ${quote}./${otherFile}${quote}${semi}`);
  output.set(`${file}${ext}`, `${directive ? `${directive}\n\n` : ''}${header.join('\n')}\n\n${body}\n`);
}
// index.ts : l'API d'origine du fichier (ses exports), pas les parties internes devenues des fichiers à part
const publicNames = (names) => (exported.size ? names.filter((n) => exported.has(n.replace(/^type /, ''))) : names);
const indexLines = [...exportsOf]
  .map(([file, names]) => [file, publicNames(names)])
  .filter(([, names]) => names.length)
  .sort(([a], [b]) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)))
  .map(([file, names]) => `export { ${names.sort((a, b) => a.replace(/^type /, '').localeCompare(b.replace(/^type /, ''))).join(', ')} } from './${file}';`);
// Sur place, l'index existant est complété : exports des parties déplacées, plus d'export d'un fichier disparu
const indexFile = join(folder, 'index.ts');
if (!inPlace || !existsSync(indexFile)) output.set('index.ts', `${indexLines.join('\n')}\n`);
else {
  const mainGone = !output.has(`${base}${ext}`);
  const kept = readFileSync(indexFile, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !(mainGone && new RegExp(`from ['"]\\./${base}['"]`).test(line)));
  const added = indexLines.filter((line) => !kept.some((k) => k.includes(line.match(/from '([^']+)'/)[1]) && k === line) && !(line.includes(`'./${base}'`) && !mainGone));
  output.set('index.ts', `${[...kept, ...added].join('\n')}\n`);
}

// Couleurs, reliefs et rayons de shadcn → tokens, d'après theme.css (bg-card → bg-surface)
const tokenizer = shadcnTokenizer(project);
const toTokens = tokenizer.toTokens;

// Groupe ou pair nommé (group/field sur la partie `field`) : les sélecteurs visent la classe de la partie, et le
// marqueur quitte le JSX quand plus aucun utilitaire resté dans le TSX ne le nomme (@md/field-group:, group-hover/x:)
const namedMarkers = new Map();
for (const content of output.values()) {
  for (const literal of content.matchAll(/(["'`])([^"'`\n]*)\1/g)) {
    const tokens = literal[2].trim().split(/\s+/);
    const owner = tokens.find((t) => /^[a-z][\w-]*$/.test(t));
    for (const token of tokens) {
      const named = token.match(/^(group|peer)\/([\w-]+)$/);
      if (named && owner) namedMarkers.set(token, owner);
    }
  }
}
for (const [marker, owner] of namedMarkers) {
  const escaped = `.${marker.replace('/', '\\/')}`;
  // Renommés sur place : l'ordre des règles, donc la cascade, ne change pas
  const renamed = [...css].map(([selector, value]) => [selector.split(escaped).join(`.${owner}`), value]);
  css.clear();
  for (const [selector, value] of renamed) {
    const target = rule(selector);
    target.apply.push(...value.apply);
    target.declarations.push(...value.declarations);
    target.todo.push(...value.todo);
  }
  const name = marker.split('/')[1];
  const stillNamed = [...output].some(([file, content]) => /\.[jt]sx$/.test(file) && new RegExp(`/${name}[:\\]]`).test(content));
  if (stillNamed) continue;
  for (const [file, content] of output) {
    if (/\.[jt]sx$/.test(file)) output.set(file, content.replace(new RegExp(`(["'\`][^"'\`\n]*?) ${marker.replace('/', '\\/')}(?=[ "'\`])`, 'g'), '$1'));
  }
}

// Premier jet de la feuille de style
const cssLines = [`/* ${pascal(base)} : classes posées par le composant (premier jet de rehome.mjs, à relire). */`, '@layer components {'];
// Échelle restreinte des tokens : un pas absent (gap-1.5 sans --spacing-1\.5) ne serait pas généré, et l'@apply casserait
const offScale = scaleChecker(project);
for (const [selector, rule] of css) {
  rule.apply = rule.apply.map(toTokens);
  for (const utility of rule.apply.filter(offScale)) rule.todo.push(`${utility} (hors de l'échelle ${offScale(utility)})`);
  rule.apply = rule.apply.filter((utility) => !offScale(utility));
  const { apply, declarations, todo } = rule;
  if (!apply.length && !declarations.length && !todo.length) continue;
  cssLines.push(`  ${selector} {`);
  // Déclarations d'abord : un variant de l'@apply (sm:max-w-lg) doit pouvoir les remplacer
  for (const declaration of declarations) cssLines.push(`    ${declaration}`);
  if (apply.length) cssLines.push(`    @apply ${[...new Set(apply)].join(' ')};`);
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
if (!options['keep-classes']) output.set(`${base}.css`, `${cssLines.join('\n')}\n`);

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
    // Ternaire de classes, même d'un seul utilitaire de chaque côté : file ? 'text-muted' : 'font-medium'
    for (const match of content.matchAll(/\?\s*(["'`])([\w:./[\]%-]+(?: [\w:./[\]%-]+)*)\1\s*:\s*(["'`])([\w:./[\]%-]+(?: [\w:./[\]%-]+)*)\3/g)) {
      const tokens = `${match[2]} ${match[4]}`.split(/\s+/);
      if (tokens.every((t) => /^[\w-]*[a-z]-[\w./[\]%-]+$|^[\w-]+:[\w[\]=&>*.()/%-]+$/.test(t))) leftovers.push(`${file}: ${match[0].trim()}`);
    }
  }
}

// Textes en dur à passer par les messages du projet : contenu des balises et attributs lus par les lecteurs d'écran
const texts = [];
for (const [file, content] of output) {
  for (const match of content.matchAll(/>\s*([A-Z][A-Za-z]+(?: [A-Za-z]+)*)\s*</g)) texts.push(`${file}: "${match[1]}"`);
  for (const match of content.matchAll(/\b(aria-label|title|placeholder|alt)="([A-Z][^"]*)"/g)) texts.push(`${file}: ${match[1]}="${match[2]}"`);
}

// Code qui cible les data-slot retirés ([data-slot=card-content], *:data-[slot=…]) : à passer sur les classes
const slots = new Set(components.map((c) => kebab(c.name)));
const slotUsers = [];
const searchRoots = project.repo === project.root ? [project.root] : [project.repo];
for (const file of searchRoots.flatMap((dir) => walk(dir, ['.tsx', '.jsx', '.ts', '.css']))) {
  if (file === source || file.startsWith(folder)) continue;
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(/slot=['"]?([\w-]+)/g)) {
    if (slots.has(match[1])) slotUsers.push(`${relative(project.repo, file)}:${content.slice(0, match.index).split('\n').length}  [data-slot=${match[1]}] → .${classOf(components.find((c) => kebab(c.name) === match[1]))}`);
  }
}

// ---------- Écriture ----------
const relFolder = rel(project, folder);
if (options['dry-run']) {
  for (const [file, content] of output) console.log(`\n=== ${relFolder}/${file}\n${content}`);
} else {
  mkdirSync(folder, { recursive: true });
  for (const [file, content] of output) writeFileSync(join(folder, file), content);
  // Sur place, le fichier principal vient d'être réécrit : rien à supprimer
  if (!inPlace || !output.has(`${base}${ext}`)) rmSync(source);
  if (project.componentsCss && !options['keep-classes']) {
    const sheet = readFileSync(project.componentsCss, 'utf8');
    const target = relative(dirname(project.componentsCss), join(folder, `${base}.css`)).split('\\').join('/');
    const line = `@import '${target.startsWith('.') ? target : `./${target}`}';`;
    if (!sheet.includes(line)) {
      // Feuilles des composants, relatives à components.css (../ui/button/button.css)
      const uiPrefix = relative(dirname(project.componentsCss), project.ui).split('\\').join('/');
      const uiImports = [...sheet.matchAll(/^@import ['"]([^'"]+)['"];?[^\n]*$/gm)].filter((m) => m[1].replace(/^\.\//, '').startsWith(`${uiPrefix}/`));
      // Dans l'ordre alphabétique des composants importés, sinon sous le commentaire « Composants » du gabarit
      const next = uiImports.find((m) => m[0] > line);
      const after = uiImports.at(-1) ?? sheet.match(/^\/\* Composants[^\n]*$/m);
      const updated = next
        ? `${sheet.slice(0, next.index)}${line}\n${sheet.slice(next.index)}`
        : after
          ? `${sheet.slice(0, after.index + after[0].length)}\n${line}${sheet.slice(after.index + after[0].length)}`
          : `${sheet.trimEnd()}\n${line}\n`;
      writeFileSync(project.componentsCss, updated);
    }
  }
}

// Paquet du monorepo qui exporte chaque composant (`"./components/button": "./src/components/button.tsx"`) :
// l'entrée pointe désormais sur l'index du dossier, les imports des applications ne changent pas
const packageJson = join(project.root, 'package.json');
const sourcePath = `./${relative(project.root, source).split('\\').join('/')}`;
const pkgText = readFileSync(packageJson, 'utf8');
const indexPath = `./${relative(project.root, join(folder, 'index.ts')).split('\\').join('/')}`;
let exportUpdated = pkgText.includes(`"${sourcePath}"`);
if (exportUpdated && !options['dry-run']) writeFileSync(packageJson, pkgText.replace(`"${sourcePath}"`, `"${indexPath}"`));
// Nouveau composant d'un paquet qui exporte ses composants un à un : son entrée, sur le modèle des autres, à sa place
// dans l'ordre alphabétique (sans elle, `import … from '@acme/ui/components/field'` ne se résout pas)
const pkgExports = JSON.parse(pkgText).exports;
const uiPrefix = `./${relative(project.root, project.ui).split('\\').join('/')}/`;
const sibling = pkgExports && typeof pkgExports === 'object' && Object.entries(pkgExports).find(([key, value]) => typeof value === 'string' && value.startsWith(uiPrefix) && !key.includes('*'));
if (!exportUpdated && sibling && !Object.values(pkgExports).includes(indexPath)) {
  const keyPrefix = sibling[0].slice(0, sibling[0].length - sibling[1].slice(uiPrefix.length).replace(/(\/index)?\.[jt]sx?$/, '').length);
  const key = `${keyPrefix}${name}`;
  const entries = Object.entries(pkgExports);
  const at = entries.findIndex(([k]) => k.startsWith(keyPrefix) && k.localeCompare(key) > 0);
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const last = entries.filter(([k]) => k.startsWith(keyPrefix)).at(-1)[0];
  const updated =
    at >= 0
      ? pkgText.replace(new RegExp(`^(\\s*)"${escape(entries[at][0])}"`, 'm'), (m, indent) => `${indent}"${key}": "${indexPath}",\n${m}`)
      : pkgText.replace(new RegExp(`^(\\s*)("${escape(last)}"\\s*:\\s*"[^"]*")(,?)`, 'm'), (m, indent, entry, comma) => `${indent}${entry},\n${indent}"${key}": "${indexPath}"${comma}`);
  if (updated && updated !== pkgText) {
    if (!options['dry-run']) writeFileSync(packageJson, updated);
    exportUpdated = true;
  }
}

console.log(`${options['dry-run'] ? 'Would move' : 'Moved'} ${rel(project, source)} → ${relFolder}/ (${[...output.keys()].join(', ')})`);
if (exportUpdated) console.log(`package.json exports: ${relFolder}/index.ts`);
if (classMap.length) {
  console.log('\nClasses (rename to the conventions: default → primary, destructive → danger, short prefix such as btn):');
  for (const [where, cls] of classMap) console.log(`  ${cls.padEnd(28)} ${where}`);
}
if (tokenizer.count()) console.log(`\nColours, shadows and radii of shadcn rewritten with the tokens of theme.css: ${tokenizer.count()}. Check them, and the dark: variants left.`);
// Parties sans rôle dans leur nom (…-div, …-label-2) : à renommer, ou à rendre au JSX si elles ne font que placer
const unnamed = classMap.map(([, cls]) => cls).filter((cls) => /-(div|part|a|button)(-\d+)?$|-\d+$/.test(cls));
if (unnamed.length) {
  console.log(`\nParts named after their tag or numbered: give each a role name, or move a pure layout (flex, gap) back to utilities:`);
  console.log(`  ${[...new Set(unnamed)].join(', ')}`);
}
if (todos.length) {
  console.log(`\nTODO in ${base}.css (${todos.length}): arbitrary values or variants to rewrite with the scale, a token or standard CSS:`);
  for (const todo of todos) console.log(`  ${todo}`);
}
if (leftovers.length) {
  console.log('\nUtility classes left in the TSX (conditional or computed): turn them into modifier classes:');
  for (const leftover of leftovers) console.log(`  ${leftover}`);
}
const tsxText = [...output].filter(([file]) => /\.[jt]sx$/.test(file)).map(([, content]) => content).join('\n');
const missingTargets = [...targetedSlots].filter((cls) => !new RegExp(`['"\` ]${cls}['"\` ]`).test(tsxText));
if (missingTargets.length) {
  console.log('\nClasses targeted by the stylesheet but set by no part (the data-slot had no class): add them to the part:');
  for (const cls of missingTargets) console.log(`  .${cls}`);
}
// Autres attributs data-* restés dans le JSX (data-orientation, data-invalid) : un état lu par la feuille passe en
// classe de modificateur ou en aria-* ; data-testid et ceux d'une bibliothèque restent
const dataAttributes = [];
for (const [file, content] of output) {
  if (!/\.[jt]sx$/.test(file)) continue;
  for (const match of content.matchAll(/\sdata-(?!testid\b)([\w-]+)=(\{[^}]*\}|"[^"]*"|'[^']*')/g)) dataAttributes.push(`${file}: data-${match[1]}=${match[2]}`);
}
if (dataAttributes.length) {
  console.log('\nData attributes left in the JSX: a state the stylesheet reads becomes a modifier class or an aria-* attribute:');
  for (const attribute of dataAttributes) console.log(`  ${attribute}`);
}
// Dépendances de registre réécrites par la CLI à plat (label.tsx) à côté de leur dossier déjà rangé (label/)
const duplicates = isDir(project.ui)
  ? walk(project.ui, ['.tsx', '.jsx']).filter((file) => dirname(file) === project.ui && isDir(file.replace(/\.[jt]sx$/, '')) && file !== source)
  : [];
if (duplicates.length) {
  console.log('\nComponents the CLI wrote again next to their rehomed folder (registry dependencies): delete them, or report their changes by hand:');
  for (const file of duplicates) console.log(`  ${rel(project, file)}`);
}
if (slotUsers.length) {
  console.log('\nCode that targets the removed data-slot attributes: select the class instead:');
  for (const user of slotUsers) console.log(`  ${user}`);
}
if (texts.length) {
  console.log('\nHard-coded texts to move to the messages of the project:');
  for (const text of texts) console.log(`  ${text}`);
}
console.log(
  options['keep-classes']
    ? '\nNext: update the imports of the split file if needed, run the formatter and the linter.'
    : `\nNext: review ${base}.css (shadcn colours → tokens if needed), write ${base}.stories.tsx, run the formatter and the linter${project.componentsCss ? '' : ', import the stylesheet (no components.css found)'}.`,
);

#!/usr/bin/env node
/**
 * Contrôle le cahier des charges construit (requirements.json → output), sans avoir à le lire.
 *
 * Usage : node check.mjs <projet>/requirements
 *
 * Signale :
 *   - les parties attendues absentes (architecture, stack, infrastructure, lots, estimations…) ;
 *   - les gabarits non remplis ({{…}}, TODO, « à compléter ») et les inclusions manquantes ;
 *   - les liens internes vers une ancre inexistante ;
 *   - par lots : les lots des specs absents du découpage, ou sans estimation ;
 *   - par fonctionnalités (specs : site.json → grouping) : les écrans à livrer absents des évolutions, une partie 9
 *     encore découpée en lots, ou sans estimation ; sans rien à livrer, la partie 9 n'est pas attendue ;
 *   - les états d'écran de l'inventaire absents du document ;
 *   - les blocs de code non refermés (diagrammes) ;
 *   - les identifiants d'exigences ou de décisions en double (RF-, NF-, DT-, CA-).
 * Code de sortie 1 si un problème est trouvé.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CODE_BLOCKS } from './assemble.mjs';
import { loadConfig, specsDirOf } from './config.mjs';
import { deliverableScreens, readSpecs } from './specs.mjs';

const root = process.argv[2] && resolve(process.argv[2]);
const config = root ? loadConfig(root) : {};
const file = root && join(root, config.output ?? 'requirements.md');
if (!root || !existsSync(file)) {
  console.error('Usage: node check.mjs <projet>/requirements   (run build.mjs first)');
  process.exit(2);
}
const doc = readFileSync(file, 'utf8');
const problems = [];
const notes = [];
const slug = (text) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_~[\]()]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

// Texte hors blocs de code (les diagrammes ne comptent pas pour les titres ni les gabarits)
const fences = doc.match(/^```/gm) ?? [];
if (fences.length % 2) problems.push('a code block (```) is not closed');
// Trois accents graves au milieu d'une ligne : certains moteurs de rendu y ouvrent un bloc de code
const inline = doc.split('\n').filter((line) => !/^ {0,3}```/.test(line) && /(^|[^\\])```/.test(line));
if (inline.length) problems.push(`triple backticks inside a line (${inline.length}), escape them: ${inline[0].trim().slice(0, 80)}`);
const prose = doc.replace(CODE_BLOCKS, '');

// Découpage des specs : par lots (partie 9 « Découpage en lots »), ou par fonctionnalités (partie 9 « Évolutions »,
// seulement s'il reste des écrans à livrer)
const specsDir = specsDirOf(root, config);
const specs = readSpecs(specsDir);
const byFeature = specs.grouping === 'features';
const deliverable = byFeature ? deliverableScreens(specs) : [];

// Parties attendues (titres de niveau 2, par mots-clés)
const h2 = [...prose.matchAll(/^## (.+)$/gm)].map((m) => m[1].toLowerCase());
const expected = [
  ['présentation ou contexte', /présentation|contexte|objet/],
  ['utilisateurs et rôles', /utilisateur|rôle|persona/],
  ['spécifications fonctionnelles', /fonctionnel/],
  ['interface et identité visuelle', /interface|identité|ui\b|design/],
  ['exigences non fonctionnelles', /non fonctionnel/],
  ['architecture', /architecture/],
  ['stack technique', /stack|socle/],
  ['infrastructure', /infra/],
  ...(byFeature
    ? deliverable.length ? [['évolutions et estimations', /évolution|estimation/]] : []
    : [['découpage en lots', /lot|découpage/], ['estimations', /estimation|charge/]]),
  ['risques et points ouverts', /risque|ouvert/],
];
for (const [label, rx] of expected) if (!h2.some((h) => rx.test(h))) problems.push(`missing part: ${label} (no level-2 heading matches)`);

// Gabarits non remplis
const placeholders = [...prose.matchAll(/\{\{[^}]*\}\}|\bTODO\b|à compléter/gi)].map((m) => m[0]);
if (placeholders.length) problems.push(`unfilled placeholders (${placeholders.length}): ${[...new Set(placeholders)].slice(0, 8).join(', ')}`);
if (/\*\*Fichier manquant\*\*/.test(doc)) problems.push('an included file is missing (see build output)');

// Liens internes
const anchors = new Set([...prose.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));
for (const m of prose.matchAll(/^#{1,6} (.+)$/gm)) anchors.add(slug(m[1]));
for (const m of prose.matchAll(/\*\*((?:RF|CA|NF|DT|RQ)-[A-Z0-9-]+?)(?:\*\*|\s+·)/g)) anchors.add(m[1].toLowerCase());
const broken = [...new Set([...prose.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]).filter((a) => !anchors.has(a)))];
if (broken.length) problems.push(`internal links to missing anchors (${broken.length}): ${broken.slice(0, 10).join(', ')}${broken.length > 10 ? ', …' : ''}`);

// Identifiants cités sans définition (la définition est en gras : **NF-04** ou **DT-02 · …**)
const defined = new Set([...prose.matchAll(/\*\*((?:RF|CA|NF|DT|RQ)-[A-Z0-9-]+?)(?:\*\*|\s+·)/g)].map((m) => m[1]));
const cited = [...new Set([...prose.matchAll(/(?<![\w-])((?:RF|CA|NF|DT|RQ)-[A-Z]{0,4}-?\d{2})(?![\w-])/g)].map((m) => m[1]))];
const undefinedIds = cited.filter((id) => !defined.has(id));
if (undefinedIds.length) problems.push(`identifiers cited but never defined (${undefinedIds.length}): ${undefinedIds.slice(0, 12).join(', ')}`);

// Lots et estimations (ou évolutions), couverture de l'inventaire
const effortRange = /\d+\s*(?:à|-|–)\s*\d+\s*(?:j|jours|jh|j\/h)/i;
const lotSection = prose.split(/^## /m).find((part) => /^[^\n]*(découpage|lots|évolution)/i.test(part)) ?? '';
if (!byFeature) {
  for (const group of specs.groups) {
    const short = group.label.replace(/^Lot \d+\s*·\s*/, '');
    if (!lotSection.toLowerCase().includes(short.toLowerCase())) problems.push(`lot "${group.label}" not found in the lots section`);
  }
  if (lotSection && !effortRange.test(lotSection)) problems.push('no effort range found in the lots section (e.g. "12 à 18 j")');
} else if (lotSection) {
  const title = lotSection.split('\n')[0].replace(/<[^>]+>/g, '');
  if (/lots/i.test(title) && !/évolution/i.test(title)) problems.push(`part "${title.trim()}" still splits the product in lots, but the specs are grouped by features: rewrite it as evolutions (references/estimations.md)${deliverable.length ? '' : ', or remove it: every screen is delivered'}`);
  else if (!deliverable.length) console.log('NOTE: nothing left to deliver in the specs: the evolutions part can be removed.');
  const missingScreens = deliverable.filter(({ screen }) => !new RegExp(`(?:#${screen}[a-z-]*\\)|\\b${screen}[a-z]?\\b)`, 'i').test(lotSection)).map(({ screen }) => screen.toUpperCase());
  if (deliverable.length && missingScreens.length) problems.push(`screens to deliver absent from the evolutions part (${missingScreens.length}): ${missingScreens.slice(0, 12).join(', ')}`);
  if (deliverable.length && !effortRange.test(lotSection)) problems.push('no effort range found in the evolutions part (e.g. "4 à 6 j")');
}
const inventory = existsSync(join(root, 'sources', 'generated', 'inventaire.md')) ? readFileSync(join(root, 'sources', 'generated', 'inventaire.md'), 'utf8') : '';
const states = [...new Set([...inventory.matchAll(/\]\(#(e\d+[a-z-]*)\)/g)].map((m) => m[1]))];
const uncovered = states.filter((id) => !anchors.has(id));
if (uncovered.length) problems.push(`screen states of the inventory missing from the document (${uncovered.length}): ${uncovered.slice(0, 10).join(', ')}`);

// Identifiants en double
for (const prefix of ['RF', 'NF', 'DT', 'CA', 'RQ']) {
  const ids = [...prose.matchAll(new RegExp(`\\*\\*(${prefix}-[A-Z0-9-]+)\\*\\*`, 'g'))].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problems.push(`duplicate ${prefix} identifiers: ${[...new Set(dup)].join(', ')}`);
  if (ids.length) notes.push(`${ids.length} ${prefix}-…`);
}

console.log(`Checked ${file}: ${Math.round(doc.length / 1024)} Ko, ${h2.length} parts, ${states.length} screen states${notes.length ? `, identifiers: ${notes.join(', ')}` : ''}.`);
if (problems.length) {
  console.log(`\nProblems (${problems.length}):`);
  problems.forEach((p) => console.log(`  - ${p}`));
} else console.log('No problem found.');
process.exit(problems.length ? 1 : 0);

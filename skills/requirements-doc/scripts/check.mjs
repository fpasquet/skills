#!/usr/bin/env node
/**
 * Contrôle le cahier des charges construit (cdc.json → output), sans avoir à le lire.
 *
 * Usage : node check.mjs cdc
 *
 * Signale :
 *   - les parties attendues absentes (architecture, stack, infrastructure, lots, estimations…) ;
 *   - les gabarits non remplis ({{…}}, TODO, « à compléter ») et les inclusions manquantes ;
 *   - les liens internes vers une ancre inexistante ;
 *   - les lots des specs absents du découpage, ou sans estimation ;
 *   - les états d'écran de l'inventaire absents du document ;
 *   - les blocs de code non refermés (diagrammes) ;
 *   - les identifiants d'exigences ou de décisions en double (RF-, NF-, DT-, CA-).
 * Code de sortie 1 si un problème est trouvé.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.argv[2] && resolve(process.argv[2]);
const cfg = root && existsSync(join(root, 'cdc.json')) ? JSON.parse(readFileSync(join(root, 'cdc.json'), 'utf8')) : {};
const file = root && join(root, cfg.output ?? 'cahier-des-charges.md');
if (!root || !existsSync(file)) {
  console.error('Usage: node check.mjs cdc   (run build.mjs first)');
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
const prose = doc.replace(/```[\s\S]*?```/g, '');

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
  ['découpage en lots', /lot|découpage/],
  ['estimations', /estimation|charge/],
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

// Lots et estimations, couverture de l'inventaire
const config = existsSync(join(root, 'cdc.json')) ? JSON.parse(readFileSync(join(root, 'cdc.json'), 'utf8')) : {};
const specsDir = resolve(root, config.specs ?? '../specs-ui');
const site = existsSync(join(specsDir, 'sources', 'site.json')) ? JSON.parse(readFileSync(join(specsDir, 'sources', 'site.json'), 'utf8')) : { lots: [] };
const lotSection = prose.split(/^## /m).find((part) => /^[^\n]*(découpage|lots)/i.test(part)) ?? '';
for (const name of site.lots ?? []) {
  const lotFile = join(specsDir, 'sources', name, 'lot.json');
  if (!existsSync(lotFile)) continue;
  const label = JSON.parse(readFileSync(lotFile, 'utf8')).label ?? name;
  const short = label.replace(/^Lot \d+\s*·\s*/, '');
  if (!lotSection.toLowerCase().includes(short.toLowerCase())) problems.push(`lot "${label}" not found in the lots section`);
}
if (lotSection && !/\d+\s*(?:à|-|–)\s*\d+\s*(?:j|jours|jh|j\/h)/i.test(lotSection)) problems.push('no effort range found in the lots section (e.g. "12 à 18 j")');
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

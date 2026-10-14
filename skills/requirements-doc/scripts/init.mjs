#!/usr/bin/env node
/**
 * Prépare le dossier du cahier des charges à partir d'un projet de specs (skill specs-ui).
 *
 * Usage : node init.mjs --specs specs-ui --out cdc [--prototype prototype-ui]
 *
 * Crée, sans écraser un fichier existant :
 *   cdc/cdc.json                 titre, chemins, liens des artifacts (specs, prototype, cahier des charges)
 *   cdc/CDC.md                   mémoire du cahier des charges
 *   cdc/sources/NN-*.md          une source par partie, avec les valeurs connues déjà remplies et des
 *                                gabarits {{…}} à rédiger (check.mjs les signale tant qu'il en reste)
 *   cdc/sources/30-specs.md      partie fonctionnelle et UI : un chapitre par lot, qui inclut l'extraction
 *   cdc/sources/lots/<lot>-criteres.md   critères d'acceptation du lot, à rédiger
 * Puis lance extract.mjs (matière des specs en Markdown, dans cdc/sources/generated/).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const specsDir = valueOf('--specs') && resolve(valueOf('--specs'));
const outDir = valueOf('--out') && resolve(valueOf('--out'));
const prototypeDir = valueOf('--prototype') && resolve(valueOf('--prototype'));
if (!specsDir || !outDir || !existsSync(join(specsDir, 'sources', 'site.json'))) {
  console.error('Usage: node init.mjs --specs specs-ui --out cdc [--prototype prototype-ui]   (specs-ui must contain sources/site.json)');
  process.exit(2);
}
const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(specsDir, 'sources', 'site.json'), 'utf8'));
const prototypeConfig = prototypeDir && existsSync(join(prototypeDir, 'src', 'prototype.json')) ? JSON.parse(readFileSync(join(prototypeDir, 'src', 'prototype.json'), 'utf8')) : null;
const product = site.title ?? 'Produit';
const date = new Date().toLocaleDateString('fr-FR');
const written = [];
const writeIfMissing = (path, content) => {
  const target = join(outDir, path);
  if (existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  written.push(path);
};

// Lots, écrans et états des specs
const lots = [];
let screens = 0;
let states = 0;
for (const name of site.lots ?? []) {
  const lotFile = join(specsDir, 'sources', name, 'lot.json');
  if (!existsSync(lotFile)) continue;
  const lot = JSON.parse(readFileSync(lotFile, 'utf8'));
  lots.push({ name, label: lot.label ?? name });
  screens += Object.keys(lot.screens ?? {}).length;
  states += readdirSync(join(specsDir, 'sources', name)).filter((f) => /^\d+-e\d/i.test(f)).length;
}

const links = {
  specs: site.artifact ?? '',
  prototype: prototypeConfig?.artifact ?? '',
  cdc: '',
};
writeIfMissing(
  'cdc.json',
  JSON.stringify({ title: `${product} · Cahier des charges`, output: `${product.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-cahier-des-charges.md`, specs: relative(outDir, specsDir), prototype: prototypeDir ? relative(outDir, prototypeDir) : null, artifacts: links }, null, 2) + '\n',
);

// Sources : gabarits du skill, valeurs connues remplies
const fill = (text) =>
  text
    .replaceAll('{{PRODUCT}}', product)
    .replaceAll('{{DATE}}', date)
    .replaceAll('{{SPECS_LINK}}', links.specs ? `[artifact des specs](${links.specs})` : 'dossier `specs-ui/`')
    .replaceAll('{{PROTOTYPE_LINK}}', links.prototype ? `[artifact du prototype](${links.prototype})` : 'aucun')
    .replaceAll('{{LOTS}}', String(lots.length))
    .replaceAll('{{SCREENS}}', String(screens))
    .replaceAll('{{STATES}}', String(states));
const templates = join(skillDir, 'templates', 'sources');
for (const f of readdirSync(templates)) writeIfMissing(join('sources', f), fill(readFileSync(join(templates, f), 'utf8')));
writeIfMissing('CDC.md', fill(readFileSync(join(skillDir, 'templates', 'cdc.md'), 'utf8')));

// Partie fonctionnelle et UI : un chapitre par lot
let specsPart = `## 3. Spécifications fonctionnelles et UI\n\nCette partie reprend les specs UI, lot par lot. Chaque écran renvoie à sa page dans les specs, où se trouvent les maquettes desktop et mobile. Les règles fonctionnelles du lot (**RF-…**) et les règles de chaque écran sont celles des specs. Les critères d'acceptation (**CA-…**) les traduisent en vérifications pour la recette.\n`;
lots.forEach((lot, i) => {
  specsPart += `\n### 3.${i + 1} ${lot.label}\n\n<!-- include: generated/lot-${lot.name}.md -->\n\n<!-- include: lots/${lot.name}-criteres.md -->\n`;
  writeIfMissing(
    join('sources', 'lots', `${lot.name}-criteres.md`),
    `<!-- Critères d'acceptation du lot ${lot.label} : rédigés depuis generated/lot-${lot.name}.md (voir references/redacteur.md du skill). -->\n\n#### Critères d'acceptation\n\n{{Par état d'écran : 2 à 5 critères **CA-${lot.name.toUpperCase().slice(0, 4)}-xx**, « Étant donné … quand … alors … ».}}\n`,
  );
});
writeIfMissing(join('sources', '30-specs.md'), specsPart);

console.log(`Initialized ${outDir}${written.length ? `: ${written.join(', ')}` : ' (nothing new, all files exist)'}`);
execFileSync(process.execPath, [join(skillDir, 'scripts', 'extract.mjs'), outDir], { stdio: 'inherit' });
console.log('Next: read CDC.md, then follow SKILL.md (cadrage, architecture questions, writing the sources).');

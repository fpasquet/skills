#!/usr/bin/env node
/**
 * Prépare le dossier du cahier des charges à partir d'un projet de specs (skill specs-ui).
 *
 * Usage : node init.mjs --specs <projet>/ui --out <projet>/requirements [--prototype <projet>/prototype]
 *
 * Crée, sans écraser un fichier existant :
 *   <projet>/requirements/requirements.json                 titre, chemins, liens des artifacts (specs, prototype, cahier des charges)
 *   <projet>/requirements/REQUIREMENTS.md                   mémoire du cahier des charges
 *   <projet>/requirements/sources/NN-*.md          une source par partie, avec les valeurs connues déjà remplies et des
 *                                gabarits {{…}} à rédiger (check.mjs les signale tant qu'il en reste)
 *   <projet>/requirements/sources/30-specs.md      partie fonctionnelle et UI : un chapitre par groupe des specs (lot ou
 *                                fonctionnalité), qui inclut l'extraction
 *   <projet>/requirements/sources/lots/<groupe>-criteres.md   critères d'acceptation du groupe, à rédiger
 * Partie 9 selon le découpage des specs (site.json → grouping) : par lots, 90-lots.md (lots chiffrés) ; par
 * fonctionnalités, 90-evolutions.md (évolutions chiffrées), seulement s'il reste des écrans à livrer.
 * Puis lance extract.mjs (matière des specs en Markdown, dans <projet>/requirements/sources/generated/).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { deliverableScreens, readSpecs } from './specs.mjs';

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const specsDir = valueOf('--specs') && resolve(valueOf('--specs'));
const outDir = valueOf('--out') && resolve(valueOf('--out'));
const prototypeDir = valueOf('--prototype') && resolve(valueOf('--prototype'));
if (!specsDir || !outDir || !existsSync(join(specsDir, 'sources', 'site.json'))) {
  console.error('Usage: node init.mjs --specs <projet>/ui --out <projet>/requirements [--prototype <projet>/prototype]   (the specs folder must contain sources/site.json)');
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

// Groupes (lots ou fonctionnalités), écrans et états des specs
const specs = readSpecs(specsDir);
const { words } = specs;
const lots = specs.groups;
const screens = lots.reduce((n, lot) => n + Object.keys(lot.screens).length, 0);
const states = lots.reduce((n, lot) => n + readdirSync(join(specsDir, 'sources', lot.name)).filter((f) => /^\d+-e\d/i.test(f)).length, 0);
// Partie 9 : lots chiffrés, ou évolutions chiffrées d'un produit découpé par fonctionnalités, absente sans rien à livrer
const deliverable = deliverableScreens(specs);
const part9 = specs.grouping === 'features' ? (deliverable.length ? '90-evolutions.md' : null) : '90-lots.md';

const links = {
  specs: site.artifact ?? '',
  prototype: prototypeConfig?.artifact ?? '',
  requirements: '',
};
writeIfMissing(
  'requirements.json',
  JSON.stringify({ title: `${product} · Cahier des charges`, output: 'requirements.md', specs: relative(outDir, specsDir), prototype: prototypeDir ? relative(outDir, prototypeDir) : null, artifacts: links }, null, 2) + '\n',
);

// Sources : gabarits du skill, valeurs connues remplies
const fill = (text) =>
  text
    .replaceAll('{{PRODUCT}}', product)
    .replaceAll('{{DATE}}', date)
    .replaceAll('{{SPECS_LINK}}', links.specs ? `[artifact des specs](${links.specs})` : 'dossier `ui/` du projet')
    .replaceAll('{{PROTOTYPE_LINK}}', links.prototype ? `[artifact du prototype](${links.prototype})` : 'aucun')
    .replaceAll('{{GROUPS}}', `${lots.length} ${lots.length > 1 ? words.plural : words.one}`)
    .replaceAll('{{SCREENS}}', String(screens))
    .replaceAll('{{STATES}}', String(states));
const templates = join(skillDir, 'templates', 'sources');
for (const f of readdirSync(templates)) {
  if (/^90-/.test(f) && f !== part9) continue;
  writeIfMissing(join('sources', f), fill(readFileSync(join(templates, f), 'utf8')));
}
writeIfMissing('REQUIREMENTS.md', fill(readFileSync(join(skillDir, 'templates', 'memory.md'), 'utf8')));

// Partie fonctionnelle et UI : un chapitre par lot
let specsPart = `## 3. Spécifications fonctionnelles et UI\n\nCette partie reprend les specs UI, ${words.each}. Chaque écran renvoie à sa page dans les specs, où se trouvent les maquettes desktop et mobile. Les règles fonctionnelles ${words.of} (**RF-…**) et les règles de chaque écran sont celles des specs. Les critères d'acceptation (**CA-…**) les traduisent en vérifications pour la recette.\n`;
lots.forEach((lot, i) => {
  specsPart += `\n### 3.${i + 1} ${lot.label}\n\n<!-- include: generated/lot-${lot.name}.md -->\n\n<!-- include: lots/${lot.name}-criteres.md -->\n`;
  writeIfMissing(
    join('sources', 'lots', `${lot.name}-criteres.md`),
    `<!-- Critères d'acceptation ${words.of} ${lot.label} : rédigés depuis generated/lot-${lot.name}.md (voir references/redacteur.md du skill). -->\n\n#### Critères d'acceptation\n\n{{Par état d'écran : 2 à 5 critères **CA-${lot.name.toUpperCase().slice(0, 4)}-xx**, « Étant donné … quand … alors … ».}}\n`,
  );
});
writeIfMissing(join('sources', '30-specs.md'), specsPart);

console.log(`Initialized ${outDir}${written.length ? `: ${written.join(', ')}` : ' (nothing new, all files exist)'}`);
if (specs.grouping === 'features') {
  console.log(part9 ? `Grouped by features: part 9 lists the evolutions to deliver (${deliverable.length} screen(s), see generated/a-livrer.md).` : 'Grouped by features, every screen delivered: no part 9 (nothing to estimate).');
  if (!specs.tracking) console.log('NOTE: the specs do not track the implementation (site.json → implementation): every screen counts as to deliver.');
}
execFileSync(process.execPath, [join(skillDir, 'scripts', 'extract.mjs'), outDir], { stdio: 'inherit' });
console.log('Next: read REQUIREMENTS.md, then follow SKILL.md (cadrage, architecture questions, writing the sources).');

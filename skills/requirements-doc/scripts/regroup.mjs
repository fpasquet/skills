#!/usr/bin/env node
/**
 * Range le cahier des charges sur les nouveaux groupes des specs, après regroup.mjs du skill specs-ui (en général des
 * lots vers des fonctionnalités). Aucun identifiant ne change : les critères suivent leur écran, et les règles gardent
 * le leur (data-rf posé dans les specs, lu par extract.mjs).
 *
 * Usage : node regroup.mjs <projet>/requirements [--dry-run]
 *
 *   - lots/<groupe>-criteres.md : les critères de chaque ancien fichier, répartis par écran (blocs « ##### E13 · … »)
 *     dans le fichier du groupe qui a l'écran, dans l'ordre de ses écrans. Un bloc sans écran va au groupe qui reçoit
 *     le plus d'écrans de son ancien fichier. Un groupe sans critère reçoit le gabarit à rédiger. Les anciens fichiers
 *     sont supprimés ; les autres fichiers de lots/ (sans « -criteres ») ne bougent pas ;
 *   - 30-specs.md : un chapitre par groupe, dans l'ordre des specs ; les chapitres sans extraction restent, à la fin ;
 *   - 00-titre.md : nombre de groupes (« 5 fonctionnalités ») ;
 *   - partie 9, specs découpées par fonctionnalités : 90-lots.md va dans archive/, et 90-evolutions.md (gabarit) le
 *     remplace s'il reste des écrans à livrer (méthode : references/estimations.md) ;
 * puis lance extract.mjs. Le nombre de critères est vérifié avant d'écrire : aucun ne doit se perdre.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { configPath, loadConfig, specsDirOf } from './config.mjs';
import { deliverableScreens, readSpecs } from './specs.mjs';

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') && resolve(args[0]);
if (!root || !configPath(root)) {
  console.error('Usage: node regroup.mjs <projet>/requirements [--dry-run]   (the folder must contain requirements.json)');
  process.exit(2);
}
const dryRun = args.includes('--dry-run');
const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcesDir = join(root, 'sources');
const lotsDir = join(sourcesDir, 'lots');
const specs = readSpecs(specsDirOf(root, loadConfig(root)));
const { words, groups } = specs;
if (!groups.length) {
  console.error('No group found in the specs (sources/site.json → lots).');
  process.exit(1);
}
const read = (path) => readFileSync(path, 'utf8');
const groupOf = new Map(groups.flatMap((g) => Object.keys(g.screens).map((s) => [s.toLowerCase(), g])));
const CA = /\*\*CA-[A-Z0-9-]+\*\*/g;
const countCa = (text) => (text.match(CA) ?? []).length;
const date = new Date().toLocaleDateString('fr-FR');

// ---------- Critères : blocs par écran ----------
const oldFiles = existsSync(lotsDir) ? readdirSync(lotsDir).filter((f) => f.endsWith('-criteres.md')).sort() : [];
const blocks = new Map(groups.map((g) => [g, []])); // groupe → [{ screen, text, from }]
const warnings = [];
let before = 0;
for (const file of oldFiles) {
  const text = read(join(lotsDir, file));
  before += countCa(text);
  if (!countCa(text)) continue; // gabarit pas encore rédigé : régénéré pour son groupe
  const parts = text.split(/^(?=##### )/m);
  const preamble = parts.shift().replace(/^<!--[\s\S]*?-->\s*/, '').replace(/^#### Critères d'acceptation\s*/m, '').trim();
  const screenOfBlock = (block) => (block.match(/^##### (?:<a id="[^"]*"><\/a>)?E(\d+)[a-z]?\b/) ?? block.match(/\]\(#e(\d+)[a-z-]*\)/i))?.[1];
  const found = parts.map((block) => ({ screen: screenOfBlock(block) ? `e${screenOfBlock(block)}` : null, text: block.trim() }));
  // Héritier de l'ancien fichier : le groupe qui reçoit le plus de ses écrans
  const counts = new Map();
  for (const b of found) if (groupOf.has(b.screen)) counts.set(groupOf.get(b.screen), (counts.get(groupOf.get(b.screen)) ?? 0) + 1);
  const heir = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? groups.find((g) => `${g.name}-criteres.md` === file) ?? groups[0];
  if (preamble) {
    blocks.get(heir).push({ screen: null, text: preamble, from: file });
    warnings.push(`${file}: text before the first screen moved to ${heir.name}-criteres.md, check it`);
  }
  for (const b of found) {
    const target = groupOf.get(b.screen) ?? heir;
    if (!groupOf.has(b.screen)) warnings.push(`${file}: block « ${b.text.split('\n')[0].slice(0, 60)} » has no known screen, moved to ${heir.name}-criteres.md`);
    blocks.get(target).push({ ...b, from: file });
  }
}

const outputs = new Map(); // fichier → contenu
for (const g of groups) {
  const order = Object.keys(g.screens).map((s) => s.toLowerCase());
  const rank = (b) => (b.screen && order.includes(b.screen) ? order.indexOf(b.screen) : order.length);
  const list = blocks.get(g).map((b, i) => ({ ...b, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i);
  const head = `<!-- Critères d'acceptation ${words.of} ${g.label} : rédigés depuis generated/lot-${g.name}.md (voir references/redacteur.md du skill).${list.length ? ` Regroupés le ${date} : identifiants inchangés.` : ''} -->\n\n#### Critères d'acceptation\n\n`;
  outputs.set(
    `${g.name}-criteres.md`,
    list.length ? `${head}${list.map((b) => b.text).join('\n\n')}\n` : `${head}{{Par état d'écran : 2 à 5 critères **CA-${g.name.toUpperCase().slice(0, 4)}-xx**, « Étant donné … quand … alors … ».}}\n`,
  );
}
const after = [...outputs.values()].reduce((n, text) => n + countCa(text), 0);
if (after !== before) {
  console.error(`Acceptance criteria count changed (${before} → ${after}): nothing written. Check the criteria files (one "##### E… · …" heading per screen).`);
  process.exit(1);
}

// ---------- 30-specs.md : un chapitre par groupe ----------
const specsFile = join(sourcesDir, '30-specs.md');
let specsPart = null;
if (existsSync(specsFile)) {
  const [intro, ...chapters] = read(specsFile).split(/^(?=### )/m);
  const others = chapters.filter((c) => !/<!--\s*include:\s*generated\/lot-/.test(c));
  const generated = groups.map((g) => `### 3.x ${g.label}\n\n<!-- include: generated/lot-${g.name}.md -->\n\n<!-- include: lots/${g.name}-criteres.md -->\n`);
  let n = 0;
  specsPart =
    intro.replace(/lot par lot|fonctionnalité par fonctionnalité/, words.each).replace(/règles fonctionnelles (?:du lot|de la fonctionnalité)/, `règles fonctionnelles ${words.of}`).trimEnd() +
    '\n\n' +
    [...generated, ...others].map((c) => c.replace(/^### 3\.(?:x|\d+) /, () => `### 3.${++n} `).trimEnd() + '\n').join('\n');
}

// ---------- 00-titre.md, partie 9 ----------
const titleFile = join(sourcesDir, '00-titre.md');
const title = existsSync(titleFile) ? read(titleFile) : null;
const newTitle = title?.replace(/(specs du [^:|\n]*:\s*)\d+\s+(?:lots?|fonctionnalités?)/, `$1${groups.length} ${groups.length > 1 ? words.plural : words.one}`);
const byFeature = specs.grouping === 'features';
const deliverable = byFeature ? deliverableScreens(specs) : [];
const oldPart9 = join(sourcesDir, '90-lots.md');
const archive = byFeature && existsSync(oldPart9);
const addEvolutions = byFeature && deliverable.length && !existsSync(join(sourcesDir, '90-evolutions.md'));

// ---------- Rapport ou écriture ----------
const removed = oldFiles.filter((f) => !outputs.has(f));
console.log(`Regroup the requirements on ${groups.length} ${words.plural} of the specs (${before} acceptance criteria, unchanged):`);
for (const g of groups) console.log(`  ${g.name}-criteres.md: ${countCa(outputs.get(`${g.name}-criteres.md`))} criteria${blocks.get(g).length ? ` from ${[...new Set(blocks.get(g).map((b) => b.from))].join(', ')}` : ' (template to write)'}`);
if (removed.length) console.log(`  removed: ${removed.map((f) => `lots/${f}`).join(', ')}`);
if (archive) console.log(`  90-lots.md → archive/90-lots.md${addEvolutions ? ', 90-evolutions.md added' : ''} (${deliverable.length} screen(s) to deliver)`);
else if (!byFeature && existsSync(oldPart9)) console.log('  90-lots.md kept: update the lots and estimations to the new lots.');
warnings.forEach((w) => console.log(`WARNING: ${w}`));
if (dryRun) {
  console.log('Dry run: nothing written.');
  process.exit(0);
}
mkdirSync(lotsDir, { recursive: true });
for (const [file, text] of outputs) writeFileSync(join(lotsDir, file), text);
for (const file of removed) rmSync(join(lotsDir, file));
if (specsPart !== null) writeFileSync(specsFile, specsPart);
if (newTitle && newTitle !== title) writeFileSync(titleFile, newTitle);
if (archive) {
  mkdirSync(join(root, 'archive'), { recursive: true });
  renameSync(oldPart9, join(root, 'archive', '90-lots.md'));
}
if (addEvolutions) copyFileSync(join(skillDir, 'templates', 'sources', '90-evolutions.md'), join(sourcesDir, '90-evolutions.md'));
execFileSync(process.execPath, [join(skillDir, 'scripts', 'extract.mjs'), root], { stdio: 'inherit' });
console.log(`Next: ${addEvolutions ? 'write 90-evolutions.md (references/estimations.md), ' : ''}update REQUIREMENTS.md, then build.mjs and check.mjs; export.mjs renames the exported files of the groups.`);

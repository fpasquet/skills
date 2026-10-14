#!/usr/bin/env node
/**
 * Prépare la publication du prototype avec l'outil Artifact.
 *
 *   node prepare-publish.mjs specs/prototype <out-dir>    prépare la page principale et liste les pages à envoyer
 *                                                         (--all : tous les fichiers, pour un nouvel artifact)
 *   node prepare-publish.mjs specs/prototype --confirm    à lancer après une publication réussie
 *   node prepare-publish.mjs specs/prototype --check      dit si l'artifact est en retard sur le site local
 *                                                         (--strict : code de sortie 1 s'il l'est, pour la CI)
 *
 * La page principale (site/index.html, l'accueil des scénarios) est publiée sans enveloppe : l'outil
 * l'ajoute. Les autres pages (documents complets) et le socle partagé (data.js, proto.js) sont envoyés dans
 * « files » avec leur chemin relatif, ce qui garde les liens et la navigation entre pages. Toutes les pages
 * d'un même artifact partagent la même origine, donc le même état simulé (stockage du navigateur).
 * Seules les pages modifiées depuis la dernière publication confirmée (site/.published.json) sont listées.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const [input, second] = process.argv.slice(2);
const siteDir = input && join(resolve(input), 'site');
if (!siteDir || !second || !existsSync(join(siteDir, 'index.html'))) {
  console.error('Usage: node prepare-publish.mjs specs/prototype <out-dir> | specs/prototype --confirm | specs/prototype --check [--strict]   (run build.mjs first)');
  process.exit(2);
}
const stripEnvelope = (html) =>
  html
    .replace(/<!doctype[^>]*>\s*/i, '')
    .replace(/<\/?html\b[^>]*>\s*/gi, '')
    .replace(/<\/?head\b[^>]*>\s*/gi, '')
    .replace(/<\/?body\b[^>]*>\s*/gi, '')
    .replace(/<meta\s+charset[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="viewport"[^>]*>\s*/gi, '');

// Pages et socle partagé (data.js, proto.js) ; les fichiers commençant par un point restent locaux
const pages = readdirSync(siteDir).filter((f) => /\.(html|js|css)$/.test(f) && !f.startsWith('.')).sort();
const hash = (path) => createHash('sha1').update(readFileSync(join(siteDir, path))).digest('hex');
const statePath = join(siteDir, '.published.json');
const published = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};

if (second === '--confirm') {
  writeFileSync(statePath, JSON.stringify(Object.fromEntries(pages.map((p) => [p, hash(p)])), null, 2) + '\n');
  console.log(`Recorded ${pages.length} published files in ${statePath}.`);
  process.exit(0);
}
// --all : nouvel artifact (première publication, ou artifact d'un autre compte) : tout envoyer, socle compris
const all = process.argv.includes('--all');
const changed = pages.filter((p) => p !== 'index.html' && (all || published[p] !== hash(p)));
const removed = all ? [] : Object.keys(published).filter((p) => !pages.includes(p));
if (second === '--check') {
  const config = JSON.parse(readFileSync(join(resolve(input), 'src', 'prototype.json'), 'utf8'));
  const pending = [...(published['index.html'] !== hash('index.html') ? ['index.html'] : []), ...changed, ...removed.map((p) => `${p} (removed)`)];
  const where = config.artifact ? `artifact ${config.artifact}` : 'not published yet (no "artifact" in src/prototype.json)';
  console.log(pending.length ? `Prototype: ${pending.length} file(s) not published, ${where}: ${pending.join(', ')}` : `Prototype: published, up to date (${where}).`);
  process.exit(pending.length && process.argv.includes('--strict') ? 1 : 0);
}
const outDir = resolve(second);
mkdirSync(outDir, { recursive: true });
const main = join(outDir, 'index.html');
writeFileSync(main, stripEnvelope(readFileSync(join(siteDir, 'index.html'), 'utf8')));
const files = Object.fromEntries(changed.map((p) => [p, join(siteDir, p)]));
for (const p of removed) files[p] = null;
console.log(`Main page (file_path): ${main}`);
console.log(published['index.html'] === hash('index.html') ? 'Main page unchanged since the last publish.' : 'Main page changed.');
console.log(`Files to send in "files" (${changed.length} changed${removed.length ? `, ${removed.length} removed` : ''}, ${pages.length - 1 - changed.length} unchanged and kept online):`);
console.log(JSON.stringify(files, null, 2));
console.log('After a successful publish: node prepare-publish.mjs <specs/prototype> --confirm');

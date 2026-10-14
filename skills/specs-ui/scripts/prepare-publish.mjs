#!/usr/bin/env node
/**
 * Prépare la publication avec l'outil Artifact.
 *
 * Site de specs (dossier construit par build.mjs) :
 *   node prepare-publish.mjs specs-ui/site <out-dir>    prépare la page principale et liste les pages à envoyer
 *   node prepare-publish.mjs specs-ui/site --confirm    à lancer après une publication réussie
 *
 *   La page principale (index.html) est publiée sans enveloppe (l'outil l'ajoute) ; les autres pages sont des
 *   documents complets envoyés dans « files » avec leur chemin relatif, ce qui garde les liens entre pages.
 *   Seules les pages modifiées depuis la dernière publication confirmée (specs-ui/site/.published.json) sont
 *   listées : une mise à jour n'envoie que celles-là, les autres restent en ligne.
 *
 * Document isolé (ex. propositions.html publié à part) :
 *   node prepare-publish.mjs <file.html> <copy.html>
 *   Retire l'enveloppe et remplace les liens relatifs vers d'autres documents par l'URL notée dans leur
 *   commentaire <!-- artifact : URL -->.
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const [input, second] = process.argv.slice(2);
if (!input || !second) {
  console.error('Usage: node prepare-publish.mjs specs-ui/site <out-dir> | specs-ui/site --confirm | <file.html> <copy.html>');
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

if (statSync(input).isDirectory()) {
  const siteDir = resolve(input);
  const listPages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listPages(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []));
  const pages = listPages(siteDir).map((p) => relative(siteDir, p).split('\\').join('/')).sort();
  const hash = (path) => createHash('sha1').update(readFileSync(join(siteDir, path))).digest('hex');
  const statePath = join(siteDir, '.published.json');
  const published = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};

  if (second === '--confirm') {
    writeFileSync(statePath, JSON.stringify(Object.fromEntries(pages.map((p) => [p, hash(p)])), null, 2) + '\n');
    console.log(`Recorded ${pages.length} published pages in ${statePath}.`);
    process.exit(0);
  }
  const outDir = resolve(second);
  mkdirSync(outDir, { recursive: true });
  const main = join(outDir, 'index.html');
  writeFileSync(main, stripEnvelope(readFileSync(join(siteDir, 'index.html'), 'utf8')));
  const changed = pages.filter((p) => p !== 'index.html' && published[p] !== hash(p));
  const removed = Object.keys(published).filter((p) => !pages.includes(p));
  const files = Object.fromEntries(changed.map((p) => [p, join(siteDir, p)]));
  for (const p of removed) files[p] = null;
  console.log(`Main page (file_path): ${main}`);
  console.log(published['index.html'] && published['index.html'] === hash('index.html') ? 'Main page unchanged since the last publish.' : 'Main page changed.');
  console.log(`Pages to send in "files" (${changed.length} changed${removed.length ? `, ${removed.length} removed` : ''}, ${pages.length - 1 - changed.length} unchanged and kept online):`);
  console.log(JSON.stringify(files, null, 2));
  console.log('After a successful publish: node prepare-publish.mjs <site> --confirm');
  process.exit(0);
}

// Document isolé
let html = stripEnvelope(readFileSync(input, 'utf8'));
const withoutUrl = new Set();
const missingFiles = new Set();
const missingAnchors = new Set();
const rewritten = new Map();
html = html.replace(/href="([\w.-]+\.html)(#[^"]*)?"/g, (link, file, anchor = '') => {
  const sibling = join(dirname(input), file);
  if (!existsSync(sibling)) {
    missingFiles.add(file);
    return link;
  }
  const target = readFileSync(sibling, 'utf8');
  if (anchor.length > 1 && !target.includes(`id="${anchor.slice(1)}"`)) missingAnchors.add(`${file}${anchor}`);
  const url = target.match(/<!--\s*artifact\s*:\s*(https:\/\/\S+)\s*-->/)?.[1];
  if (!url) {
    withoutUrl.add(file);
    return link;
  }
  rewritten.set(file, (rewritten.get(file) ?? 0) + 1);
  return `href="${url}${anchor}"`;
});
writeFileSync(second, html);
if (rewritten.size) console.log(`Links rewritten to artifacts: ${[...rewritten].map(([f, n]) => `${f} (${n})`).join(', ')}.`);
if (missingFiles.size) console.log(`WARNING: links to missing documents: ${[...missingFiles].join(', ')}.`);
if (missingAnchors.size) console.log(`WARNING: anchors not found in their target: ${[...missingAnchors].join(', ')}.`);
if (withoutUrl.size) console.log(`Links left relative (no artifact URL yet): ${[...withoutUrl].join(', ')}. Publish those documents, note their URL, then run this script again.`);
console.log(`Copy ready to publish: ${second}`);

#!/usr/bin/env node
/**
 * Suit la publication de la page HTML du cahier des charges avec l'outil Artifact.
 *
 *   node prepare-publish.mjs specs/requirements            dit quel fichier publier et vers quel artifact
 *   node prepare-publish.mjs specs/requirements --confirm  à lancer après une publication réussie
 *   node prepare-publish.mjs specs/requirements --check    dit si l'artifact est en retard sur la page locale
 *                                                          (--strict : code de sortie 1 s'il l'est, pour la CI)
 *
 * La page publiée est publish/<output>.html, écrite par build.mjs (sans enveloppe). L'empreinte de la page
 * publiée est notée dans .published.json, à commiter avec les sources : toute l'équipe sait si l'artifact
 * est à jour.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig } from './config.mjs';

const [input, mode] = process.argv.slice(2);
const root = input && resolve(input);
const config = root ? loadConfig(root) : {};
const page = root && join(root, 'publish', (config.output ?? 'requirements.md').replace(/\.md$/, '.html'));
if (!root || !existsSync(page)) {
  console.error('Usage: node prepare-publish.mjs specs/requirements [--confirm | --check [--strict]]   (run build.mjs first)');
  process.exit(2);
}
const hash = createHash('sha1').update(readFileSync(page)).digest('hex');
const statePath = join(root, '.published.json');
const published = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const url = config.artifacts.requirements;

if (mode === '--confirm') {
  writeFileSync(statePath, JSON.stringify({ page: relative(root, page).split('\\').join('/'), sha1: hash }, null, 2) + '\n');
  console.log(`Recorded the published page in ${statePath}.`);
  process.exit(0);
}
const upToDate = published.sha1 === hash;
const where = url ? `artifact ${url}` : 'not published yet (no "artifacts.requirements" in requirements.json)';
if (mode === '--check') {
  console.log(upToDate ? `Requirements: published, up to date (${where}).` : `Requirements: page changed since the last publish, ${where}.`);
  process.exit(!upToDate && process.argv.includes('--strict') ? 1 : 0);
}
console.log(upToDate ? 'Page unchanged since the last publish: nothing to do.' : `Page to publish (file_path): ${page}`);
if (!upToDate) console.log(url ? `Update the existing artifact (url): ${url}` : 'First publish: note the URL in requirements.json → artifacts.requirements.');
console.log('After a successful publish: node prepare-publish.mjs <requirements> --confirm');

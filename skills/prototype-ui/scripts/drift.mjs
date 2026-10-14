#!/usr/bin/env node
/**
 * Dit quels écrans des specs ont changé depuis que le prototype les a repris, sans lire les pages.
 *
 * Usage : node drift.mjs specs/prototype                 écrans modifiés dans les specs depuis la dernière reprise
 *         node drift.mjs specs/prototype --mark [e3,e5]  note les écrans comme repris (tous sans liste)
 *         node drift.mjs specs/prototype --strict        code de sortie 1 s'il y a un écart (CI)
 *
 * L'empreinte d'un écran couvre ses fichiers sources dans les specs (sources/<lot>/NNN-eN*.html) ;
 * l'identité (tokens.css) et les coquilles partagées sont suivies à part. Les empreintes reprises sont
 * dans src/specs-sync.json, à commiter. Après un scaffold, ou après avoir reporté les changements des
 * specs dans une page (SKILL.md, « Suivre les specs »), lancer --mark sur les écrans concernés.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') && resolve(args[0]);
if (!root || !existsSync(join(root, 'src', 'prototype.json'))) {
  console.error('Usage: node drift.mjs specs/prototype [--mark [e3,e5]] [--strict]');
  process.exit(2);
}
const config = JSON.parse(readFileSync(join(root, 'src', 'prototype.json'), 'utf8'));
const specsDir = config.specs ? resolve(root, config.specs) : [resolve(root, '../ui'), resolve(root, '../specs-ui')].find((d) => existsSync(join(d, 'sources', 'site.json')));
if (!specsDir || !existsSync(join(specsDir, 'sources', 'site.json'))) {
  console.error('Specs not found: set "specs" in src/prototype.json.');
  process.exit(1);
}
const site = JSON.parse(readFileSync(join(specsDir, 'sources', 'site.json'), 'utf8'));
const sha = (parts) => createHash('sha1').update(parts.join('\0')).digest('hex').slice(0, 12);
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

// Empreintes actuelles des specs : une par écran, plus l'identité et le partagé
const current = {};
const sharedDir = join(specsDir, 'sources', 'shared');
current['tokens'] = sha([read(join(specsDir, 'tokens.css'))]);
current['shared'] = sha(existsSync(sharedDir) ? readdirSync(sharedDir).sort().map((f) => read(join(sharedDir, f))) : []);
for (const lot of site.lots ?? []) {
  const dir = join(specsDir, 'sources', lot);
  if (!existsSync(dir)) continue;
  const byScreen = new Map();
  for (const f of readdirSync(dir).filter((f) => /^\d+-e\d+/i.test(f)).sort()) {
    const screen = f.match(/^\d+-(e\d+)/i)[1].toLowerCase();
    byScreen.set(screen, [...(byScreen.get(screen) ?? []), read(join(dir, f))]);
  }
  byScreen.set(`templates:${lot}`, [read(join(dir, 'templates.html'))]);
  for (const [key, parts] of byScreen) current[key] = sha(parts);
}

const statePath = join(root, 'src', 'specs-sync.json');
const synced = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
if (args.includes('--mark')) {
  const list = args[args.indexOf('--mark') + 1];
  const keys = list && !list.startsWith('--') ? list.split(',').map((k) => k.trim().toLowerCase()) : Object.keys(current);
  for (const k of keys) {
    if (current[k]) synced[k] = current[k];
    else console.log(`WARNING: unknown screen or key: ${k}`);
  }
  const sorted = Object.fromEntries(Object.keys(synced).sort().map((k) => [k, synced[k]]));
  writeFileSync(statePath, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Marked as synced with the specs: ${keys.join(', ')}.`);
  process.exit(0);
}
if (!existsSync(statePath)) {
  console.log('No src/specs-sync.json yet: run drift.mjs --mark once the prototype matches the specs.');
  process.exit(0);
}
const pages = new Set((config.pages ?? []).map((p) => p.screen));
const changed = Object.keys(current).filter((k) => synced[k] !== current[k]);
const removed = Object.keys(synced).filter((k) => !(k in current));
const describe = (k) => (k === 'tokens' ? 'identity (tokens.css)' : k === 'shared' ? 'shared shells and components' : k.startsWith('templates:') ? `templates of lot ${k.slice(10)}` : `${k.toUpperCase()}${pages.has(k) ? '' : ' (new screen, not in the prototype)'}`);
if (!changed.length && !removed.length) console.log('Prototype: in sync with the specs.');
else {
  if (changed.length) console.log(`Prototype: specs changed since the last sync (${changed.length}): ${changed.map(describe).join(', ')}`);
  if (removed.length) console.log(`Prototype: screens removed from the specs: ${removed.map((k) => k.toUpperCase()).join(', ')}`);
  console.log('Follow SKILL.md « Suivre les specs », then drift.mjs --mark <screens>.');
}
process.exit(args.includes('--strict') && (changed.length || removed.length) ? 1 : 0);

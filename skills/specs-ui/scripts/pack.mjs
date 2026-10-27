#!/usr/bin/env node
/**
 * Archive du dossier specs/ pour le garder d'une conversation à l'autre quand le disque de travail ne dure pas
 * (chat claude.ai, voir references/claude-ai.md). Sert aux trois skills de la chaîne.
 *
 * Usage :
 *   node pack.mjs specs <archive.zip>                      archive le projet (sources, mémoires, .published.json)
 *   node pack.mjs --extract <archive.zip> <dir> [--force]  restaure l'archive dans <dir> (crée <dir>/specs/…)
 *   node pack.mjs --list <archive.zip>                     liste le contenu
 *
 * Laissé de côté, car cela se reconstruit : node_modules/, .build-tmp/, .check/, le site construit (dossier site/ à
 * côté de sources/ ou src/, sauf son .published.json) et requirements/publish/. Sans --force, --extract refuse
 * d'écrire dans un dossier specs/ qui existe déjà. Format zip standard (deflate), sans dépendance.
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename, relative, sep } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const usage = () => {
  console.error('Usage: node pack.mjs specs <archive.zip> | --extract <archive.zip> <dir> [--force] | --list <archive.zip>');
  process.exit(2);
};

// ---------- CRC-32 ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const dosDateTime = (date) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  date: ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

// ---------- Lecture d'une archive ----------
function readZip(file) {
  const zip = readFileSync(file);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error(`${file} is not a zip archive`);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('corrupted central directory');
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    if (method !== 0 && method !== 8) throw new Error(`${name}: unsupported compression (${method})`);
    entries.push({ name, read: () => (method === 8 ? inflateRawSync(raw) : Buffer.from(raw)) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

if (args.includes('--list')) {
  if (!positional[0]) usage();
  for (const entry of readZip(positional[0])) console.log(entry.name);
  process.exit(0);
}

if (args.includes('--extract')) {
  const [archive, dest] = positional;
  if (!archive || !dest) usage();
  const entries = readZip(archive).filter((e) => !e.name.endsWith('/'));
  // Aucun chemin absolu ni remontée : tout reste sous <dir>
  const unsafe = entries.filter((e) => /^[/\\]|^[a-z]:/i.test(e.name) || e.name.split(/[/\\]/).includes('..'));
  if (unsafe.length) {
    console.error(`Refusing unsafe paths: ${unsafe.map((e) => e.name).join(', ')}`);
    process.exit(1);
  }
  const tops = [...new Set(entries.map((e) => e.name.split('/')[0]))];
  const existing = tops.filter((top) => existsSync(join(dest, top)) && readdirSync(join(dest, top)).length);
  if (existing.length && !args.includes('--force')) {
    console.error(`${existing.map((t) => join(dest, t)).join(', ')} already exists: rerun with --force to overwrite its files.`);
    process.exit(1);
  }
  for (const entry of entries) {
    const target = join(dest, ...entry.name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.read());
  }
  console.log(`Extracted ${entries.length} files to ${tops.map((t) => join(dest, t)).join(', ')}.`);
  process.exit(0);
}

// ---------- Création d'une archive ----------
const [folder, archive] = positional;
if (!folder || !archive || !existsSync(folder) || !statSync(folder).isDirectory()) usage();
const root = resolve(folder);
const top = basename(root);
const SKIPPED_DIRS = new Set(['node_modules', '.build-tmp', '.check', '.git']);
// Site construit : dossier site/ à côté des sources (specs) ou de src/ (prototype) ; seul .published.json est gardé
const isBuiltSite = (dir) => basename(dir) === 'site' && (existsSync(join(dirname(dir), 'sources')) || existsSync(join(dirname(dir), 'src')));
const isPublishCopy = (dir) => basename(dir) === 'publish' && existsSync(join(dirname(dir), 'requirements.json'));
const skipped = [];
function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name) || isPublishCopy(path)) {
        skipped.push(relative(root, path));
        continue;
      }
      if (isBuiltSite(path)) {
        skipped.push(relative(root, path));
        if (existsSync(join(path, '.published.json'))) files.push(join(path, '.published.json'));
        continue;
      }
      files.push(...collect(path));
    } else if (entry.isFile() && entry.name !== '.DS_Store') files.push(path);
  }
  return files;
}
const files = collect(root).sort();
const locals = [];
const centrals = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from([top, ...relative(root, file).split(sep)].join('/'));
  const data = readFileSync(file);
  const deflated = deflateRawSync(data, { level: 9 });
  const method = deflated.length < data.length ? 8 : 0;
  const body = method === 8 ? deflated : data;
  const crc = crc32(data);
  const { time, date } = dosDateTime(statSync(file).mtime);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version nécessaire
  local.writeUInt16LE(0x0800, 6); // noms en UTF-8
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version qui a créé l'archive
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  locals.push(local, name, body);
  centrals.push(central, name);
  offset += local.length + name.length + body.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);
if (offset + centralSize > 0xffffffff || files.length > 0xffff) {
  console.error('Archive too large for the zip format used here (4 GB, 65535 files).');
  process.exit(1);
}
mkdirSync(dirname(resolve(archive)), { recursive: true });
const zip = Buffer.concat([...locals, ...centrals, end]);
writeFileSync(archive, zip);
console.log(`Packed ${files.length} files from ${relative(process.cwd(), root) || root} into ${archive} (${Math.max(1, Math.round(zip.length / 1024))} KB).`);
if (skipped.length) console.log(`Left out (rebuilt from the sources): ${skipped.join(', ')}`);

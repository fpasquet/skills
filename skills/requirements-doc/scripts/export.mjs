#!/usr/bin/env node
/**
 * Exporte le cahier des charges vers le dépôt de l'application : la partie utile au code (règles et critères par lot,
 * exigences non fonctionnelles, architecture, stack, infrastructure), en Markdown, un fichier par partie et par lot.
 * Les lots chiffrés, le planning et les risques restent dans le dépôt de specs.
 *
 * Usage : node export.mjs <projet>/requirements [--to <dossier>] [--check] [--force]
 *
 *   --to     dossier de destination, par exemple ../orbe-app/docs/requirements (chemin depuis le dossier courant) ;
 *            noté dans requirements.json → export.to (chemin depuis le dossier du cahier des charges) pour les fois
 *            suivantes
 *   --check  n'écrit rien : dit si l'export de l'application est en retard sur le cahier des charges (code 1 si oui)
 *   --force  écrit dans un dossier existant qui ne vient pas d'un export (sans export.json)
 *
 * requirements.json → export : { "to", "parts", "source" }
 *   parts   préfixes des sources à exporter (défaut : 10, 20, 30, 40, 50, 60, 70, 80) ; 00 (titre), 90 (lots et
 *           estimations), 95 (risques) et 99 (annexes) restent internes
 *   source  nom du dépôt de specs affiché dans l'export (défaut : déduit de git remote, par exemple fpasquet/specs)
 *
 * Dans une source exportée, ce qui doit rester interne s'encadre de <!-- export:skip --> et <!-- /export:skip -->
 * (coûts de 80-infrastructure.md par exemple). Une partie qui inclut des lots (30-specs.md) donne un fichier par lot :
 * lots/<lot>.md. Les liens internes sont réécrits vers le bon fichier, ou gardés en texte quand leur cible n'est pas
 * exportée. Écrit aussi README.md (index, version, liens des artifacts, identifiants) et export.json (manifeste :
 * source, version, statut des écrans pour trace.mjs, empreinte de chaque fichier). Rien n'est réécrit quand le
 * contenu n'a pas changé ; un fichier d'un export précédent qui n'est plus produit est supprimé, et seulement lui.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, relative, dirname, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadConfig, configPath, specsDirOf } from './config.mjs';
import { anchorHeadings, include, slug, sourceFiles } from './assemble.mjs';

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const root = args[0] && !args[0].startsWith('--') && resolve(args[0]);
if (!root || !existsSync(join(root, 'sources'))) {
  console.error('Usage: node export.mjs <projet>/requirements [--to <app>/docs/requirements] [--check] [--force]   (the folder must contain sources/)');
  process.exit(2);
}
const config = loadConfig(root);
const exportConfig = config.export ?? {};
const dest = valueOf('--to') ? resolve(valueOf('--to')) : exportConfig.to ? resolve(root, exportConfig.to) : null;
if (!dest) {
  console.error('No destination: pass --to <app>/docs/requirements (it is then kept in requirements.json → export.to).');
  process.exit(2);
}
const check = args.includes('--check');
const sourcesDir = join(root, 'sources');
const posix = (path) => path.split(sep).join('/');
const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const git = (dir, ...gitArgs) => {
  try {
    return execFileSync('git', ['-C', dir, ...gitArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
// Nom court du dépôt (owner/repo) : les deux derniers segments de l'URL, ce qui écarte identifiants et hôte
const repositoryName = (url) => (url ? url.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).slice(-2).join('/') : null);

// ---------- Sources à exporter ----------
const parts = (exportConfig.parts ?? ['10', '20', '30', '40', '50', '60', '70', '80']).map((p) => String(p).padStart(2, '0'));
const selected = sourceFiles(sourcesDir).filter((f) => parts.includes(f.split('-')[0]));
const warnings = [];

/** Retire les blocs <!-- export:skip --> … <!-- /export:skip --> (un bloc non refermé va jusqu'à la fin). */
function stripSkipped(text, file) {
  return text.replace(/<!--\s*export:skip\s*-->[\s\S]*?(?:<!--\s*\/export:skip\s*-->|$)/g, (block) => {
    if (!/<!--\s*\/export:skip\s*-->/.test(block)) warnings.push(`${file}: <!-- export:skip --> never closed, skipped to the end of the file`);
    return '';
  });
}

/** Applique `fn` au texte hors des blocs de code. */
const outsideCode = (text, fn) =>
  text
    .split(/(```[\s\S]*?```)/g)
    .map((part) => (part.startsWith('```') ? part : fn(part)))
    .join('');

/** Remonte les titres pour que le premier niveau du fichier soit #. */
function promoteHeadings(text) {
  let min = 6;
  outsideCode(text, (part) => {
    for (const m of part.matchAll(/^(#{1,6}) /gm)) min = Math.min(min, m[1].length);
    return part;
  });
  const shift = min - 1;
  return shift > 0 ? outsideCode(text, (part) => part.replace(/^(#{1,6}) /gm, (_, hashes) => `${'#'.repeat(hashes.length - shift)} `)) : text;
}

const headingText = (text) =>
  (text.match(/^# (.+)$/m)?.[1] ?? '')
    .replace(/<[^>]+>/g, '')
    .trim();

// Une partie qui inclut des lots se découpe en un fichier par lot (chapitres ###)
const docs = []; // { path, source, text }
const missing = [];
for (const file of selected) {
  const raw = stripSkipped(readFileSync(join(sourcesDir, file), 'utf8'), file);
  const name = file.replace(/^\d+-/, '').replace(/\.md$/, '');
  if (/<!--\s*include:\s*generated\/lot-/.test(raw)) {
    const chapters = raw.split(/^(?=### )/m).slice(1);
    for (const chapter of chapters) {
      const lot = chapter.match(/<!--\s*include:\s*generated\/lot-([^\s>]+)\.md/)?.[1] ?? slug(chapter.match(/^### (.+)$/m)?.[1] ?? 'lot');
      docs.push({ path: `lots/${lot}.md`, source: file, text: include(sourcesDir, chapter, missing) });
    }
  } else {
    docs.push({ path: `${name}.md`, source: file, text: include(sourcesDir, raw, missing) });
  }
}
for (const doc of docs) {
  doc.text = anchorHeadings(promoteHeadings(doc.text.trim()), 1, 3).text;
  doc.title = headingText(doc.text) || doc.path;
}

// ---------- Statut des écrans (pour trace.mjs dans l'application) ----------
const screens = {};
const specsDir = specsDirOf(root, config);
const site = existsSync(join(specsDir, 'sources', 'site.json')) ? JSON.parse(readFileSync(join(specsDir, 'sources', 'site.json'), 'utf8')) : {};
for (const name of site.lots ?? []) {
  const file = join(specsDir, 'sources', name, 'lot.json');
  if (!existsSync(file)) continue;
  const lot = JSON.parse(readFileSync(file, 'utf8'));
  for (const screen of new Set([...Object.keys(lot.screens ?? {}), ...Object.keys(lot.status ?? {})])) {
    const raw = lot.status?.[screen] ?? 'todo';
    screens[screen] = typeof raw === 'string' ? raw : raw.status;
  }
}

// ---------- Index (README.md) ----------
const titleSource = existsSync(join(sourcesDir, '00-titre.md')) ? readFileSync(join(sourcesDir, '00-titre.md'), 'utf8') : '';
const cell = (label) => titleSource.match(new RegExp(`^\\|\\s*${label}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, 'm'))?.[1] ?? null;
const version = cell('Version');
const status = cell('Statut');
const product = (config.title ?? 'Produit').split('·')[0].trim();
const top = git(root, 'rev-parse', '--show-toplevel');
const source = {
  repository: exportConfig.source ?? repositoryName(top && git(root, 'remote', 'get-url', 'origin')) ?? (top ? basename(top) : null),
  path: top ? posix(relative(top, root)) : null,
};
let existing = dest;
while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
const destTop = git(existing, 'rev-parse', '--show-toplevel');
const destFromApp = destTop ? posix(relative(destTop, dest)) || '.' : posix(relative(process.cwd(), dest));
const artifacts = Object.fromEntries(
  Object.entries({ ...config.artifacts, specs: config.artifacts?.specs || site.artifact }).filter(([key, url]) => url && key !== 'cdc'),
);
const link = (key, label) => (artifacts[key] ? `| ${label} | [artifact](${artifacts[key]}) |\n` : '');
let readme = `<!-- Généré par export.mjs (skill requirements-doc) depuis le cahier des charges : ne pas modifier ici. -->\n\n`;
readme += `# ${product} · exigences de développement\n\n`;
readme += `Extrait du cahier des charges pour l'équipe de développement et ses agents : règles et critères d'acceptation par lot, exigences non fonctionnelles, architecture et décisions techniques. Le document complet (lots chiffrés, planning, risques) se lit dans l'artifact du cahier des charges.\n\n`;
readme += `| | |\n|---|---|\n`;
if (version) readme += `| Version | ${version}${status ? ` (${status})` : ''} |\n`;
readme += link('requirements', 'Cahier des charges') + link('specs', 'Specs UI') + link('prototype', 'Prototype');
if (source.repository) readme += `| Source | \`${source.repository}\`${source.path ? ` · \`${source.path}\`` : ''} |\n`;
readme += `\n## Contenu\n\n| Fichier | Partie |\n|---|---|\n`;
for (const doc of docs) readme += `| [${doc.path}](${doc.path}) | ${doc.title} |\n`;
const inventory = join(sourcesDir, 'generated', 'inventaire.md');
if (existsSync(inventory)) readme += `\n## Écrans\n\n${readFileSync(inventory, 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '').trim()}\n`;
readme += `\n## Identifiants\n\n`;
readme += `- **RF-…** règles fonctionnelles, **CA-…** critères d'acceptation, **NF-…** exigences non fonctionnelles, **DT-…** décisions techniques.\n`;
readme += `- Un identifiant ne change jamais de sens et n'est jamais réutilisé : un critère abandonné reste, barré et marqué « Retiré ».\n`;
readme += `- Un test cite le critère qu'il vérifie dans son nom (« CA-CONN-27 · refuse une clé d'API »). La couverture se mesure avec \`trace.mjs\` du skill \`requirements-doc\` : \`node <skill>/scripts/trace.mjs ${destFromApp}\`.\n`;
readme += `- Les décisions **DT-…** viennent du cahier des charges. Une décision prise pendant les développements (ADR de l'équipe, hors de ce dossier) qui en remplace une se reporte dans le cahier des charges, qui marque la DT « Remplacée ».\n`;
readme += `- Ces fichiers ne se modifient pas ici. Un écart entre le code et ces exigences se reporte dans les specs ou le cahier des charges, puis l'export suivant met ce dossier à jour.\n`;
docs.unshift({ path: 'README.md', text: readme.trim() });

// ---------- Liens internes : vers le bon fichier, sinon en texte ----------
const owner = new Map(); // ancre → fichier
for (const doc of docs) for (const m of doc.text.matchAll(/<a id="([^"]+)"><\/a>/g)) if (!owner.has(m[1])) owner.set(m[1], doc.path);
let unlinked = 0;
for (const doc of docs) {
  doc.text = outsideCode(doc.text, (part) =>
    part.replace(/\[([^\]]+)\]\(#([^)\s]+)\)/g, (match, label, id) => {
      const target = owner.get(id);
      if (target === doc.path) return match;
      if (target) return `[${label}](${posix(relative(dirname(doc.path), target))}#${id})`;
      unlinked++;
      return label;
    }),
  );
  doc.text = `${doc.path === 'README.md' ? '' : `<!-- Généré par export.mjs (skill requirements-doc) depuis sources/${doc.source} : ne pas modifier ici. -->\n\n`}${doc.text.trim()}\n`;
}

// Ce qui ressemble à un coût ou à une charge, dans une partie exportée : à garder interne si besoin
const COST = /\d[\d\s.,]*\s?(?:k?€|K€|euros?\b)|\bTJM\b|\bjours?[- ]hommes?\b|\bj\/h\b/i;
for (const doc of docs.slice(1)) {
  doc.text.split('\n').forEach((line, i) => {
    if (COST.test(line)) warnings.push(`${doc.path}:${i + 1} looks like a cost or an estimate; if it must stay internal, wrap it in <!-- export:skip --> … <!-- /export:skip --> in sources/${doc.source}`);
  });
  const placeholders = (doc.text.match(/\{\{[^}]*\}\}/g) ?? []).length;
  if (placeholders) warnings.push(`${doc.path}: ${placeholders} unfilled placeholder(s) {{…}} (run check.mjs)`);
}

// ---------- Comparer, puis écrire ----------
const manifestFile = join(dest, 'export.json');
const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : null;
if (!previous && existsSync(dest) && readdirSync(dest).length && !args.includes('--force')) {
  console.error(`${dest} already exists and does not come from an export (no export.json): pass --force to write into it, or choose another folder.`);
  process.exit(1);
}
const files = Object.fromEntries(docs.map((doc) => [doc.path, sha(doc.text)]));
const manifest = {
  generator: 'requirements-doc/scripts/export.mjs',
  title: config.title ?? null,
  version,
  source: { ...source, commit: null },
  artifacts,
  screens,
  files,
};
const stable = (m) => JSON.stringify({ ...m, source: { ...m.source, commit: null } });
const changed = docs.filter((doc) => !existsSync(join(dest, doc.path)) || readFileSync(join(dest, doc.path), 'utf8') !== doc.text);
const removed = Object.keys(previous?.files ?? {}).filter((path) => !(path in files) && existsSync(join(dest, path)));
const upToDate = !changed.length && !removed.length && previous && stable(previous) === stable(manifest);
const shown = posix(relative(process.cwd(), dest)) || '.';

if (missing.length) warnings.push(`missing included files: ${[...new Set(missing)].join(', ')}`);
if (check) {
  if (upToDate) console.log(`Export ${shown} is up to date with the requirements (version ${version ?? '?'}).`);
  else {
    console.log(`Export ${shown} is behind the requirements: ${changed.length} file(s) to write, ${removed.length} to remove${previous && stable(previous) !== stable(manifest) && !changed.length ? ', manifest to update (screen status, links, version)' : ''}.`);
    for (const doc of changed) console.log(`  - ${doc.path}`);
    for (const path of removed) console.log(`  - ${path} (removed)`);
  }
} else if (upToDate) {
  console.log(`Export ${shown} is up to date, nothing written.`);
} else {
  for (const doc of changed) {
    mkdirSync(dirname(join(dest, doc.path)), { recursive: true });
    writeFileSync(join(dest, doc.path), doc.text);
  }
  for (const path of removed) rmSync(join(dest, path));
  manifest.source.commit = top ? git(root, 'rev-parse', '--short', 'HEAD') : null;
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Exported ${docs.length} file(s) to ${shown}: ${changed.length} written, ${removed.length} removed, ${docs.length - changed.length} unchanged.`);
  if (unlinked) console.log(`${unlinked} link(s) to parts that are not exported kept as plain text.`);
  console.log('Commit them in the application repository, in the same change as the code they concern. They are generated: never edit them there.');
}

// Destination notée pour les fois suivantes
if (!check && valueOf('--to')) {
  const relativeTo = posix(relative(root, dest));
  if (exportConfig.to !== relativeTo && configPath(root)) {
    const file = configPath(root);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.export = { ...(data.export ?? {}), to: relativeTo };
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Saved the destination in ${basename(file)} → export.to: ${relativeTo}`);
  }
}
for (const warning of warnings) console.log(`NOTE: ${warning}`);
process.exit(check && !upToDate ? 1 : 0);

#!/usr/bin/env node
/**
 * Traçabilité entre le cahier des charges et le code : quels critères d'acceptation (CA), règles (RF) et
 * exigences non fonctionnelles (NF) sont cités par le code et par les tests.
 *
 * Usage : node trace.mjs <projet>/requirements [--code apps,packages] [--write] [--json] [--strict]
 *         node trace.mjs docs/requirements [--code apps,packages] [--json] [--strict]   (export dans l'application)
 *
 * Convention : un test cite le critère qu'il vérifie, dans son nom ou en commentaire
 * (« it('CA-CONN-27 · refuse une clé d'API', …) »). Un identifiant cité hors des tests compte comme
 * « référencé » (implémenté, pas encore prouvé par un test).
 *
 * Le dossier lu est soit le cahier des charges (sources/), soit son export dans le dépôt de l'application
 * (export.json, écrit par export.mjs) : la CI de l'application trace ainsi ses tests sans le dépôt de specs.
 *
 * Code analysé : --code (chemins depuis le dossier courant, séparés par des virgules), sinon
 * requirements.json → code (chemins depuis le dossier du cahier des charges), sinon le dépôt git de l'export
 * (requirements.json → export.to, ou le dossier d'export lui-même), sinon deux niveaux au-dessus du cahier des
 * charges (ancienne disposition, specs/ dans le dépôt de l'application). Les dossiers des specs, du prototype et
 * du cahier des charges, ainsi que node_modules, dist, build… sont ignorés.
 *
 * Signale :
 *   - par lot : critères testés, seulement référencés, non couverts ;
 *   - les identifiants cités dans le code mais définis nulle part (faute de frappe, critère renuméroté), ou retirés ;
 *   - les écrans « Livré » dans les specs dont des critères ne sont pas testés.
 *   - sur un export : les fichiers modifiés à la main depuis l'export (empreintes de export.json).
 * --write écrit sources/generated/couverture.md (à inclure dans une annexe si on veut la publier).
 * --strict : code de sortie 1 s'il y a des identifiants inconnus ou retirés, des écrans livrés non testés ou un
 * export modifié à la main (CI).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, extname, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig, specsDirOf } from './config.mjs';

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') && resolve(args[0]);
// Export dans le dépôt de l'application (export.mjs) : définitions et statuts viennent de l'export
const exported = Boolean(root) && !existsSync(join(root, 'sources')) && existsSync(join(root, 'export.json'));
if (!root || (!exported && !existsSync(join(root, 'sources')))) {
  console.error('Usage: node trace.mjs <projet>/requirements | <app>/docs/requirements [--code apps,packages] [--write] [--json] [--strict]   (requirements folder with sources/, or an export with export.json)');
  process.exit(2);
}
if (exported && args.includes('--write')) {
  console.error('--write needs the requirements folder (sources/), not an export: run it in the specs repository.');
  process.exit(2);
}
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const config = exported ? {} : loadConfig(root);
const manifest = exported ? JSON.parse(readFileSync(join(root, 'export.json'), 'utf8')) : null;
const specsDir = exported ? null : specsDirOf(root, config);
const prototypeDir = config.prototype ? resolve(root, config.prototype) : null;
// Racine du dépôt git qui contient un dossier (ou son plus proche parent existant)
const repoOf = (dir) => {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return null;
  }
};
const exportDir = exported ? root : config.export?.to ? resolve(root, config.export.to) : null;
// Depuis le dépôt de specs, le code est le dépôt de l'export, à condition que son clone soit là : sans lui, remonter
// les dossiers trouverait un dépôt sans rapport (dépôt parent, dépôt de specs lui-même)
const within = (dir, parent) => dir === parent || dir.startsWith(parent + sep);
const specsRepo = exported ? null : repoOf(root);
const appRepo = exportDir && existsSync(exportDir) ? repoOf(exportDir) : null;
const appUsable = appRepo && !(specsRepo && within(specsRepo, appRepo));
const defaultCode = exported ? [appRepo ?? resolve(root, '../..')] : exportDir ? (appUsable ? [appRepo] : []) : [resolve(root, '../..')];
if (exportDir && !exported && !appUsable && !valueOf('--code') && !config.code) {
  console.log(`NOTE: no code traced: the export folder (requirements.json → export.to: ${config.export.to}) is not in a clone of the application. Clone it next to the specs repository, or pass --code.`);
}
const codeRoots = valueOf('--code')
  ? valueOf('--code').split(',').map((p) => resolve(p.trim()))
  : config.code
    ? [config.code].flat().map((p) => resolve(root, p))
    : defaultCode;

// ---------- Définitions (sources du cahier des charges, extraction comprise) ----------
const ID = /(?<![\w-])((?:CA|RF|NF)-(?:[A-Z]{2,5}-)?\d{2,3})(?![\w-])/g;
const listFiles = (dir, keep) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return keep(path, true) ? listFiles(path, keep) : [];
    return keep(path, false) ? [path] : [];
  });
const definitions = new Map(); // id → { kind, lot, screen, text }
const definitionsDir = exported ? root : join(root, 'sources');
// Lot d'un fichier : lots/<lot>-criteres.md et generated/lot-<lot>.md (sources), lots/<lot>.md (export)
const LOT_FILE = exported ? /^lots\/(.+)()\.md$/ : /^(?:lots\/(.+)-criteres|generated\/lot-(.+))\.md$/;
for (const file of listFiles(definitionsDir, (p, dir) => dir || p.endsWith('.md'))) {
  const lot = relative(definitionsDir, file).split(sep).join('/').match(LOT_FILE);
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/\*\*((?:CA|RF|NF)-(?:[A-Z]{2,5}-)?\d{2,3})\*\*\s*·?\s*(.*)$/);
    if (!m || definitions.has(m[1])) continue;
    const screen = m[2].match(/\]\([^)\s]*?#(e\d+)[a-z-]*\)/i)?.[1].toLowerCase() ?? null;
    const retired = /~~|\bRetirée?\b/.test(m[2]);
    definitions.set(m[1], { kind: m[1].slice(0, 2), retired, lot: lot ? lot[1] ?? lot[2] : null, screen, text: m[2].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').slice(0, 140) });
  }
}

// ---------- Citations dans le code ----------
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.turbo', '.cache', '.agents', '.claude', 'vendor']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.py', '.go', '.rb', '.php', '.java', '.kt', '.cs', '.rs', '.feature', '.sql', '.prisma', '.graphql', '.yml', '.yaml']);
const excluded = [root, specsDir, prototypeDir].filter(Boolean).map((d) => d + sep);
const isTest = (path) => /(?:^|[\\/])(?:__tests__|tests?|e2e|cypress|playwright)[\\/]|[.\-_](?:test|spec|e2e)\.[a-z]+$/i.test(path);
const citations = new Map(); // id → { tests: [file:line], code: [file:line] }
let scanned = 0;
for (const codeRoot of codeRoots) {
  if (!existsSync(codeRoot)) {
    console.log(`NOTE: code folder not found, skipped: ${relative(process.cwd(), codeRoot) || codeRoot}`);
    continue;
  }
  const files = statSync(codeRoot).isDirectory()
    ? listFiles(codeRoot, (p, dir) => (dir ? !SKIP.has(p.split(sep).at(-1)) && !excluded.some((d) => (p + sep).startsWith(d)) : EXTENSIONS.has(extname(p))))
    : [codeRoot];
  for (const file of files) {
    scanned++;
    const text = readFileSync(file, 'utf8');
    if (!/(?:CA|RF|NF)-/.test(text)) continue;
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(ID)) {
        const entry = citations.get(m[1]) ?? { tests: [], code: [] };
        entry[isTest(file) ? 'tests' : 'code'].push(`${relative(process.cwd(), file)}:${i + 1}`);
        citations.set(m[1], entry);
      }
    });
  }
}

// ---------- Statut des écrans dans les specs ----------
const screenStatus = new Map(exported ? Object.entries(manifest.screens ?? {}) : []); // e13 → done…
const site = !exported && existsSync(join(specsDir, 'sources', 'site.json')) ? JSON.parse(readFileSync(join(specsDir, 'sources', 'site.json'), 'utf8')) : {};
for (const name of site.lots ?? []) {
  const file = join(specsDir, 'sources', name, 'lot.json');
  if (!existsSync(file)) continue;
  const lot = JSON.parse(readFileSync(file, 'utf8'));
  for (const screen of Object.keys(lot.screens ?? {})) {
    const raw = lot.status?.[screen] ?? 'todo';
    screenStatus.set(screen, typeof raw === 'string' ? raw : raw.status);
  }
}

// ---------- Rapport ----------
const criteria = [...definitions].filter(([, d]) => d.kind === 'CA' && !d.retired);
const retiredCited = [...citations].filter(([id]) => definitions.get(id)?.retired).map(([id, c]) => ({ id, where: [...c.tests, ...c.code].slice(0, 3) }));
const byLot = new Map();
for (const [id, d] of criteria) {
  const c = citations.get(id);
  const state = c?.tests.length ? 'tested' : c?.code.length ? 'referenced' : 'uncovered';
  const lot = byLot.get(d.lot ?? '?') ?? { tested: 0, referenced: 0, uncovered: 0, total: 0 };
  lot[state]++;
  lot.total++;
  byLot.set(d.lot ?? '?', lot);
}
const unknown = [...citations].filter(([id]) => !definitions.has(id)).map(([id, c]) => ({ id, where: [...c.tests, ...c.code].slice(0, 3) }));
const untestedDelivered = criteria.filter(([id, d]) => d.screen && screenStatus.get(d.screen) === 'done' && !citations.get(id)?.tests.length).map(([id, d]) => ({ id, screen: d.screen, text: d.text }));
const otherCited = [...citations.keys()].filter((id) => definitions.has(id) && !id.startsWith('CA-')).sort();
// Export modifié dans l'application : il se régénère depuis le dépôt de specs, jamais à la main
const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const editedExport = exported
  ? Object.entries(manifest.files ?? {})
      .filter(([path, hash]) => !existsSync(join(root, path)) || sha(readFileSync(join(root, path), 'utf8')) !== hash)
      .map(([path]) => path)
  : [];

if (args.includes('--json')) {
  console.log(JSON.stringify({ scanned, lots: Object.fromEntries(byLot), unknown, retiredCited, untestedDelivered, citedRulesAndRequirements: otherCited, editedExport }, null, 2));
} else {
  const pct = (n, total) => (total ? `${Math.round((100 * n) / total)} %` : '–');
  console.log(`Traced ${criteria.length} acceptance criteria against ${scanned} code file(s) in ${codeRoots.map((r) => relative(process.cwd(), r) || '.').join(', ') || 'no folder'}.`);
  console.log('\nLot              tested  referenced  uncovered  total  tested %');
  for (const [lot, n] of byLot) console.log(`${lot.padEnd(16)} ${String(n.tested).padStart(6)}  ${String(n.referenced).padStart(10)}  ${String(n.uncovered).padStart(9)}  ${String(n.total).padStart(5)}  ${pct(n.tested, n.total).padStart(8)}`);
  if (otherCited.length) console.log(`\nRules and requirements cited in the code (${otherCited.length}): ${otherCited.join(', ')}`);
  if (unknown.length) console.log(`\nWARNING: identifiers cited in the code but defined nowhere (${unknown.length}): ${unknown.map((u) => `${u.id} (${u.where.join(', ')})`).join('; ')}`);
  if (retiredCited.length) console.log(`\nWARNING: retired identifiers still cited in the code (${retiredCited.length}): ${retiredCited.map((u) => `${u.id} (${u.where.join(', ')})`).join('; ')}`);
  if (untestedDelivered.length) console.log(`\nWARNING: screens delivered with untested criteria (${untestedDelivered.length}): ${untestedDelivered.map((u) => `${u.id} [${u.screen.toUpperCase()}]`).join(', ')}`);
  if (editedExport.length) console.log(`\nWARNING: exported files edited or removed since the export (${editedExport.length}): ${editedExport.join(', ')}. Change the requirements in the specs repository, then run export.mjs again.`);
  if (exported) console.log(`\nExport: version ${manifest.version ?? '?'}, from ${manifest.source?.repository ?? '?'}${manifest.source?.path ? ` · ${manifest.source.path}` : ''}${manifest.source?.commit ? ` @ ${manifest.source.commit}` : ''}.`);
}

if (args.includes('--write')) {
  const label = { tested: 'testés', referenced: 'référencés seulement', uncovered: 'non couverts' };
  let md = `<!-- Généré par trace.mjs (couverture des critères d'acceptation par le code) : ne pas modifier, relancer trace.mjs --write. -->\n\n`;
  md += `| Lot | CA ${label.tested} | CA ${label.referenced} | CA ${label.uncovered} | Total |\n|---|---|---|---|---|\n`;
  for (const [lot, n] of byLot) md += `| ${lot} | ${n.tested} | ${n.referenced} | ${n.uncovered} | ${n.total} |\n`;
  if (untestedDelivered.length) md += `\nÉcrans livrés dont des critères ne sont pas encore testés :\n\n${untestedDelivered.map((u) => `- **${u.id}** · ${u.screen.toUpperCase()} · ${u.text}`).join('\n')}\n`;
  const out = join(root, 'sources', 'generated');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'couverture.md'), md);
  console.log(`\nWrote ${relative(process.cwd(), join(out, 'couverture.md'))}.`);
}
process.exit(args.includes('--strict') && (unknown.length || retiredCited.length || untestedDelivered.length || editedExport.length) ? 1 : 0);

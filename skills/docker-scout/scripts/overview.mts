#!/usr/bin/env node
/**
 * Vue d'ensemble d'un dépôt qui construit plusieurs images : une page d'accueil et le rapport de chaque image, à publier
 * comme un seul artifact.
 *
 *   node overview.mts <parent> [--check]        (<parent> : .docker-scout, dont chaque sous-dossier a son scout.json)
 *
 * Lit <parent>/overview.json (textes), <parent>/scans/ (analyse du code source, commune aux images) et l'espace de
 * travail de chaque image. Écrit <parent>/site/index.html et <parent>/site/<image>.html. Champs variables :
 * {{api:current.total}} (sous-dossier : scan), {{source.total}} pour un scan commun.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_NOTES, SOURCE_USES, chips, createRenderer, esc, fr, page, plural, sourceUse } from './html.mts';
import type { Bar, SourceUse } from './html.mts';
import { CONFIG_FILE, countBySeverity, fail, fixVersion, formatSize, loadConfig, loadScans, parseArgs, rank, run, without, worst } from './lib.mts';
import type { Analysis, Finding, Scan, Step } from './types.mts';

interface Overview { title: string; pageTitle: string; lead: string; artifact?: string; order?: string[]; source?: string; findings?: Finding[]; steps?: Step[] }

const options = parseArgs(process.argv.slice(2), { flags: ['check'] });
const [input] = options.positionals;
if (!input) throw fail('usage : node overview.mts <parent> [--check]');
const parent = resolve(input);
const overviewPath = join(parent, 'overview.json');
if (!existsSync(overviewPath)) throw fail(`${overviewPath} absent : init.mts l’écrit pour un espace de travail .docker-scout/<image>.`);
const overview = JSON.parse(readFileSync(overviewPath, 'utf8')) as Overview;
const names = readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(parent, entry.name, CONFIG_FILE))).map((entry) => entry.name);
if (!names.length) throw fail(`aucune image dans ${parent} (sous-dossier avec ${CONFIG_FILE}).`);
names.sort((a, b) => ((overview.order?.indexOf(a) ?? -1) >>> 0) - ((overview.order?.indexOf(b) ?? -1) >>> 0) || a.localeCompare(b));

const shared = loadScans(parent);
const all: Record<string, Scan> = { ...shared };
const errors: string[] = [];
const images = names.flatMap((name) => {
  const dir = join(parent, name);
  const scans = loadScans(dir);
  for (const [label, scan] of Object.entries(scans)) all[`${name}:${label}`] = scan;
  const analysis = JSON.parse(readFileSync(join(dir, 'analysis.json'), 'utf8')) as Analysis;
  const reference = scans[analysis.reference];
  if (!reference) {
    errors.push(`${name} : scan de référence « ${analysis.reference} » introuvable`);
    return [];
  }
  return [{ name, dir, scans, analysis, reference, target: analysis.target ? scans[analysis.target] : undefined, config: loadConfig(dir) }];
});

// Rapport de chaque image, d'abord contrôlé puis écrit.
const site = join(parent, 'site');
const script = join(dirname(fileURLToPath(import.meta.url)), 'report.mts');
if (!options.flags.check) mkdirSync(site, { recursive: true });
for (const image of images) {
  const args = options.flags.check ? ['--check'] : ['--out', join(site, `${image.name}.html`), '--home', 'index.html'];
  const { status, stdout, stderr } = run(process.execPath, [script, image.dir, ...args]);
  for (const line of `${stdout}${stderr}`.split('\n').filter((text) => /^(Erreur|Avertissement)/.test(text))) console.log(`${image.name} · ${line}`);
  if (status !== 0) errors.push(`${image.name} : rapport en erreur${/^Erreur/m.test(stdout) ? '' : ` (${stderr.trim().split('\n').find((text) => /Error/.test(text)) ?? `code ${status}`})`}`);
}

const { inline, prose, code, finding, bars, section, sections } = createRenderer(all, errors);
const cards = images.map(({ name, reference, target, config }) => `<article class="card"><h3>${esc(config.image ?? name)}</h3><div class="big">${fr.format(reference.counts.total)}${target ? ` <small>→ ${fr.format(target.counts.total)} après corrections</small>` : ''}</div>${chips(reference.counts)}${target ? `<p>Après corrections :</p>${chips(target.counts)}` : ''}<p>${esc(reference.base?.ref ?? 'base inconnue')} · ${formatSize(reference.image?.size)} · ${plural(reference.packageCount, 'paquet')}${reference.health ? ` · health score ${reference.health.grade}${target?.health ? ` → ${target.health.grade}` : ''}` : ''}</p><p><a href="${esc(name)}.html">Ouvrir le rapport de ${esc(config.image ?? name)} →</a></p></article>`).join('');
const total = countBySeverity(images.flatMap(({ reference }) => reference.packages.flatMap((pkg) => pkg.vulnerabilities)));
const chart = bars(images.flatMap(({ name, reference, target, config }): Bar[] => [
  { label: config.image ?? name, note: 'image actuelle', counts: reference.counts },
  ...(target ? [{ label: config.image ?? name, note: 'après corrections, mesuré', counts: target.counts }] : []),
]), 'Failles par image');

// Actions de toutes les images, avec leur gain.
const actions = images.flatMap(({ name, analysis, scans, config }) => (analysis.actions ?? []).map((action) => {
  const before = action.gain ? scans[action.gain.from] : undefined;
  const after = action.gain?.to ? scans[action.gain.to] : before && action.gain?.without ? without(before, action.gain.without) : undefined;
  const gain = before && after ? `−${fr.format(before.counts.total - after.counts.total)} (${action.gain?.to ? 'mesuré' : 'estimé'})` : '';
  const status = { todo: ['À faire', 'info'], done: ['Fait', 'ok'], accepted: ['Risque accepté', 'warning'] }[action.status ?? 'todo'];
  return `<tr><td class="mono">${esc(config.image ?? name)}</td><td>${inline(action.title)}</td><td class="tnum">${gain}</td><td><span class="pill ${status[1]}">${status[0]}</span></td><td><a href="${esc(name)}.html#actions">Détail</a></td></tr>`;
})).join('');

// Code source : ce que les lockfiles et les actions contiennent sans entrer dans aucune image.
const source = overview.source ? shared[overview.source] : undefined;
if (overview.source && !source) errors.push(`scan « ${overview.source} » absent de ${parent}/scans`);
const PRIORITY: SourceUse[] = ['production', 'unknown', 'ci', 'development', 'image'];
function sourceBody(scan: Scan): string {
  const inImages = new Set(images.flatMap(({ reference }) => reference.packages.map((pkg) => `${pkg.name}@${pkg.version}`)));
  const manifests = images.flatMap(({ config }) => config.package || []);
  const packages = scan.packages.map((pkg) => ({ pkg, use: sourceUse(pkg, inImages, manifests) }))
    .sort((a, b) => PRIORITY.indexOf(a.use) - PRIORITY.indexOf(b.use) || rank(worst(a.pkg.vulnerabilities)) - rank(worst(b.pkg.vulnerabilities)) || b.pkg.vulnerabilities.length - a.pkg.vulnerabilities.length);
  const groups = PRIORITY.map((use) => ({ use, counts: countBySeverity(packages.filter((item) => item.use === use).flatMap((item) => item.pkg.vulnerabilities)) })).filter((group) => group.counts.total);
  const outside = packages.filter((item) => item.use !== 'image');
  const shown = outside.filter((item, index) => index < 15 || item.use === 'production');
  const rows = shown.map(({ pkg, use }) => `<tr><td class="mono">${esc(`${pkg.name} ${pkg.version}`)}</td><td>${chips(countBySeverity(pkg.vulnerabilities))}</td><td class="mono">${esc(fixVersion(pkg) ?? 'pas de correctif')}</td><td>${esc(SOURCE_USES[use])}${use === 'production' ? ` · ${esc(pkg.usedBy?.filter((path) => !manifests.length || manifests.includes(path)).join(', '))}` : ''}</td></tr>`).join('');
  return `<div class="grid">${groups.map(({ use, counts }) => `<article class="card"><h3>${SOURCE_USES[use]}</h3><div class="big">${fr.format(counts.total)}</div>${chips(counts)}<p>${SOURCE_NOTES[use]}</p></article>`).join('')}</div>${rows ? `<div class="table-box"><table><thead><tr><th>Paquet hors des images</th><th>Failles</th><th>Corrigé en</th><th>Usage</th></tr></thead><tbody>${rows}</tbody></table></div>${outside.length > shown.length ? `<p class="lead">${plural(outside.length - shown.length, 'autre paquet', 'autres paquets')}, hors production ou de sévérité moindre.</p>` : ''}` : ''}`;
}

const body = [
  section('images', 'Images', 'Vue d’ensemble', `${plural(total.total, 'vulnérabilité')} sur ${plural(images.length, 'image')}, dont ${plural(total.CRITICAL, 'critique')}`, 'Chaque image a son rapport complet : origine des failles, plan d’action, build, CI et tableau détaillé.', `<div class="grid">${cards}</div>${chart}`),
  section('constats', 'Constats', 'Ce qu’il faut retenir', 'Constats communs', '', (overview.findings ?? []).map(finding).join('')),
  section('actions', 'Corrections', 'Plan d’action', 'Corrections par image', '', actions ? `<div class="table-box"><table><thead><tr><th>Image</th><th>Correction</th><th>Failles</th><th>Statut</th><th></th></tr></thead><tbody>${actions}</tbody></table></div>` : ''),
  section('source', 'Code source', 'Dépendances et CI', 'Le code source, au-delà des images', source ? `${plural(source.counts.total, 'faille')} dans les lockfiles et les workflows, sur ${plural(source.packageCount, 'paquet')}.` : '', source ? sourceBody(source) : ''),
  section('mise-en-place', 'Mise en place', 'Pour toutes les images', 'Mise en place commune', '', (overview.steps ?? []).map((item: Step) => `<article class="card"><h3>${inline(item.title)}</h3>${item.body ? prose(item.body) : ''}${(item.code ?? []).map(code).join('')}</article>`).join('')),
].join('\n');
const date = new Date(Math.max(...images.map(({ reference }) => Date.parse(reference.scannedAt)))).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const html = page({
  title: overview.pageTitle,
  header: `<span class="eyebrow">Audit de vulnérabilités · Docker Scout</span><h1>${inline(overview.title)}</h1><p class="lead">${inline(overview.lead)}</p>`,
  nav: `${images.map(({ name, config }) => `<a href="${esc(name)}.html">${esc(config.image ?? name)}</a>`).join('')}${sections.map(({ id, nav }) => `<a href="#${id}">${esc(nav)}</a>`).join('')}`,
  body,
  footer: `<p>Analyse du ${date} avec Docker Scout ${esc(images[0]?.reference.scout)}.</p>`,
});

for (const message of new Set(errors)) console.log(`Erreur : ${message}`);
if (/\bTODO\b/.test(readFileSync(overviewPath, 'utf8'))) console.log('Avertissement : overview.json contient encore des textes à remplir (TODO)');
if (errors.length) process.exit(1);
if (options.flags.check) {
  console.log(`Vue d’ensemble valide : ${images.map((image) => image.name).join(', ')}.`);
  process.exit(0);
}
writeFileSync(join(site, 'index.html'), html);
const files = Object.fromEntries(images.map(({ name }) => [`${name}.html`, join(site, `${name}.html`)]));
console.log(`Site écrit : ${relative(process.cwd(), site)}/ (index, ${images.map((image) => image.name).join(', ')})`);
console.log(`Outil Artifact → file_path : ${join(site, 'index.html')}\n  root : ${site}\n  files : ${JSON.stringify(Object.fromEntries(Object.keys(files).map((name) => [name, name])))}`);
console.log(overview.artifact ? `  url : ${overview.artifact}` : '  Première publication : noter ensuite l’URL dans overview.json → artifact.');

#!/usr/bin/env node
/**
 * Reconstitue les sources d'un projet de specs à partir de son site construit, quand seul le site
 * publié subsiste (sources perdues, projet commencé sur une autre machine ou dans une autre conversation).
 *
 * Usage : node recover.mjs <site> <projet>/ui [--artifact <url>] [--force]
 *
 * <site> est un dossier qui reproduit le site publié (index.html, <lot>/index.html, <lot>/eN.html,
 * propositions.html) : les fichiers de l'artifact, lus un par un avec l'outil Artifact (`read` avec `paths`).
 *
 * Fait l'inverse de build.mjs : chaque section porte son fichier source (data-source), dont on retire ce que
 * le build ajoute (attribut data-source, badge de statut, liens réécrits vers les pages, chemins des images).
 * Produit sources/site.json, sources/<lot>/lot.json (libellé, titre, polices, écrans, statuts, résumé),
 * sources/<lot>/style.css, les fichiers NNN-*.html, les <template> (sources/shared/ quand plusieurs lots
 * partagent le même, sinon sources/<lot>/templates.html), tokens.css, propositions.html et site/.published.json (pages
 * en ligne, pour que la publication suivante retire celles qui n'ont plus de source).
 *
 * Ce qui ne se retrouve pas : un badge « Nouveau » remplacé par un statut (sans importance tant que le statut
 * est affiché), et le thème d'origine quand daisyUI est déclaré (le bloc @theme est repris tel qu'injecté).
 * Toujours vérifier ensuite : build.mjs sur les sources reconstituées, puis comparaison avec le site d'origine.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const [siteDir, root] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--artifact').map((p) => resolve(p));
if (!siteDir || !root || !existsSync(join(siteDir, 'index.html'))) {
  console.error('Usage: node recover.mjs <site> <projet>/ui [--artifact <url>] [--force]   (<site> must contain index.html)');
  process.exit(2);
}
if (existsSync(join(root, 'sources')) && !args.includes('--force')) {
  console.error(`${join(root, 'sources')} already exists (use --force to overwrite).`);
  process.exit(1);
}
const read = (path) => readFileSync(path, 'utf8');
const write = (path, content) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
};
const stripTags = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decode = (text) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Élément complet (balise ouvrante → fermante correspondante), en comptant les éléments imbriqués du même nom
function outerElement(html, start) {
  const tag = html.slice(start).match(/^<(\w+)/)[1];
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`unclosed <${tag}> at ${start}`);
}
const bodyOf = (html) => html.slice(html.indexOf('<div id="page"'), html.lastIndexOf('<script>'));

// Contenu d'une page issu des sources, découpé par fichier source. build.mjs assemble chaque page ainsi :
// navigation, [note de statut], sources (chacune trimée) jointes par une ligne vide, [liste des écrans
// après l'en-tête du lot], [pagination]. On retire le généré, puis on coupe avant chaque marqueur data-source,
// en rattachant au fichier suivant les commentaires qui précèdent sa balise marquée.
function sourceSegments(body) {
  // Fin du <div id="page"> : la dernière </div> avant les <template> (et leur commentaire) placés après lui
  const firstTemplate = body.search(/(?:<!--(?:(?!-->)[\s\S])*-->\s*)?<template id="/);
  let content = body.slice(body.indexOf('>') + 1, body.lastIndexOf('</div>', firstTemplate >= 0 ? firstTemplate : body.length));
  content = content.replace(/<nav aria-label="Écrans d[^"]*"[\s\S]*?<\/nav>/, '');
  const generated = [
    content.indexOf('<section id="ecrans"'),
    content.search(/<p class="mb-6 max-w-\[100ch\] rounded-xl border border-doc-line border-l-4 border-l-[\w-]+ bg-doc-card px-5 py-3 text-sm"><b class="font-semibold">/),
    content.lastIndexOf('<div class="mt-16 flex justify-between gap-4 border-t border-doc-line pt-4 text-sm">'),
  ].filter((i) => i >= 0);
  for (const start of generated.sort((a, b) => b - a)) content = content.slice(0, start) + content.slice(start + outerElement(content, start).length);
  const markers = [...content.matchAll(/<(?:section|header) data-source="([^"]+)"/g)];
  const starts = markers.map((m) => {
    // Remonter sur les commentaires et blancs qui précèdent la balise : ils appartiennent au même fichier
    let start = m.index;
    for (let before; (before = content.slice(0, start).match(/<!--(?:(?!-->)[\s\S])*-->\s*$/)); ) start = before.index;
    return start;
  });
  return markers.map((m, i) => ({ source: m[1], html: content.slice(i ? starts[i] : 0, starts[i + 1] ?? content.length).trim() }));
}
const extractTemplates = (html) => [...html.matchAll(/(?:<!--(?:(?!-->)[\s\S])*-->\s*)?<template id="([^"]+)">[\s\S]*?<\/template>/g)].map((m) => ({ id: m[1], html: m[0] }));

// ---------- Accueil : titre, introduction, ordre des lots ----------
const home = read(join(siteDir, 'index.html'));
const homeBody = bodyOf(home);
const homeHeader = outerElement(homeBody, homeBody.indexOf('<header'));
const lotItems = [...homeBody.matchAll(/<li\b[^>]*>\s*<a href="([\w-]+)\/index\.html"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/li>/g)];
const site = {
  title: decode(home.match(/<meta name="specs-ui-site" content="([^"]*)"/)?.[1] ?? ''),
  heading: homeHeader.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].trim(),
  intro: [...homeHeader.matchAll(/<p class="mt-4 text-doc-muted">([\s\S]*?)<\/p>/g)].map((m) => m[1].trim()),
  ...(valueOf('--artifact') ? { artifact: valueOf('--artifact') } : {}),
  lots: lotItems.map((m) => m[1]),
};
if (site.intro.length === 1) site.intro = site.intro[0];
if (/<b class="font-semibold text-doc-fg">Implémentation<\/b>/.test(homeBody)) site.implementation = true;
if (/<h2 class="text-xl font-semibold">Fonctionnalités<\/h2>/.test(homeBody)) site.grouping = 'features';
// Version de daisyUI : commentaire posé par build.mjs dans l'en-tête des pages qui emploient ses composants
const daisyui = site.lots.map((lot) => join(siteDir, lot)).filter((d) => existsSync(d)).flatMap((d) => readdirSync(d).map((f) => join(d, f))).map((f) => read(f).match(/<!-- daisyUI (\d+\.\d+\.\d+) :/)?.[1]).find(Boolean) ?? null;
// Les écarts du thème daisyUI (daisyui.theme) ne se retrouvent pas : à redéclarer depuis le thème du produit
if (daisyui) site.daisyui = daisyui;

// Liens réécrits par build.mjs vers les pages du site → liens écrits dans les sources
function unrewrite(html, lotName) {
  return html
    .replace(/(\b(?:src|href|poster)=["']|url\(["']?)(?:\.\.\/)*assets\//g, '$1assets/')
    .replace(/href="(?:\.\.\/)?propositions\.html(#[\w-]*)?"/g, (_, anchor) => `href="propositions.html${anchor ?? ''}"`)
    .replace(/href="(?:\.\.\/([\w-]+)\/)?(e\d+|index)\.html(#[\w-]+)?"/g, (link, lot, page, anchor) => {
      if (page !== 'index') return `href="${anchor ?? `#${page}`}"`; // ancres d'écran : uniques dans tout le site
      return `href="${lot ?? lotName}.html${anchor ?? ''}"`;
    });
}

// ---------- Lots ----------
const templatesByLot = new Map(); // lot → Map(id → html)
const report = [];
for (const [i, name] of site.lots.entries()) {
  const dir = join(siteDir, name);
  const index = read(join(dir, 'index.html'));
  const pages = readdirSync(dir).filter((f) => /^e\d+\.html$/.test(f)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  const lot = {};
  const nav = index.match(/<nav aria-label="Écrans d[^"]*"[\s\S]*?<\/nav>/)?.[0] ?? '';
  lot.label = stripTags(nav.match(/<a href="index\.html" aria-current="page"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? name);
  lot.title = decode(index.match(/<title>([\s\S]*?)<\/title>/)[1]);
  const fonts = index.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]+)">/)?.[1];
  if (fonts) lot.fonts = decode(fonts);
  lot.screens = Object.fromEntries([...nav.matchAll(/<a href="(e\d+)\.html"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], stripTags(m[2]).replace(/^E\d+ · /, '')]));
  if (!pages.length) {
    const summary = lotItems[i][3].match(/<p class="mt-1 text-sm text-doc-muted">([\s\S]*?)<\/p>/)?.[1];
    if (summary) lot.summary = summary.trim();
  }
  // Statuts : écran (liste de l'index, avec sa note), puis états qui en diffèrent (titre de chaque section)
  const status = {};
  for (const m of index.matchAll(/<li\b[^>]*><a href="(e\d+)\.html"[^>]*>[\s\S]*?<\/a> <span data-status="(\w+)"[^>]*>[^<]*<\/span>(?:<p class="mt-1 text-sm text-doc-gap">([\s\S]*?)<\/p>)?/g)) {
    status[m[1]] = m[3] ? { status: m[2], note: m[3] } : m[2];
  }
  const screenCode = (id) => (typeof status[id] === 'object' ? status[id].status : status[id]);

  const files = new Map(); // fichier source → html
  const templates = templatesByLot.get(name) ?? new Map();
  templatesByLot.set(name, templates);
  for (const file of ['index.html', ...pages]) {
    const html = read(join(dir, file));
    for (const { source: marker, html: segment } of sourceSegments(bodyOf(html))) {
      const source = marker.replace(`${name}/`, '');
      let el = segment.replace(` data-source="${marker}"`, '');
      const id = el.match(/^<section\b[^>]*\bid="([^"]+)"/)?.[1];
      const st = el.match(/<span data-status="(\w+)"[^>]*>[^<]*<\/span>/)?.[1];
      const screen = id?.match(/^e\d+/i)?.[0].toLowerCase();
      if (st && screen && id !== screen) {
        const parent = screenCode(screen);
        if (st !== parent && !(parent === 'change' && st === 'done')) status[id] = st;
      }
      el = el.replace(/(<h2\b[^>]*>[\s\S]*?)<span data-status="\w+"[^>]*>[^<]*<\/span>/, '$1');
      files.set(source, unrewrite(el, name) + '\n');
    }
    for (const t of extractTemplates(html.slice(html.indexOf('</div>\n\n', html.indexOf('<div id="page"'))))) templates.set(t.id, t.html);
  }
  if (Object.keys(status).length) lot.status = status;
  for (const [file, html] of files) write(join(root, 'sources', name, file), html);
  write(join(root, 'sources', name, 'lot.json'), JSON.stringify(lot, null, 2) + '\n');
  const style = index.match(/\/\* ===== CSS propre au lot \(style\.css\) ===== \*\/\n([\s\S]*?)\n\s*\/\* =+ 2\. Habillage/)?.[1];
  if (style?.trim()) write(join(root, 'sources', name, 'style.css'), style.replace(/^ {2}/gm, '').trim() + '\n');
  report.push(`${name}: ${files.size} files, ${pages.length} screens`);
}

// ---------- Templates : partagés quand plusieurs lots ont le même, sinon propres au lot ----------
const allIds = new Set([...templatesByLot.values()].flatMap((m) => [...m.keys()]));
const shared = { shells: [], components: [] };
const perLot = new Map();
for (const id of allIds) {
  const versions = [...templatesByLot].filter(([, m]) => m.has(id)).map(([lot, m]) => ({ lot, html: m.get(id) }));
  const counts = new Map();
  for (const v of versions) counts.set(v.html, (counts.get(v.html) ?? 0) + 1);
  const [common, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const isShared = n > 1 || id.startsWith('tpl-shell-');
  if (isShared) shared[id.startsWith('tpl-shell-') ? 'shells' : 'components'].push(unrewrite(common, ''));
  for (const v of versions) {
    if (isShared && v.html === common) continue;
    perLot.set(v.lot, [...(perLot.get(v.lot) ?? []), unrewrite(v.html, v.lot)]);
  }
}
if (shared.shells.length) write(join(root, 'sources', 'shared', 'shells.html'), shared.shells.join('\n\n') + '\n');
if (shared.components.length) write(join(root, 'sources', 'shared', 'components.html'), shared.components.join('\n\n') + '\n');
for (const [lot, list] of perLot) write(join(root, 'sources', lot, 'templates.html'), list.join('\n\n') + '\n');

// ---------- Site, tokens, propositions ----------
write(join(root, 'sources', 'site.json'), JSON.stringify(site, null, 2) + '\n');
const theme = home.match(/@theme(?: static)?\s*\{[\s\S]*?\n\s*\}/)?.[0].replace(/^ {2}/gm, '').replace(/^@theme static/, '@theme');
if (theme) write(join(root, 'tokens.css'), `/* Identité de ${site.title}, reprise du site publié par recover.mjs : compléter la source et la date. */\n${theme}\n`);
if (existsSync(join(siteDir, 'propositions.html'))) copyFileSync(join(siteDir, 'propositions.html'), join(root, 'propositions.html'));
// État publié : les fichiers en ligne, avec une empreinte qu'aucun build ne produit. La publication suivante
// (prepare-publish.mjs, sans --all) envoie donc toutes les pages et retire de l'artifact celles qui n'ont plus de source.
const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name.startsWith('.') ? [] : e.isDirectory() ? listFiles(join(dir, e.name)) : [relative(siteDir, join(dir, e.name)).split('\\').join('/')]));
write(join(root, 'site', '.published.json'), JSON.stringify(Object.fromEntries(listFiles(siteDir).sort().map((p) => [p, 'recovered'])), null, 2) + '\n');

console.log(`Recovered ${site.lots.length} lots into ${join(root, 'sources')}:\n  ${report.join('\n  ')}`);
console.log(`Templates: ${shared.shells.length} shells, ${shared.components.length} shared components, ${[...perLot.values()].flat().length} lot-specific.`);
if (!theme) console.log('WARNING: no @theme block found, write tokens.css by hand.');
if (daisyui) console.log(`NOTE: daisyUI ${daisyui} declared; redeclare the product theme deviations (site.json → daisyui.theme) if it had any.`);
console.log('Next: node build.mjs <projet>/ui, then compare the rebuilt site with the original before editing.');

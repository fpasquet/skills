#!/usr/bin/env node
/**
 * Construit le site de specs d'un projet à partir de ses sources : une page d'accueil, une page
 * d'index par lot et une page par écran (tous les états d'un écran sur la même page).
 *
 * Usage : node build.mjs specs/ui
 *
 * Sources (voir SKILL.md, « Sources et site ») :
 *   ui/tokens.css                   bloc @theme du produit, injecté dans chaque page
 *   ui/propositions.html            (facultatif) copié tel quel dans le site
 *   ui/sources/site.json            { "title", "heading", "intro" (texte ou liste de paragraphes), "artifact",
 *                                   "lots": ["connexion", …], "implementation": true (statut d'implémentation affiché),
 *                                   "assets": "../../apps/web/public/assets" (facultatif : dossier des images, voir plus bas) }
 *   ui/sources/shared/*.html        <template> partagés par tous les lots : shells.html (coquilles),
 *                                   components.html (composants communs : en-tête de projet…)
 *   ui/sources/<lot>/lot.json       { "label", "title", "fonts", "screens": { "e13": "titre court" },
 *                                   "status": { "e13": "done", "e14": { "status": "gap", "note": "…" } } }
 *   ui/sources/<lot>/style.css      (facultatif) CSS propre au lot
 *   ui/sources/<lot>/NNN-*.html     000-header.html, une section par fichier (ordre numérique) :
 *                                   les sections eN… vont sur la page de l'écran N, les autres
 *                                   (règles, points ouverts, journal, identité) sur l'index du lot
 *   ui/sources/<lot>/templates.html (facultatif) <template> propres au lot (même id = remplace le partagé)
 *
 * Images (logos, illustrations, photos du produit) : les sources les citent par « assets/<chemin> »
 * (src, href, poster, url(…)). Le dossier vient de site.json → assets (chemin relatif à ui/, par exemple le
 * dossier public de l'application, pour reprendre ses vraies images) ou, par défaut, ui/assets/. Seules les
 * images citées sont copiées dans site/assets/, et chaque page les cite par un chemin relatif.
 *
 * Statut d'implémentation (site.json → implementation) : todo (défaut), doing, done, gap. Le badge remplace
 * le badge « Nouveau » de chaque état, et l'avancement apparaît dans la navigation, l'index du lot et l'accueil.
 *
 * Sortie : ui/site/index.html, site/<lot>/index.html, site/<lot>/eN.html, site/propositions.html.
 * Le build est déterministe (aucune date) : le site construit peut être commité avec ses sources.
 * Les liens « #e13b », « sessions.html#e13b » ou « propositions.html#retenu » sont réécrits vers la bonne page.
 * L'habillage, le script et la version viennent du template du skill ; la typographie française est appliquée.
 * Affiche la liste des pages modifiées depuis la construction précédente.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTypography } from './typography.mjs';

const root = process.argv[2] && resolve(process.argv[2]);
if (!root || !existsSync(join(root, 'sources', 'site.json'))) {
  console.error('Usage: node build.mjs specs/ui   (the folder must contain sources/site.json)');
  process.exit(2);
}
const read = (path, fallback = '') => (existsSync(path) ? readFileSync(path, 'utf8') : fallback);
const site = JSON.parse(read(join(root, 'sources', 'site.json')));
const outDir = join(root, 'site');

// Template du skill : version, habillage du document, script final
const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'specs.html'), 'utf8');
const version = template.match(/<meta name="specs-ui-template" content="([^"]+)">/)[1];
const chromeStart = template.search(/\/\* =+ 2\. Habillage du document/);
const chrome = template.slice(chromeStart, template.indexOf('</style>', chromeStart)).trimEnd();
const finalScript = [...template.matchAll(/<script>[\s\S]*?<\/script>/g)].at(-1)[0];
const theme = read(join(root, 'tokens.css')).match(/@theme\s*\{[\s\S]*?\n\}/)?.[0];
if (!theme) {
  console.error(`@theme block not found in ${join(root, 'tokens.css')}`);
  process.exit(1);
}
const extractTemplates = (html) => [...html.matchAll(/(?:<!--(?:(?!-->)[\s\S])*-->\s*)?<template id="([^"]+)">[\s\S]*?<\/template>/g)].map((m) => ({ id: m[1], html: m[0] }));
const sharedDir = join(root, 'sources', 'shared');
const sharedTemplates = existsSync(sharedDir) ? readdirSync(sharedDir).filter((f) => f.endsWith('.html')).sort().flatMap((f) => extractTemplates(read(join(sharedDir, f)))) : [];
const stripTags = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// ---------- Statut d'implémentation ----------
const STATUSES = {
  todo: { label: 'À développer', color: 'doc-muted' },
  doing: { label: 'En cours', color: 'doc-accent' },
  done: { label: 'Livré', color: 'doc-new' },
  gap: { label: 'Écart', color: 'doc-gap' },
};
const tracking = site.implementation === true;
const invalidStatuses = new Set();
function statusOf(lot, screen) {
  if (!tracking) return null;
  const raw = lot.status?.[screen] ?? 'todo';
  const code = typeof raw === 'string' ? raw : raw.status;
  if (!STATUSES[code]) invalidStatuses.add(`${screen}: ${code}`);
  return { code: STATUSES[code] ? code : 'todo', note: typeof raw === 'object' ? raw.note ?? '' : '', ...STATUSES[STATUSES[code] ? code : 'todo'] };
}
const statusBadge = (st) => `<span data-status="${st.code}" class="rounded bg-${st.color}/15 px-1.5 py-0.5 font-doc text-xs font-semibold text-${st.color}">${st.label}</span>`;
const statusDot = (st) => `<span title="${st.label}" class="inline-block size-2 rounded-full bg-${st.color}"></span>`;
// Le badge de statut remplace le badge « Nouveau » du titre de chaque état (ou s'ajoute à la fin du titre)
const NEW_BADGE = /<span\b[^>]*\bdoc-new\b[^>]*>Nouveau<\/span>/;
function withStatus(html, st) {
  if (!st) return html;
  return html.replace(/(<h2\b[^>]*>)([\s\S]*?)(<\/h2>)/, (_, open, inner, close) => `${open}${NEW_BADGE.test(inner) ? inner.replace(NEW_BADGE, statusBadge(st)) : `${inner}${statusBadge(st)}`}${close}`);
}
function progress(pages) {
  const counts = Object.fromEntries(['done', 'doing', 'gap', 'todo'].map((k) => [k, pages.filter((p) => p.status?.code === k).length]));
  return Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${statusDot(STATUSES[k])} ${n} ${STATUSES[k].label.toLowerCase()}`).join(' · ');
}

// Ajoute data-source="<lot>/<fichier>" à la première balise <section> ou <header> d'une source
const withSource = (html, source) => html.replace(/<(section|header)\b(?![^>]*\bdata-source=)/, `<$1 data-source="${source}"`);

// ---------- Lecture des lots ----------
const lots = site.lots.map((name) => {
  const dir = join(root, 'sources', name);
  const lot = { name, ...JSON.parse(read(join(dir, 'lot.json'), '{}')) };
  const files = readdirSync(dir).filter((f) => /^\d+-.*\.html$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const headerFile = files.find((f) => /^0+-/.test(f));
  lot.header = headerFile ? withSource(read(join(dir, headerFile)).trim(), `${name}/${headerFile}`) : '';
  lot.sections = files.filter((f) => !/^0+-/.test(f)).map((f) => {
    // La source de chaque section est inscrite dans la page (data-source) : un retour de relecture la cite.
    const html = withSource(read(join(dir, f)).trim(), `${name}/${f}`);
    const id = html.match(/^<section\b[^>]*\bid="([^"]+)"/)?.[1] ?? f.replace(/^\d+-|\.html$/g, '');
    const screen = id.match(/^e(\d+)/i)?.[0].toLowerCase() ?? null;
    return { file: f, id, screen, html };
  });
  lot.style = read(join(dir, 'style.css')).trim();
  lot.templates = extractTemplates(read(join(dir, 'templates.html')));
  // Pages d'écran : sections regroupées par numéro d'écran, dans l'ordre d'apparition
  lot.pages = [];
  for (const s of lot.sections.filter((s) => s.screen)) {
    let page = lot.pages.find((p) => p.screen === s.screen);
    if (!page) lot.pages.push((page = { screen: s.screen, sections: [] }));
    page.sections.push(s);
  }
  for (const page of lot.pages) {
    const h2 = page.sections[0].html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '';
    const full = stripTags(h2.replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, ''));
    page.title = lot.screens?.[page.screen] ?? full.split(/\s[:·–—]\s/)[0] ?? page.screen.toUpperCase();
    page.path = `${name}/${page.screen}.html`;
    page.status = statusOf(lot, page.screen);
    page.states = page.sections.map((s) => ({ id: s.id, title: stripTags((s.html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '').replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, '')) }));
  }
  lot.indexPath = `${name}/index.html`;
  return lot;
});

// ---------- Réécriture des liens ----------
const anchorPage = new Map(); // id → page (chemin depuis la racine du site)
const lotPage = new Map(); // nom de l'ancien document (connexion.html) → index du lot
const duplicates = new Set();
for (const lot of lots) {
  if (lot.output) lotPage.set(lot.output, lot.indexPath);
  lotPage.set(`${lot.name}.html`, lot.indexPath);
  for (const s of lot.sections) {
    // Les ancres de section non-écran (ouverts, journal…) se répètent d'un lot à l'autre : seules les ancres d'écran doivent être uniques
    if (s.screen && anchorPage.has(s.id)) duplicates.add(`${s.id} (${lot.name} and ${anchorPage.get(s.id).split('/')[0]})`);
    if (s.screen || !anchorPage.has(s.id)) anchorPage.set(s.id, s.screen ? `${lot.name}/${s.screen}.html` : lot.indexPath);
  }
  // Renvoi vers un écran entier (« #e9 ») : sa page, quand aucun état ne porte déjà cet identifiant
  for (const p of lot.pages) if (!anchorPage.has(p.screen)) anchorPage.set(p.screen, p.path);
}
// Ancre d'écran ou d'état (« #e13 », « #e13b ») : un lien vers un écran qui n'existe pas (retiré, renuméroté) est signalé
const screenAnchor = (anchor) => /^#e\d+[a-z]?$/i.test(anchor ?? '');
const hasPropositions = existsSync(join(root, 'propositions.html'));
const relativeTo = (from, to) => posix.relative(posix.dirname(from), to) || posix.basename(to);
// Images : « assets/… » dans les sources, chemin relatif à la page dans le site ; citées → copiées
const assetsDir = site.assets ? resolve(root, site.assets) : join(root, 'assets');
const usedAssets = new Map(); // chemin dans assets/ → première page qui le cite
const rewriteAssets = (html, pagePath) =>
  html.replace(/(\b(?:src|href|poster)=["']|url\(["']?)assets\/([^"')?#\s]+)/g, (match, prefix, path) => {
    if (path.split('/').includes('..')) return match;
    if (!usedAssets.has(path)) usedAssets.set(path, pagePath);
    return `${prefix}${relativeTo(pagePath, `assets/${path}`)}`;
  });
const unresolved = new Set();
// Balises de structure non fermées dans le contenu d'une page (un <header> ouvert avale tout ce qui suit)
const unbalanced = new Set();
const checkStructure = (path, html) => {
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  for (const tag of ['header', 'section', 'div', 'table', 'template', 'aside', 'main', 'nav']) {
    const opened = (text.match(new RegExp(`<${tag}[\\s>]`, 'gi')) ?? []).length;
    const closed = (text.match(new RegExp(`</${tag}>`, 'gi')) ?? []).length;
    if (opened !== closed) unbalanced.add(`${path} (<${tag}> ${opened} opened, ${closed} closed)`);
  }
};
function rewriteLinks(html, pagePath) {
  return html.replace(/href="([\w.-]+\.html)?(#[\w-]+)?"/g, (link, file, anchor) => {
    if (!file && !anchor) return link;
    if (file === 'propositions.html' && hasPropositions) return `href="${relativeTo(pagePath, 'propositions.html')}${anchor ?? ''}"`;
    let target;
    if (anchor && anchorPage.has(anchor.slice(1)) && (!file || lotPage.has(file))) target = anchorPage.get(anchor.slice(1));
    else if (screenAnchor(anchor)) {
      unresolved.add(`${file ?? ''}${anchor} (in ${pagePath}, unknown screen)`);
      return link;
    } else if (file && lotPage.has(file)) target = lotPage.get(file);
    else if (file) {
      unresolved.add(`${file}${anchor ?? ''} (in ${pagePath})`);
      return link;
    } else return link; // ancre propre à la page (section non découpée)
    if (target === pagePath) return `href="${anchor ?? '#'}"`;
    return `href="${relativeTo(pagePath, target)}${anchor ?? ''}"`;
  });
}

// ---------- Gabarit de page ----------
function usedTemplates(html, available) {
  const byId = new Map(available.map((t) => [t.id, t]));
  const used = new Set();
  const queue = [...html.matchAll(/data-use="([^"]+)"/g)].map((m) => `tpl-${m[1]}`);
  while (queue.length) {
    const id = queue.shift();
    if (used.has(id) || !byId.has(id)) continue;
    used.add(id);
    for (const m of byId.get(id).html.matchAll(/data-use="([^"]+)"/g)) queue.push(`tpl-${m[1]}`);
  }
  return available.filter((t) => used.has(t.id));
}
function renderPage({ title, fonts, lotStyle = '', templates = [], body }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="specs-ui-template" content="${version}">
<meta name="specs-ui-site" content="${(site.title ?? '').replace(/"/g, '&quot;')}">
<!-- Page construite par build.mjs (skill specs-ui) depuis les sources : modifier les sources, pas ce fichier. -->
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts ? `<link rel="stylesheet" href="${fonts}">\n` : ''}<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.13"></script>
<script src="https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js"></script>
<style type="text/tailwindcss">
  /* ===== 1. Identité du produit : tokens.css ===== */
  ${theme.replace(/\n/g, '\n  ')}
${lotStyle ? `\n  /* ===== CSS propre au lot (style.css) ===== */\n  ${lotStyle.replace(/\n/g, '\n  ')}\n` : ''}
  ${chrome}
</style>
</head>
<body>
<div id="page" class="mx-auto max-w-[1400px] px-4 pt-6 pb-24 sm:px-6">
${body}
</div>

${templates.map((t) => t.html).join('\n\n')}

${finalScript}
</body>
</html>
`;
}
const chip = (href, label, current = false) =>
  `<a href="${href}"${current ? ' aria-current="page"' : ''} class="rounded-full border border-doc-line bg-doc-card px-3 py-1 text-sm hover:border-doc-accent aria-[current=page]:border-doc-accent aria-[current=page]:font-semibold aria-[current=page]:text-doc-accent">${label}</a>`;
function lotNav(lot, pagePath) {
  const rel = (to) => relativeTo(pagePath, to);
  return `<nav aria-label="Écrans du lot" class="sticky top-[env(safe-area-inset-top,0px)] z-40 -mx-4 mb-6 flex flex-wrap items-center gap-2 bg-doc-bg/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
  <a href="${rel('index.html')}" class="text-sm text-doc-muted hover:text-doc-accent">${site.title}</a><span class="text-doc-muted">/</span>
  ${chip(rel(lot.indexPath), lot.label ?? lot.name, pagePath === lot.indexPath)}
  ${lot.pages.map((p) => chip(rel(p.path), `${p.status ? `${statusDot(p.status)} ` : ''}${p.screen.toUpperCase()} · ${p.title}`, pagePath === p.path)).join('\n  ')}
</nav>`;
}

// ---------- Génération ----------
const pages = new Map(); // chemin → html
for (const lot of lots) {
  const allTemplates = [...sharedTemplates.filter((t) => !lot.templates.some((l) => l.id === t.id)), ...lot.templates];
  // Index du lot : en-tête, liste des écrans, sections hors écran
  const screenList = `<section id="ecrans" class="mt-10 scroll-mt-16">
  <h2 class="text-xl font-semibold">Écrans du lot</h2>
  ${tracking ? `<p class="mt-1 text-sm text-doc-muted">Implémentation : ${progress(lot.pages)}</p>` : ''}
  <ol class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    ${lot.pages.map((p) => `<li class="rounded-xl border border-doc-line bg-doc-card px-4 py-3"><a href="${relativeTo(lot.indexPath, p.path)}" class="font-semibold hover:text-doc-accent"><span class="font-mono text-sm text-doc-accent">${p.screen.toUpperCase()}</span> ${p.title}</a>${p.status ? ` ${statusBadge(p.status)}` : ''}${p.status?.note ? `<p class="mt-1 text-sm text-doc-gap">${p.status.note}</p>` : ''}<ul class="mt-1 text-sm text-doc-muted">${p.states.map((s) => `<li><a href="${relativeTo(lot.indexPath, p.path)}#${s.id}" class="hover:text-doc-accent"><span class="font-mono">${s.id.toUpperCase()}</span> ${s.title}</a></li>`).join('')}</ul></li>`).join('\n    ')}
  </ol>
</section>`;
  // Seul le contenu issu des sources est réécrit ; la navigation générée a déjà des liens relatifs
  const indexBody = [lotNav(lot, lot.indexPath), rewriteLinks(lot.header, lot.indexPath), screenList, ...lot.sections.filter((s) => !s.screen).map((s) => rewriteLinks(s.html, lot.indexPath))].join('\n\n');
  checkStructure(lot.indexPath, indexBody);
  pages.set(lot.indexPath, renderPage({ title: `${lot.title ?? lot.label}`, fonts: lot.fonts, lotStyle: lot.style, templates: usedTemplates(indexBody, allTemplates), body: indexBody }));
  // Une page par écran
  lot.pages.forEach((p, i) => {
    const prev = lot.pages[i - 1];
    const next = lot.pages[i + 1];
    const pager = `<div class="mt-16 flex justify-between gap-4 border-t border-doc-line pt-4 text-sm">${prev ? `<a href="${relativeTo(p.path, prev.path)}" class="hover:text-doc-accent">← ${prev.screen.toUpperCase()} · ${prev.title}</a>` : '<span></span>'}${next ? `<a href="${relativeTo(p.path, next.path)}" class="hover:text-doc-accent">${next.screen.toUpperCase()} · ${next.title} →</a>` : '<span></span>'}</div>`;
    const note = p.status?.note ? `<p class="mb-6 max-w-[100ch] rounded-xl border border-doc-line border-l-4 border-l-${p.status.color} bg-doc-card px-5 py-3 text-sm"><b class="font-semibold">${p.status.label}</b> · ${p.status.note}</p>` : '';
    const body = [lotNav(lot, p.path), note, ...p.sections.map((s) => withStatus(rewriteLinks(s.html, p.path), p.status)), pager].filter(Boolean).join('\n\n');
    checkStructure(p.path, body);
    pages.set(p.path, renderPage({ title: `${p.screen.toUpperCase()} · ${p.title} · ${site.title}`, fonts: lot.fonts, lotStyle: lot.style, templates: usedTemplates(body, allTemplates), body }));
  });
}
// Accueil du projet
const homeBody = `<header>
  <p class="font-mono text-xs font-medium tracking-wider text-doc-accent uppercase">${site.title} · Specs UI</p>
  <h1 class="mt-1 text-3xl font-semibold tracking-tight text-balance">${site.heading ?? site.title}</h1>
  ${[site.intro ?? []].flat().map((paragraph) => `<p class="mt-4 text-doc-muted">${paragraph}</p>`).join('\n  ')}
</header>
${tracking ? `<p class="mt-6 text-sm text-doc-muted"><b class="font-semibold text-doc-fg">Implémentation</b> : ${progress(lots.flatMap((l) => l.pages))}</p>` : ''}
${hasPropositions ? `<p class="mt-6"><a href="propositions.html" class="rounded-full border border-doc-line bg-doc-card px-3 py-1 text-sm hover:border-doc-accent">Propositions d'interface et décision →</a></p>` : ''}
<section id="lots" class="mt-8">
  <h2 class="text-xl font-semibold">Lots</h2>
  <ol class="mt-3 grid gap-4 md:grid-cols-2">
    ${lots.map((lot) => `<li class="rounded-xl border border-doc-line bg-doc-card px-5 py-4"><a href="${lot.indexPath}" class="text-lg font-semibold hover:text-doc-accent">${lot.label ?? lot.name}</a><p class="mt-1 text-sm text-doc-muted">${lot.pages.map((p) => `<a href="${p.path}" class="hover:text-doc-accent">${p.status ? `${statusDot(p.status)} ` : ''}${p.screen.toUpperCase()} ${p.title}</a>`).join(' · ')}</p>${tracking ? `<p class="mt-2 text-sm text-doc-muted">Implémentation : ${progress(lot.pages)}</p>` : ''}</li>`).join('\n    ')}
  </ol>
</section>`;
pages.set('index.html', renderPage({ title: `${site.title} · Specs UI`, fonts: lots[0]?.fonts, body: homeBody }));

// Écriture, avec typographie et liste des pages modifiées
const changed = [];
for (const [path, html] of pages) {
  const { html: output } = applyTypography(rewriteAssets(html, path));
  const target = join(outDir, path);
  mkdirSync(dirname(target), { recursive: true });
  if (read(target) !== output) changed.push(path);
  writeFileSync(target, output);
}
if (hasPropositions) {
  const target = join(outDir, 'propositions.html');
  if (read(target) !== read(join(root, 'propositions.html'))) changed.push('propositions.html');
  copyFileSync(join(root, 'propositions.html'), target);
}
// Images citées : copiées si elles ont changé ; les autres sortent du site (jamais publiées par erreur)
const missingAssets = [];
for (const [path, page] of usedAssets) {
  const source = join(assetsDir, path);
  if (!existsSync(source)) {
    missingAssets.push(`assets/${path} (in ${page})`);
    continue;
  }
  const target = join(outDir, 'assets', path);
  const before = existsSync(target) ? readFileSync(target) : null;
  const content = readFileSync(source);
  if (before && before.equals(content)) continue;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  changed.push(`assets/${path}`);
}
const listFiles = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)])) : []);
const removedAssets = [];
for (const file of listFiles(join(outDir, 'assets'))) {
  const path = relative(join(outDir, 'assets'), file).split('\\').join('/');
  if (!usedAssets.has(path)) {
    unlinkSync(file);
    removedAssets.push(`assets/${path}`);
  }
}
// Pages sans source (écran retiré, lot retiré) : supprimées, pour ne jamais les publier par erreur
const listPages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listPages(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []));
const removed = [];
for (const file of listPages(outDir)) {
  const path = relative(outDir, file).split('\\').join('/');
  if (!pages.has(path) && !(path === 'propositions.html' && hasPropositions)) {
    unlinkSync(file);
    removed.push(path);
  }
}
// Changement de version du template entre deux constructions : toutes les pages changent, le dire.
// Aucune date dans ce fichier : deux builds des mêmes sources donnent un site identique (commitable).
const buildInfoPath = join(outDir, '.build.json');
const previousVersion = existsSync(buildInfoPath) ? JSON.parse(readFileSync(buildInfoPath, 'utf8')).version : null;
writeFileSync(buildInfoPath, JSON.stringify({ version }, null, 2) + '\n');
if (previousVersion && previousVersion !== version) console.log(`NOTE: template changed from ${previousVersion} to ${version} since the last build (skill updated): every page is rebuilt.`);
const sizes = [...pages.values()].map((h) => h.length);
console.log(`Built ${relative(process.cwd(), outDir) || outDir}: ${pages.size + (hasPropositions ? 1 : 0)} pages (largest ${Math.round(Math.max(...sizes) / 1024)} KB), template ${version}.`);
console.log(changed.length ? `Changed pages (${changed.length}): ${changed.join(', ')}` : 'No page changed.');
if (duplicates.size) console.log(`WARNING: screen ids used in several lots (links will be wrong): ${[...duplicates].join(', ')}`);
if (removed.length) console.log(`Removed pages without source: ${removed.join(', ')}`);
if (usedAssets.size) console.log(`Images: ${usedAssets.size} cited, copied from ${relative(process.cwd(), assetsDir) || assetsDir}.`);
if (removedAssets.length) console.log(`Removed images no page cites: ${removedAssets.join(', ')}`);
if (missingAssets.length) console.log(`WARNING: images not found in ${relative(process.cwd(), assetsDir) || assetsDir} (${missingAssets.length}): ${missingAssets.join(', ')}`);
if (invalidStatuses.size) console.log(`WARNING: unknown implementation status (todo, doing, done, gap): ${[...invalidStatuses].join(', ')}`);
if (unbalanced.size) console.log(`WARNING: unclosed or extra tags, the layout breaks after them (${unbalanced.size}): ${[...unbalanced].join(', ')}`);
if (unresolved.size) console.log(`WARNING: unresolved links (${unresolved.size}): ${[...unresolved].slice(0, 15).join(', ')}${unresolved.size > 15 ? ', …' : ''}`);

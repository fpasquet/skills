#!/usr/bin/env node
/**
 * Regroupe les écrans d'un projet de specs dans de nouveaux groupes, en général pour passer d'un découpage par lots
 * (produit à construire) à un découpage par fonctionnalités (produit livré). Les identifiants des écrans et de leurs
 * états, les ancres et les identifiants des règles (RF du cahier des charges) ne changent pas.
 *
 * Usage : node regroup.mjs <projet>/ui --plan          écrit <projet>/ui/regroup.json (un groupe par lot actuel), à éditer
 *         node regroup.mjs <projet>/ui --dry-run       dit ce que ferait le plan, sans rien écrire
 *         node regroup.mjs <projet>/ui                 applique le plan
 *
 * regroup.json : {
 *   "grouping": "features",                      découpage cible : « features » (défaut) ou « lots »
 *   "groups": [{ "name": "conversation",         dossier du groupe ([a-z0-9-]), dans l'ordre du site
 *                "label": "Conversation",        libellé affiché
 *                "screens": ["e1", "e2", "e7"],   écrans du groupe, dans l'ordre ; chaque écran dans un seul groupe
 *                "intro": "…" }],                (facultatif) introduction de la page du groupe
 *   "rules": { "connexion": "compte" }           (facultatif) groupe qui reçoit les règles d'un ancien lot
 * }
 *
 * Chaque ancien lot a un héritier : le groupe qui reçoit le plus de ses écrans (ou celui que désigne "rules"). Il
 * reçoit ses règles, ses sections propres (écarts, annexes…) et ses points ouverts sans écran. Ailleurs :
 *   - écrans : leurs fichiers suivent l'écran, renumérotés dans l'ordre du groupe ;
 *   - règles : chaque <li> garde son identifiant d'origine dans data-rf="CONN-03" (lu par extract.mjs du skill
 *     requirements-doc) ; les règles de plusieurs lots se fusionnent dans la section du premier ;
 *   - points ouverts : chaque ligne va au groupe du premier écran qu'elle cite ;
 *   - journal : chaque groupe reprend les entrées de ses lots d'origine, plus une entrée « Maintenance » datée ;
 *   - identité, <template> (propres aux lots) et style.css : repris des lots d'origine ;
 *   - lot.json : libellé, titre, polices, écrans et statuts (écran et états) ;
 *   - liens : « ancien.html#e12 » devient « #e12 », « ancien.html#ouverts » vise l'héritier ; dans sources/shared/
 *     et dans site.json (« ancien/index.html », « ancien/e3.html ») aussi.
 * Un lot sans écran que le plan ne cite pas reste tel quel. site.json reçoit le nouvel ordre et "grouping".
 * Le projet doit être commité avant : les dossiers des anciens lots sont remplacés.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') && resolve(args[0]);
if (!root || !existsSync(join(root, 'sources', 'site.json'))) {
  console.error('Usage: node regroup.mjs <projet>/ui [--plan | --dry-run]   (the folder must contain sources/site.json)');
  process.exit(2);
}
const sourcesDir = join(root, 'sources');
const planFile = join(root, 'regroup.json');
const read = (path) => readFileSync(path, 'utf8');
const site = JSON.parse(read(join(sourcesDir, 'site.json')));
const product = site.title ?? 'Produit';
const screenOf = (id) => id.match(/^e\d+/i)?.[0].toLowerCase() ?? null;
const prefixOf = (file) => parseInt(file, 10);

// ---------- Anciens lots ----------
const oldLots = (site.lots ?? [])
  .filter((name) => existsSync(join(sourcesDir, name, 'lot.json')))
  .map((name) => {
    const dir = join(sourcesDir, name);
    const json = JSON.parse(read(join(dir, 'lot.json')));
    const files = readdirSync(dir).filter((f) => /^\d+-.*\.html$/.test(f)).sort((a, b) => prefixOf(a) - prefixOf(b));
    const screenFiles = files.filter((f) => /^\d+-e\d+/i.test(f));
    const screens = [...new Set([...Object.keys(json.screens ?? {}).map((s) => s.toLowerCase()), ...screenFiles.map((f) => screenOf(f.replace(/^\d+-/, '')))])];
    return { name, dir, json, files, screenFiles, screens, label: json.label ?? name };
  });
const lotByName = new Map(oldLots.map((l) => [l.name, l]));
const ownerOf = new Map(oldLots.flatMap((l) => l.screens.map((s) => [s, l])));

// ---------- --plan : un groupe par lot actuel, à éditer ----------
if (args.includes('--plan')) {
  if (existsSync(planFile) && !args.includes('--force')) {
    console.error(`${planFile} already exists (use --force to overwrite).`);
    process.exit(1);
  }
  const plan = {
    grouping: 'features',
    groups: oldLots.map((l) => ({ name: l.name, label: l.label.replace(/^Lot\s+\d+\s*·\s*/i, ''), screens: l.screens })),
  };
  writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
  console.log(`Wrote ${planFile}: ${plan.groups.length} groups (one per current lot), ${ownerOf.size} screens.`);
  console.log('Edit the groups (name, label, screens), then run regroup.mjs --dry-run, then regroup.mjs.');
  process.exit(0);
}

// ---------- Plan ----------
if (!existsSync(planFile)) {
  console.error(`${planFile} not found: run regroup.mjs <projet>/ui --plan first, then edit it.`);
  process.exit(1);
}
const plan = JSON.parse(read(planFile));
const grouping = plan.grouping ?? 'features';
const errors = [];
const warnings = [];
if (!['features', 'lots'].includes(grouping)) errors.push(`grouping must be "features" or "lots", not "${grouping}"`);
const groups = (plan.groups ?? []).map((g) => ({ ...g, screens: (g.screens ?? []).map((s) => s.toLowerCase()) }));
const seenNames = new Set();
for (const g of groups) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(g.name ?? '') || g.name === 'shared') errors.push(`invalid group name "${g.name}" ([a-z0-9-], not "shared")`);
  if (seenNames.has(g.name)) errors.push(`group "${g.name}" listed twice`);
  seenNames.add(g.name);
  if (!g.label) errors.push(`group "${g.name}" has no label`);
}
const groupOfScreen = new Map();
for (const g of groups) {
  for (const s of g.screens) {
    if (!ownerOf.has(s)) errors.push(`group "${g.name}": unknown screen ${s}`);
    else if (groupOfScreen.has(s)) errors.push(`screen ${s} is in "${groupOfScreen.get(s).name}" and "${g.name}"`);
    groupOfScreen.set(s, g);
  }
}
const unassigned = [...ownerOf.keys()].filter((s) => !groupOfScreen.has(s));
if (unassigned.length) errors.push(`screens in no group: ${unassigned.join(', ')}`);
for (const [lot, target] of Object.entries(plan.rules ?? {})) {
  if (!lotByName.has(lot)) errors.push(`rules: unknown lot "${lot}"`);
  if (!groups.some((g) => g.name === target)) errors.push(`rules: unknown group "${target}"`);
}
if (errors.length) {
  console.error(`regroup.json is not valid:\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}

// Héritier d'un ancien lot : groupe désigné par "rules", sinon celui qui reçoit le plus de ses écrans, sinon le
// groupe du même nom. Un lot sans héritier (sans écran, absent du plan) reste tel quel.
const groupByName = new Map(groups.map((g) => [g.name, g]));
const heirOf = new Map();
const kept = [];
for (const lot of oldLots) {
  const counts = new Map();
  for (const s of lot.screens) counts.set(groupOfScreen.get(s), (counts.get(groupOfScreen.get(s)) ?? 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const heir = groupByName.get(plan.rules?.[lot.name]) ?? best ?? groupByName.get(lot.name);
  if (heir) heirOf.set(lot.name, heir);
  else kept.push(lot);
}
const keptClash = kept.filter((l) => groupByName.has(l.name));
if (keptClash.length) errors.push(`lots kept as is clash with a group name: ${keptClash.map((l) => l.name).join(', ')}`);
if (errors.length) {
  console.error(`regroup.json is not valid:\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}

// ---------- Outils HTML ----------
// Élément complet à partir de sa balise ouvrante, en comptant les éléments imbriqués du même nom
function outerElement(html, start) {
  const tag = html.slice(start).match(/^<(\w+)/)[1];
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}
// Enfants directs <tag> du premier élément <container> : [début du contenu, fin du contenu, enfants]
function childrenOf(html, container, tag) {
  const open = html.search(new RegExp(`<${container}\\b`, 'i'));
  if (open < 0) return null;
  const whole = outerElement(html, open);
  const innerStart = open + whole.indexOf('>') + 1;
  const innerEnd = open + whole.lastIndexOf('<');
  const items = [];
  const re = new RegExp(`<${tag}\\b`, 'gi');
  re.lastIndex = innerStart;
  for (let m; (m = re.exec(html)) && m.index < innerEnd; ) {
    const el = outerElement(html, m.index);
    items.push(el);
    re.lastIndex = m.index + el.length;
  }
  return { innerStart, innerEnd, items };
}
const replaceInner = (html, found, inner) => `${html.slice(0, found.innerStart)}${inner}${html.slice(found.innerEnd)}`;

// Identifiants des règles, comme extract.mjs du skill requirements-doc : une règle marquée data-rf garde le sien ;
// les autres sont numérotées dans l'ordre avec le préfixe du lot, en sautant les numéros déjà pris
const LI = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
function tagRules(html, lotName) {
  const prefix = lotName.toUpperCase().slice(0, 4);
  const items = [...html.matchAll(LI)];
  const taken = new Set(items.map((m) => m[1].match(/\bdata-rf="([^"]+)"/)?.[1]).filter(Boolean));
  let n = 0;
  const next = () => {
    let id;
    do id = `${prefix}-${String(++n).padStart(2, '0')}`;
    while (taken.has(id));
    return id;
  };
  return html.replace(LI, (li, attrs) => (/\bdata-rf=/.test(attrs) ? li : li.replace(/^<li\b/i, `<li data-rf="${next()}"`)));
}

// Liens des sources vers une page d'un ancien lot
const oldNames = new Set(oldLots.map((l) => l.name));
const targetOf = (lotName) => heirOf.get(lotName)?.name ?? lotName;
function rewriteLinks(html) {
  return html.replace(/href="([\w-]+)\.html(#[\w-]+)?"/g, (link, file, anchor) => {
    if (!oldNames.has(file)) return link;
    const screen = anchor && screenOf(anchor.slice(1));
    if (screen && groupOfScreen.has(screen)) return `href="${anchor}"`; // ancres d'écran : uniques dans tout le site
    return `href="${targetOf(file)}.html${anchor ?? ''}"`;
  });
}
// Liens écrits sous leur forme construite (site.json → intro) : « ancien/index.html », « ancien/e3.html »
function rewriteBuiltLinks(text) {
  return text.replace(/\b([\w-]+)\/(index|e\d+)\.html/g, (link, dir, page) => {
    if (!oldNames.has(dir)) return link;
    if (page === 'index') return `${targetOf(dir)}/index.html`;
    return `${groupOfScreen.get(page)?.name ?? targetOf(dir)}/${page}.html`;
  });
}

const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const entryDate = (li) => {
  const m = li.match(/(\d{1,2})\s+(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)[a-zé]*\.?\s+(\d{4})/i);
  return m ? Number(m[3]) * 10000 + (MONTHS.indexOf(m[2].toLowerCase()) + 1) * 100 + Number(m[1]) : null;
};
const extractTemplates = (html) => [...html.matchAll(/(?:<!--(?:(?!-->)[\s\S])*-->\s*)?<template id="([^"]+)">[\s\S]*?<\/template>/g)].map((m) => ({ id: m[1], html: m[0] }));
const kindOf = (file) => {
  const rest = file.replace(/^\d+-/, '');
  if (/^e\d+/i.test(rest)) return 'screen';
  return ['header', 'regles', 'ouverts', 'journal', 'identite'].find((k) => rest.startsWith(k)) ?? 'other';
};
const link = (id) => `<a href="#${id}" class="text-doc-accent hover:underline">${id.toUpperCase()}</a>`;

// ---------- Construction des groupes ----------
const output = new Map(); // groupe → Map(fichier → contenu)
const report = [];
for (const g of groups) {
  const files = new Map();
  const heirLots = oldLots.filter((l) => heirOf.get(l.name) === g);
  const origins = oldLots.filter((l) => heirLots.includes(l) || l.screens.some((s) => groupOfScreen.get(s) === g));
  const rulesLots = oldLots.filter((l) => (groupByName.get(plan.rules?.[l.name]) ?? heirOf.get(l.name)) === g);
  const fileOf = (lot, kind) => lot.files.find((f) => kindOf(f) === kind);

  // En-tête : celui de l'héritier (introduction, parcours), avec le libellé du groupe et une pastille « Regroupement »
  const fromText = origins
    .map((l) => {
      const moved = g.screens.filter((s) => ownerOf.get(s) === l);
      return moved.length ? `${moved.map(link).join(', ')} (repris de « ${l.label} »)` : null;
    })
    .filter(Boolean)
    .join(', ');
  const eyebrow = `${product} · ${grouping === 'features' ? g.label : `Lot · ${g.label}`}`;
  const chip = `<span class="rounded-full border border-doc-line bg-doc-card px-2.5 py-0.5">Regroupement · ${date}</span>`;
  const headerLot = heirLots.find((l) => fileOf(l, 'header'));
  let header;
  if (headerLot) {
    header = read(join(headerLot.dir, fileOf(headerLot, 'header')))
      .replace(/(<p\b[^>]*\buppercase\b[^>]*>)[\s\S]*?(<\/p>)/, `$1${eyebrow}$2`)
      .replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/, `$1${g.label}$2`)
      .replace(/(<div\b[^>]*\bflex-wrap gap-2\b[^>]*>)/, `$1${chip}`);
    if (g.intro) header = header.replace(/(<p\b[^>]*\bmt-4\b[^>]*>)[\s\S]*?(<\/p>)/, `$1${g.intro}$2`);
    const skipped = origins.filter((l) => l !== headerLot && fileOf(l, 'header'));
    if (skipped.length) warnings.push(`${g.name}: header of "${headerLot.name}" kept; the header of ${skipped.map((l) => `"${l.name}"`).join(', ')} (introduction, journeys) is not merged`);
  } else {
    const intro = g.intro ?? (g.screens.length ? `Écrans ${g.screens.map((s) => s.toUpperCase()).join(', ')}.` : '');
    header = `<header>
  <p class="font-mono text-xs font-medium tracking-wider text-doc-accent uppercase">${eyebrow}</p>
  <h1 class="mt-1 text-3xl font-semibold tracking-tight text-balance">${g.label}</h1>
  <div class="mt-3 flex flex-wrap gap-2 text-sm text-doc-muted">${chip}</div>
  ${intro ? `<p class="mt-4 max-w-[75ch] text-doc-muted">${intro}</p>\n` : ''}</header>
`;
  }
  files.set('000-header.html', rewriteLinks(header));

  // Règles : la section du premier lot, enrichie de celles des autres, chaque règle marquée de son identifiant
  const ruleFiles = rulesLots.map((l) => ({ lot: l, file: fileOf(l, 'regles') })).filter((r) => r.file);
  if (ruleFiles.length) {
    const [first, ...others] = ruleFiles.map((r) => tagRules(read(join(r.lot.dir, r.file)), r.lot.name));
    let html = first;
    for (const other of others) {
      const inner = other.slice(other.indexOf('</h2>') >= 0 ? other.indexOf('</h2>') + 5 : 0, other.lastIndexOf('</section>') >= 0 ? other.lastIndexOf('</section>') : other.length).trim();
      const end = html.lastIndexOf('</section>');
      html = end >= 0 ? `${html.slice(0, end)}  ${inner}\n  ${html.slice(end)}` : `${html}\n${inner}\n`;
    }
    files.set('010-regles.html', rewriteLinks(html));
  }

  // Sections propres aux lots d'origine (écarts, annexes…) : avant ou après les écrans, comme dans le lot
  const others = heirLots.flatMap((l) => l.files.filter((f) => kindOf(f) === 'other').map((f) => ({ lot: l, file: f, before: !l.screenFiles.length || prefixOf(f) < prefixOf(l.screenFiles[0]) })));
  others.filter((o) => o.before).forEach((o, i) => files.set(`${String(11 + i).padStart(3, '0')}-${o.file.replace(/^\d+-/, '')}`, rewriteLinks(read(join(o.lot.dir, o.file)))));

  // Un en-tête peut se fermer dans le fichier des règles (après les parcours) : fermer ce qui reste ouvert à la fin de
  // la dernière section avant les écrans, retirer une fermeture en trop venue des règles d'un autre lot
  const pre = [...files.keys()].sort();
  const count = (re) => pre.reduce((n, f) => n + (files.get(f).replace(/<!--[\s\S]*?-->/g, '').match(re) ?? []).length, 0);
  const balance = count(/<header[\s>]/g) - count(/<\/header>/g);
  if (balance > 0) files.set(pre.at(-1), `${files.get(pre.at(-1)).trimEnd()}\n${'</header>\n'.repeat(balance)}`);
  if (balance < 0 && files.has('010-regles.html')) {
    let html = files.get('010-regles.html');
    for (let i = 0; i < -balance && html.includes('</header>'); i++) html = html.slice(0, html.lastIndexOf('</header>')) + html.slice(html.lastIndexOf('</header>') + 9);
    files.set('010-regles.html', html);
  }

  // Écrans, dans l'ordre du groupe, chaque écran avec ses fichiers dans leur ordre
  const screenFiles = g.screens.flatMap((s) => ownerOf.get(s).screenFiles.filter((f) => screenOf(f.replace(/^\d+-/, '')) === s).map((f) => ({ lot: ownerOf.get(s), file: f })));
  const step = Math.max(1, Math.min(10, Math.floor(850 / Math.max(1, screenFiles.length))));
  screenFiles.forEach((sf, i) => files.set(`${String(20 + i * step).padStart(3, '0')}-${sf.file.replace(/^\d+-/, '')}`, rewriteLinks(read(join(sf.lot.dir, sf.file)))));
  others.filter((o) => !o.before).forEach((o, i) => files.set(`${String(880 + i).padStart(3, '0')}-${o.file.replace(/^\d+-/, '')}`, rewriteLinks(read(join(o.lot.dir, o.file)))));

  // Points ouverts : chaque ligne va au groupe du premier écran qu'elle cite, sinon à l'héritier du lot
  const contributions = [];
  for (const lot of oldLots) {
    const file = fileOf(lot, 'ouverts');
    if (!file) continue;
    const html = read(join(lot.dir, file));
    const body = childrenOf(html, 'tbody', 'tr');
    if (!body) continue;
    const rows = body.items.filter((tr) => {
      const screen = [...tr.matchAll(/href="[^"]*#(e\d+)[a-z-]*"/gi)].map((m) => m[1].toLowerCase()).find((s) => groupOfScreen.has(s));
      return (screen ? groupOfScreen.get(screen) : heirOf.get(lot.name)) === g;
    });
    const head = (html.match(/<thead\b[\s\S]*?<\/thead>/i)?.[0] ?? '').replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ');
    if (rows.length) contributions.push({ lot, html, rows, head });
  }
  const rows = contributions.flatMap((c) => c.rows);
  if (rows.length) {
    // Gabarit : la section de l'héritier, sinon celle du premier lot qui donne des lignes
    const wrapper = (contributions.find((c) => heirLots.includes(c.lot)) ?? contributions[0]).html;
    if (new Set(contributions.map((c) => c.head)).size > 1) warnings.push(`${g.name}: open points come from tables with different columns (${contributions.map((c) => c.lot.name).join(', ')}), check 900-ouverts.html`);
    files.set('900-ouverts.html', rewriteLinks(replaceInner(wrapper, childrenOf(wrapper, 'tbody', 'tr'), `\n        ${rows.join('\n        ')}\n      `)));
  }

  // Journal : entrées des lots d'origine, plus une entrée « Maintenance » qui dit d'où viennent les écrans
  const journals = origins.map((l) => fileOf(l, 'journal') && read(join(l.dir, fileOf(l, 'journal')))).filter(Boolean);
  const entry = `<li class="rounded-xl border border-doc-line bg-doc-card px-4 py-3"><b class="font-semibold">Maintenance</b> <span class="text-doc-muted">· ${date}</span><p class="mt-1 text-doc-muted">Écrans regroupés ${grouping === 'features' ? 'par fonctionnalité' : 'dans de nouveaux lots'}${fromText ? ` : ${fromText}` : ''}. Identifiants des écrans, des états et des règles inchangés.</p></li>`;
  const lists = journals.map((html) => ({ html, list: childrenOf(html, 'ol', 'li') })).filter((j) => j.list);
  if (lists.length) {
    // Même ordre que le journal du premier lot : la nouvelle entrée en tête, ou à la fin s'il va du plus ancien au plus récent
    const entries = lists.flatMap((j) => j.list.items);
    const dates = lists[0].list.items.map(entryDate).filter((d) => d !== null);
    const ascending = dates.length > 1 && dates[0] < dates[dates.length - 1];
    const all = ascending ? [...entries, entry] : [entry, ...entries];
    files.set('910-journal.html', rewriteLinks(replaceInner(lists[0].html, lists[0].list, `\n    ${all.join('\n    ')}\n  `)));
  } else {
    files.set('910-journal.html', `<section id="journal" class="mt-16 scroll-mt-16">\n  <h2 class="text-xl font-semibold">Journal des itérations</h2>\n  <ol class="mt-3 flex flex-col gap-3 text-[15px]">\n    ${entry}\n  </ol>\n</section>\n`);
  }

  // Identité : celle de l'héritier, sinon du premier lot d'origine
  const identityLot = [...heirLots, ...origins].find((l) => fileOf(l, 'identite'));
  if (identityLot) files.set('920-identite.html', rewriteLinks(read(join(identityLot.dir, fileOf(identityLot, 'identite')))));

  // <template> propres aux lots d'origine, sans doublon
  const templates = new Map();
  for (const l of origins) {
    if (!existsSync(join(l.dir, 'templates.html'))) continue;
    for (const t of extractTemplates(read(join(l.dir, 'templates.html')))) {
      if (templates.has(t.id) && templates.get(t.id).html !== t.html) warnings.push(`${g.name}: <template id="${t.id}"> differs between lots, kept the one of "${templates.get(t.id).lot}"`);
      if (!templates.has(t.id)) templates.set(t.id, { ...t, lot: l.name });
    }
  }
  if (templates.size) files.set('templates.html', rewriteLinks([...templates.values()].map((t) => t.html).join('\n\n') + '\n'));
  const styles = [...new Set(origins.filter((l) => existsSync(join(l.dir, 'style.css'))).map((l) => read(join(l.dir, 'style.css')).trim()))];
  if (styles.length) files.set('style.css', styles.join('\n\n') + '\n');

  // lot.json
  const status = {};
  for (const s of g.screens) {
    const owner = ownerOf.get(s);
    for (const [key, value] of Object.entries(owner.json.status ?? {})) if (screenOf(key) === s) status[key] = value;
  }
  const lotJson = {
    label: g.label,
    title: `${product} · ${g.label}`,
    fonts: origins.find((l) => l.json.fonts)?.json.fonts ?? '',
    screens: Object.fromEntries(g.screens.map((s) => [s, ownerOf.get(s).json.screens?.[s] ?? s.toUpperCase()])),
    ...(Object.keys(status).length ? { status } : {}),
  };
  files.set('lot.json', JSON.stringify(lotJson, null, 2) + '\n');
  output.set(g, files);
  report.push(`${g.name} (${g.label}): ${g.screens.length} screens${g.screens.length ? ` ${g.screens.map((s) => s.toUpperCase()).join(', ')}` : ''}; from ${origins.map((l) => l.name).join(', ') || '—'}; rules of ${rulesLots.map((l) => l.name).join(', ') || '—'}; ${rows.length} open points; ${others.length} other sections`);
}

// ---------- Rapport ou application ----------
const newSite = { ...site, lots: [...groups.map((g) => g.name), ...kept.map((l) => l.name)] };
if (grouping === 'features') newSite.grouping = 'features';
else delete newSite.grouping;
for (const key of ['intro', 'heading']) {
  if (typeof newSite[key] === 'string') newSite[key] = rewriteBuiltLinks(newSite[key]);
  else if (Array.isArray(newSite[key])) newSite[key] = newSite[key].map(rewriteBuiltLinks);
}
console.log(`Regroup ${oldLots.length} lots into ${groups.length} groups (${grouping}):\n  ${report.join('\n  ')}`);
if (kept.length) console.log(`Kept as is (no screen, not in the plan): ${kept.map((l) => l.name).join(', ')}`);
warnings.forEach((w) => console.log(`WARNING: ${w}`));
if (args.includes('--dry-run')) {
  console.log('Dry run: nothing written.');
  process.exit(0);
}

// Écrit les groupes à côté, puis remplace les anciens dossiers : un échec en cours de route ne laisse rien à moitié
const staging = join(sourcesDir, '.regroup');
rmSync(staging, { recursive: true, force: true });
for (const [g, files] of output) {
  mkdirSync(join(staging, g.name), { recursive: true });
  for (const [file, content] of files) writeFileSync(join(staging, g.name, file), content);
}
for (const lot of oldLots) if (!kept.includes(lot)) rmSync(lot.dir, { recursive: true, force: true });
for (const g of groups) renameSync(join(staging, g.name), join(sourcesDir, g.name));
rmSync(staging, { recursive: true, force: true });
const sharedDir = join(sourcesDir, 'shared');
if (existsSync(sharedDir)) {
  for (const f of readdirSync(sharedDir).filter((f) => f.endsWith('.html'))) {
    const html = read(join(sharedDir, f));
    const rewritten = rewriteLinks(html);
    if (rewritten !== html) writeFileSync(join(sharedDir, f), rewritten);
  }
}
writeFileSync(join(sourcesDir, 'site.json'), JSON.stringify(newSite, null, 2) + '\n');
console.log(`Done. Next: node build.mjs ${args[0]} (it reports links left to fix), check with capture.mjs, update CONTEXTE.md (groups table, screen inventory, grouping), then delete regroup.json.`);
console.log('With a requirements document: node <requirements-doc>/scripts/regroup.mjs <projet>/requirements. With a prototype: drift.mjs, then --mark once checked.');

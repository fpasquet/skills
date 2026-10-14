#!/usr/bin/env node
/**
 * Découpe un document de specs existant (un seul gros fichier HTML) en sources par écran,
 * pour ne plus avoir à lire ni réécrire le document entier (voir SKILL.md, « Sources par écran »).
 *
 * Usage : node split.mjs specs/ui/<lot>.html [--name <lot>] [--force]
 *         node split.mjs --new <lot> --root specs/ui     nouveau lot à partir du template du skill
 *
 * Écrit specs/ui/sources/<lot>/ (lot.json, style.css si besoin, 000-header.html, un NNN-<id>.html par
 * section, templates.html) et place les coquilles (<template id="tpl-shell-…">) dans
 * specs/ui/sources/shared/shells.html si elles n'y sont pas encore. Les anciennes conventions
 * (attributs en français) sont renommées au passage. Ne modifie pas le document : le reconstruire
 * ensuite avec build.mjs et le vérifier avec capture.mjs avant de travailler sur les sources.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLegacyRenames } from './upgrade.mjs';

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const newLot = valueOf('--new');
// Nouveau lot : on découpe le template du skill dans le dossier des specs indiqué par --root
const file = newLot ? join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'specs.html') : args.find((a, i) => !a.startsWith('--') && !['--name', '--root', '--new'].includes(args[i - 1]));
if (!file || (newLot && !valueOf('--root'))) {
  console.error('Usage: node split.mjs specs/ui/<lot>.html [--name <lot>] [--force] | node split.mjs --new <lot> --root specs/ui');
  process.exit(2);
}
const name = newLot ?? valueOf('--name') ?? basename(file, '.html');
const root = valueOf('--root') ? resolve(valueOf('--root')) : dirname(resolve(file));
const lotDir = join(root, 'sources', name);
const sharedDir = join(root, 'sources', 'shared');
if (existsSync(lotDir) && readdirSync(lotDir).length && !args.includes('--force')) {
  console.error(`${lotDir} already exists (use --force to overwrite).`);
  process.exit(1);
}
mkdirSync(lotDir, { recursive: true });
mkdirSync(sharedDir, { recursive: true });
// Nouveau lot dans un projet qui a déjà ses coquilles : squelette vide plutôt que les exemples du template
const registerLot = (title) => {
  const sitePath = join(root, 'sources', 'site.json');
  const config = existsSync(sitePath) ? JSON.parse(readFileSync(sitePath, 'utf8')) : { title, heading: '', intro: '', artifact: '', lots: [] };
  if (config.lots.includes(name)) return false;
  config.lots.push(name);
  writeFileSync(sitePath, JSON.stringify(config, null, 2) + '\n');
  return true;
};
if (newLot && existsSync(join(sharedDir, 'shells.html'))) {
  const sitePath = join(root, 'sources', 'site.json');
  const config = existsSync(sitePath) ? JSON.parse(readFileSync(sitePath, 'utf8')) : { lots: [] };
  const firstLot = config.lots.find((l) => existsSync(join(root, 'sources', l, 'lot.json')));
  const firstLotJson = firstLot ? JSON.parse(readFileSync(join(root, 'sources', firstLot, 'lot.json'), 'utf8')) : {};
  const product = config.title ?? 'Produit';
  writeFileSync(join(lotDir, 'lot.json'), JSON.stringify({ label: `Lot · ${name}`, title: `${product} · ${name}`, fonts: firstLotJson.fonts ?? '', screens: {} }, null, 2) + '\n');
  writeFileSync(join(lotDir, '000-header.html'), `<header>
  <p class="font-mono text-xs font-medium tracking-wider text-doc-accent uppercase">${product} · Lot ${name}</p>
  <h1 class="mt-1 text-3xl font-semibold tracking-tight text-balance">TITRE DU LOT</h1>
  <div class="mt-3 flex flex-wrap gap-2 text-sm text-doc-muted"><span class="rounded-full border border-doc-line bg-doc-card px-2.5 py-0.5">Itération 1 · DATE</span></div>
  <p class="mt-4 max-w-[75ch] text-doc-muted">CONTEXTE EN DEUX OU TROIS PHRASES, AVEC L'EXEMPLE FIL ROUGE.</p>
</header>
`);
  writeFileSync(join(lotDir, '010-regles.html'), `<section id="regles" class="mt-6 max-w-[100ch] rounded-xl border border-doc-line border-l-4 border-l-doc-accent bg-doc-card px-5 py-4">
  <h2 class="text-base font-semibold">Règles fonctionnelles</h2>
  <ul class="mt-2 list-disc space-y-1 pl-5 text-[15px]">
    <li><b>RÈGLE</b> : DÉTAIL.</li>
  </ul>
</section>
`);
  writeFileSync(join(lotDir, '900-ouverts.html'), `<section id="ouverts" class="mt-16 scroll-mt-16">
  <h2 class="text-xl font-semibold">Points ouverts</h2>
  <div class="mt-3 overflow-x-auto rounded-xl border border-doc-line bg-doc-card">
    <table class="w-full min-w-[640px] text-left text-[15px]">
      <thead class="border-b border-doc-line text-sm text-doc-muted"><tr><th class="px-4 py-2 font-medium">Question</th><th class="px-4 py-2 font-medium">À trancher par</th><th class="px-4 py-2 font-medium">Écrans</th></tr></thead>
      <tbody class="divide-y divide-doc-line">
        <tr><td class="px-4 py-2.5">QUESTION</td><td class="px-4 py-2.5 text-doc-muted">QUI</td><td class="px-4 py-2.5">ÉCRANS</td></tr>
      </tbody>
    </table>
  </div>
</section>
`);
  writeFileSync(join(lotDir, '910-journal.html'), `<section id="journal" class="mt-16 scroll-mt-16">
  <h2 class="text-xl font-semibold">Journal des itérations</h2>
  <ol class="mt-3 flex flex-col gap-3 text-[15px]">
    <li class="rounded-xl border border-doc-line bg-doc-card px-4 py-3"><b class="font-semibold">Itération 1</b> <span class="text-doc-muted">· DATE</span><p class="mt-1 text-doc-muted">Première version : ÉCRANS.</p></li>
  </ol>
</section>
`);
  // Annexe d'identité : celle d'un lot existant du projet (elle lit les tokens, son contenu est déjà celui du produit)
  const identity = firstLot && readdirSync(join(root, 'sources', firstLot)).find((f) => /-identite\.html$/.test(f));
  if (identity) writeFileSync(join(lotDir, '920-identite.html'), readFileSync(join(root, 'sources', firstLot, identity), 'utf8'));
  const added = registerLot(product);
  console.log(`New lot skeleton: ${lotDir}`);
  console.log(`  - lot.json, 000-header.html, 010-regles.html, 900-ouverts.html, 910-journal.html${identity ? `, 920-identite.html (from ${firstLot})` : ''}`);
  if (added) console.log(`  - lot "${name}" added to sources/site.json`);
  console.log('  Write one file per screen state (020… to 890…), starting from a model screen listed in CONTEXTE.md, then fill the UPPERCASE placeholders.');
  process.exit(0);
}

const { html: doc, count: renamed } = applyLegacyRenames(readFileSync(file, 'utf8'));
const report = [];
const warnings = [];
if (renamed) report.push(`${renamed} legacy name(s) renamed`);

// lot.json
const lot = {
  title: doc.match(/<title>([^<]*)<\/title>/)?.[1] ?? name,
  fonts: doc.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2[^"]*)"/)?.[1]?.replace(/&amp;/g, '&') ?? '',
  artifact: doc.match(/<!--\s*artifact\s*:\s*(https:\/\/\S+)\s*-->/)?.[1] ?? '',
};
writeFileSync(join(lotDir, 'lot.json'), JSON.stringify(lot, null, 2) + '\n');

// Style : retirer le @theme produit (repris de tokens.css) et l'habillage (repris du template)
const style = doc.match(/<style type="text\/tailwindcss">([\s\S]*?)<\/style>/)?.[1] ?? '';
const docTheme = style.match(/@theme\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? '';
const tokens = existsSync(join(root, 'tokens.css')) ? readFileSync(join(root, 'tokens.css'), 'utf8') : '';
const values = (css) => [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => `${m[1]}:${m[2].trim()}`).sort().join('|');
if (!newLot && docTheme && tokens && values(docTheme) !== values(tokens)) warnings.push('the document @theme block differs from tokens.css: tokens.css will be used when building');
const chromeStart = style.search(/\/\* =+ (?:\d+\. )?Habillage du document/);
const rest = (chromeStart >= 0 ? style.slice(0, chromeStart) : style)
  .replace(docTheme, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .trim();
if (rest) {
  writeFileSync(join(lotDir, 'style.css'), rest + '\n');
  report.push('style.css (lot-specific CSS)');
}

// Page : en-tête, sections de premier niveau, pied éventuel
const pageStart = doc.search(/<div id="page"[^>]*>/);
if (pageStart < 0) {
  console.error('<div id="page"> container not found: run upgrade.mjs first.');
  process.exit(1);
}
const body = doc.slice(doc.indexOf('>', pageStart) + 1);
const sections = [];
let depth = 0;
let start = -1;
for (const m of body.matchAll(/<section\b[^>]*>|<\/section>/g)) {
  if (m[0].startsWith('</')) {
    depth--;
    if (depth === 0) sections.push({ start, end: m.index + m[0].length });
  } else {
    if (depth === 0) start = m.index;
    depth++;
  }
}
const pad = (n) => String(n).padStart(3, '0');
writeFileSync(join(lotDir, '000-header.html'), body.slice(0, sections[0]?.start ?? 0).trim() + '\n');
sections.forEach((s, i) => {
  const html = body.slice(s.start, s.end);
  const heading = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
  const slug = heading.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  const id = html.match(/^<section\b[^>]*\bid="([^"]+)"/)?.[1] ?? (slug || `section-${i + 1}`);
  writeFileSync(join(lotDir, `${pad((i + 1) * 10)}-${id}.html`), html.trim() + '\n');
});
const after = body.slice(sections.at(-1)?.end ?? 0);
const pageEnd = after.search(/<template\b|<script>/);
// Retirer les commentaires (titres de blocs, descriptions de coquilles) puis la fermeture du conteneur #page
const footer = (pageEnd >= 0 ? after.slice(0, pageEnd) : after).replace(/<!--[\s\S]*?-->/g, '').trim().replace(/<\/div>\s*$/, '').trim();
if (footer) {
  writeFileSync(join(lotDir, `${pad((sections.length + 1) * 10)}-footer.html`), footer + '\n');
  report.push('footer');
}
report.push(`header + ${sections.length} sections`);

// Templates : coquilles en partagé (si absentes), le reste dans le lot
const templates = [...doc.matchAll(/(?:<!--(?:(?!-->)[\s\S])*-->\s*)?<template id="([^"]+)">[\s\S]*?<\/template>/g)].map((m) => ({ id: m[1], html: m[0] }));
const shellsPath = join(sharedDir, 'shells.html');
const shells = existsSync(shellsPath) ? readFileSync(shellsPath, 'utf8') : '';
const newShells = [];
const lotTemplates = [];
const normalize = (html) => html.replace(/^<!--[\s\S]*?-->\s*/, '').replace(/\s+/g, ' ');
for (const t of templates) {
  if (!t.id.startsWith('tpl-shell')) {
    lotTemplates.push(t.html);
    continue;
  }
  // Nouveau lot dans un projet qui a déjà ses coquilles : celles d'exemple du template sont ignorées
  if (newLot && shells) continue;
  const existing = shells.match(new RegExp(`<template id="${t.id}">[\\s\\S]*?</template>`))?.[0];
  if (!existing) newShells.push(t.html);
  else if (normalize(existing) !== normalize(t.html)) {
    lotTemplates.push(t.html);
    warnings.push(`${t.id} differs from the shared shell: kept in the lot templates.html (align it with the shared version if possible)`);
  }
}
if (newShells.length) {
  writeFileSync(shellsPath, [shells.trim(), ...newShells].filter(Boolean).join('\n\n') + '\n');
  report.push(`${newShells.length} shell(s) added to sources/shared/shells.html`);
}
if (lotTemplates.length) {
  writeFileSync(join(lotDir, 'templates.html'), lotTemplates.join('\n\n') + '\n');
  report.push(`${lotTemplates.length} lot-specific template(s)`);
}

if (registerLot(lot.title.split(' · ')[0])) report.push(`lot "${name}" added to sources/site.json`);

console.log(`Split: ${file} → ${lotDir}`);
report.forEach((r) => console.log(`  - ${r}`));
warnings.forEach((w) => console.log(`  WARNING: ${w}`));
console.log(`Next: node build.mjs ${root}, then capture.mjs ${join(root, 'site')} <tmp> --sheet.`);

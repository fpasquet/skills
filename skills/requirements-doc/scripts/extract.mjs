#!/usr/bin/env node
/**
 * Extrait des specs (skill specs-ui) la matière fonctionnelle et UI du cahier des charges, en Markdown,
 * sans que le modèle ait à lire le HTML des specs.
 *
 * Usage : node extract.mjs cdc            (lit cdc/cdc.json → specs, artifacts.specs)
 *
 * Écrit dans cdc/sources/generated/ (régénéré à chaque fois, ne pas modifier à la main) :
 *   inventaire.md        tous les écrans et états, par lot, avec le lien vers les specs
 *   lot-<nom>.md         par lot : règles fonctionnelles, puis chaque écran (états, contexte, parcours,
 *                        règles annotées, portée mobile)
 *   points-ouverts.md    points ouverts de tous les lots (question, à trancher par, écrans)
 *   identite.md          tokens de l'identité visuelle (couleurs, polices, formes) depuis tokens.css
 * Affiche la taille de chaque fichier : c'est ce que liront le modèle et les rédacteurs, à la place du HTML.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.argv[2] && resolve(process.argv[2]);
if (!root || !existsSync(join(root, 'cdc.json'))) {
  console.error('Usage: node extract.mjs cdc   (the folder must contain cdc.json)');
  process.exit(2);
}
const config = JSON.parse(readFileSync(join(root, 'cdc.json'), 'utf8'));
const specsDir = resolve(root, config.specs ?? '../specs-ui');
const sourcesDir = join(specsDir, 'sources');
if (!existsSync(join(sourcesDir, 'site.json'))) {
  console.error(`specs-ui sources not found: ${join(sourcesDir, 'site.json')} (set "specs" in cdc.json)`);
  process.exit(1);
}
const site = JSON.parse(readFileSync(join(sourcesDir, 'site.json'), 'utf8'));
const specsUrl = config.artifacts?.specs || site.artifact || '';
const outDir = join(root, 'sources', 'generated');
mkdirSync(outDir, { recursive: true });

// ---------- HTML → Markdown (texte des specs : gras, liens internes, identifiants) ----------
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function md(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>|<template[\s\S]*?<\/template>/gi, '')
      .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `**${t.trim()}**`)
      .replace(/<span\b[^>]*font-mono[^>]*>([\s\S]*?)<\/span>/gi, (_, t) => '`' + t.replace(/<[^>]+>/g, '') + '`')
      // Renvoi vers un état d'écran : ancre du cahier des charges
      .replace(/<a\b[^>]*href="[^"]*#(e\d+[a-z]?)"[^>]*>([\s\S]*?)<\/a>/gi, (_, id, t) => `[${t.replace(/<[^>]+>/g, '').trim()}](#${id.toLowerCase()})`)
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
// e13a → E13a (écran en capitales, état en minuscule, comme dans les specs)
const label = (id) => id.replace(/^e/i, 'E');
const items = (html) => [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => md(m[1].replace(/^\s*<b\b[^>]*>\d+<\/b>/, '')));

// ---------- Lots ----------
const lots = [];
const openPoints = [];
for (const name of site.lots ?? []) {
  const lotDir = join(sourcesDir, name);
  if (!existsSync(join(lotDir, 'lot.json'))) continue;
  const lot = JSON.parse(readFileSync(join(lotDir, 'lot.json'), 'utf8'));
  const files = readdirSync(lotDir).filter((f) => /^\d+-.*\.html$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const rules = [];
  const states = [];
  for (const f of files) {
    const html = readFileSync(join(lotDir, f), 'utf8');
    if (/^\d+-regles/.test(f)) {
      rules.push(...items(html));
      continue;
    }
    if (/^\d+-ouverts/.test(f)) {
      for (const row of html.matchAll(/<tr>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
        openPoints.push({ lot: lot.label ?? name, question: md(row[1]), owner: md(row[2]), screens: md(row[3]) });
      }
      continue;
    }
    const id = html.match(/^\s*<section\b[^>]*\bid="(e\d+[a-z-]*)"/i)?.[1];
    if (!id) continue;
    const h2 = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '';
    const title = md(h2.replace(/<span\b[^>]*font-mono[^>]*>[\s\S]*?<\/span>/i, '').replace(/<span\b[^>]*rounded[^>]*>(Nouveau|Modifié|Nouveau badge)[^<]*<\/span>/gi, ''));
    const afterH2 = html.slice(html.indexOf('</h2>') + 5);
    const intro = afterH2.match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    const path = html.match(/<p\b[^>]*>(\s*<span><b[^>]*>Depuis[\s\S]*?)<\/p>/i)?.[1];
    const from = path?.match(/<b[^>]*>Depuis<\/b>([\s\S]*?)<\/span>/i)?.[1];
    const next = path?.match(/<b[^>]*>Ensuite<\/b>([\s\S]*?)<\/span>/i)?.[1];
    // Annotations : la dernière liste numérotée de la section (après les maquettes)
    const ols = [...html.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi)];
    const notes = ols.length ? items(ols[ols.length - 1][1]) : [];
    const mobile = html.match(/<p\b[^>]*>\s*<b[^>]*>Mobile<\/b>([\s\S]*?)<\/p>/i)?.[1];
    states.push({ id: id.toLowerCase(), screen: id.match(/^e\d+/i)[0].toLowerCase(), title, intro: intro && md(intro), from: from && md(from), next: next && md(next), notes, mobile: mobile && md(mobile).replace(/^[\s:]+/, '').replace(/^\(([^)]*)\)\s*:\s*/, '$1. ') });
  }
  lots.push({ name, label: lot.label ?? name, screens: lot.screens ?? {}, rules, states });
}

// ---------- Écriture ----------
const written = [];
const write = (file, content) => {
  writeFileSync(join(outDir, file), content);
  written.push(`${file} (${Math.round(content.length / 1024)} Ko)`);
};
const header = (what) => `<!-- Généré par extract.mjs depuis les specs (${what}) : ne pas modifier, relancer l'extraction. -->\n\n`;
const specsLink = (lot, screen) => (specsUrl ? `[specs](${specsUrl}) · \`${lot}/${screen}.html\`` : `\`${lot}/${screen}.html\``);

// Inventaire
let inv = header('inventaire');
inv += `| Lot | Écran | Titre | États | Specs |\n|---|---|---|---|---|\n`;
for (const lot of lots) {
  const byScreen = new Map();
  for (const s of lot.states) {
    if (!byScreen.has(s.screen)) byScreen.set(s.screen, []);
    byScreen.get(s.screen).push(s);
  }
  for (const [screen, list] of byScreen) {
    inv += `| ${lot.label} | ${label(screen)} | ${lot.screens[screen] ?? list[0].title} | ${list.map((s) => `[${label(s.id)}](#${s.id})`).join(', ')} | ${specsLink(lot.name, screen)} |\n`;
  }
}
write('inventaire.md', inv);

// Un fichier par lot
for (const lot of lots) {
  let out = header(lot.name);
  if (lot.rules.length) {
    out += `#### Règles fonctionnelles du lot\n\n${lot.rules.map((r, i) => `- **RF-${lot.name.toUpperCase().slice(0, 4)}-${String(i + 1).padStart(2, '0')}** · ${r}`).join('\n')}\n\n`;
  }
  let currentScreen = null;
  for (const s of lot.states) {
    if (s.screen !== currentScreen) {
      currentScreen = s.screen;
      // Ancre de l'écran entier (renvois « E9 ») quand aucun état ne porte déjà cet identifiant
      const screenAnchor = lot.states.some((x) => x.id === s.screen) ? '' : `<a id="${s.screen}"></a>`;
      out += `#### ${screenAnchor}${label(s.screen)} · ${lot.screens[s.screen] ?? s.title}\n\n${specsLink(lot.name, s.screen)}\n\n`;
    }
    out += `##### <a id="${s.id}"></a>${label(s.id)} · ${s.title}\n\n`;
    if (s.intro) out += `${s.intro}\n\n`;
    if (s.from || s.next) out += [s.from && `- **Depuis** ${s.from}`, s.next && `- **Ensuite** ${s.next}`].filter(Boolean).join('\n') + '\n\n';
    if (s.notes.length) out += `Règles de l'écran :\n\n${s.notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\n`;
    if (s.mobile) out += `**Mobile** : ${s.mobile}\n\n`;
  }
  write(`lot-${lot.name}.md`, out);
}

// Points ouverts
let open = header('points ouverts');
open += `| Lot | Question | À trancher par | Écrans |\n|---|---|---|---|\n`;
open += openPoints.map((p) => `| ${p.lot} | ${p.question.replace(/\|/g, '\\|')} | ${p.owner} | ${p.screens} |`).join('\n') + '\n';
write('points-ouverts.md', open);

// Identité visuelle (tokens)
const tokens = existsSync(join(specsDir, 'tokens.css')) ? readFileSync(join(specsDir, 'tokens.css'), 'utf8') : '';
const theme = tokens.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
const rows = [...theme.matchAll(/--([\w-]+)\s*:\s*([^;]+);\s*(?:\/\*\s*([^*]*?)\s*\*\/)?/g)].map((m) => `| \`${m[1]}\` | \`${m[2].trim()}\` | ${m[3] ?? ''} |`);
write('identite.md', header('tokens.css') + (rows.length ? `| Token | Valeur | Usage |\n|---|---|---|\n${rows.join('\n')}\n` : '_Aucun tokens.css trouvé._\n'));

console.log(`Extracted ${lots.length} lot(s), ${lots.reduce((n, l) => n + l.states.length, 0)} screen state(s), ${openPoints.length} open point(s) into ${outDir}:`);
written.forEach((w) => console.log(`  - ${w}`));

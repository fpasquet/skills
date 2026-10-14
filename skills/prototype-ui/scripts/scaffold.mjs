#!/usr/bin/env node
/**
 * Prépare un prototype à partir d'un projet de specs (skill specs-ui) : une page par écran, avec les
 * maquettes desktop et mobile de chaque état, sans l'habillage des specs, prêtes à être câblées.
 *
 * Usage : node scaffold.mjs --specs specs-ui --out prototype-ui [--pages e2,e13] [--force]
 *
 * Écrit dans <out>/src/ :
 *   pages/eN.html     un bloc <section data-state="eNa"> par état, affiché selon ?state=eNa (premier état par
 *                     défaut) ; desktop (lg et plus) et mobile (sous lg) ; racine marquée data-proto-static
 *   shells.html       coquilles et composants partagés des specs, plus les templates propres aux lots
 *   data.js, actions.js, prototype.json, et <out>/PROTOTYPE.md (s'ils n'existent pas encore)
 * Une page déjà présente n'est jamais écrasée sans --force : la version issue des specs va alors dans
 * src/_from-specs/ pour comparaison (utile quand les specs ont changé après le câblage).
 * Avec --pages, --force n'écrase que ces pages : shells.html (câblé) n'est remplacé que par un scaffold
 * complet avec --force.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const specsDir = valueOf('--specs') && resolve(valueOf('--specs'));
const outDir = valueOf('--out') && resolve(valueOf('--out'));
const onlyPages = valueOf('--pages')?.split(',').map((p) => p.toLowerCase());
const force = args.includes('--force');
if (!specsDir || !outDir || !existsSync(join(specsDir, 'sources', 'site.json'))) {
  console.error('Usage: node scaffold.mjs --specs specs-ui --out prototype-ui [--pages e2,e13] [--force]   (specs-ui must contain sources/site.json)');
  process.exit(2);
}
const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path, fallback = '') => (existsSync(path) ? readFileSync(path, 'utf8') : fallback);
const site = JSON.parse(read(join(specsDir, 'sources', 'site.json')));
const report = [];

// Retire l'habillage des specs : pastilles, action suivante, attributs de contrôle
function stripSpecsChrome(html) {
  return html
    .replace(/<span\b[^>]*class="anno\b[^"]*"[^>]*>[^<]*<\/span>/g, '')
    .replace(/\s+data-anno-[\w-]+="[^"]*"/g, '')
    .replace(/\s+data-clip-ok(?:="[^"]*")?/g, '')
    .replace(/(class="[^"]*?)\bnext-step\b\s*/g, '$1');
}

// Extrait l'élément <div …> qui porte un attribut donné, avec son contenu (comptage des div)
function extractDiv(html, attr) {
  const at = html.indexOf(attr);
  if (at < 0) return null;
  const start = html.lastIndexOf('<div', at);
  let depth = 0;
  for (const m of html.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, start + m.index + 6);
  }
  return null;
}

// Un cadre de maquette devient un écran plein : plus de taille fixe ni de contour de téléphone
function toFullScreen(frame, device) {
  return frame
    .replace(/\s+data-frame="[^"]*"/, '')
    .replace(/class="([^"]*)"/, (_, cls) => {
      const kept = cls.split(/\s+/).filter((c) => c && !/^(h|w)-\[\d+px\]$|^rounded-\[2rem\]$|^ring-8$|^ring-zinc-900$/.test(c));
      // Sans maquette mobile, la version desktop reste visible à toutes les tailles
      const visibility = device === 'mobile' ? 'lg:hidden' : device === 'desktop' ? 'hidden lg:block' : 'block';
      return `class="${visibility} h-dvh w-full ${kept.join(' ')}"`;
    });
}

// ---------- Écrans ----------
const pages = [];
mkdirSync(join(outDir, 'src', 'pages'), { recursive: true });
for (const name of site.lots) {
  const lotDir = join(specsDir, 'sources', name);
  if (!existsSync(join(lotDir, 'lot.json'))) continue;
  const lot = JSON.parse(read(join(lotDir, 'lot.json')));
  const files = readdirSync(lotDir).filter((f) => /^\d+-e\d.*\.html$/i.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const screens = new Map();
  for (const f of files) {
    const html = read(join(lotDir, f));
    const id = html.match(/^\s*<section\b[^>]*\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    const screen = id.match(/^e\d+/i)[0].toLowerCase();
    if (!screens.has(screen)) screens.set(screen, []);
    // Tous les cadres de la section : l'état principal et ses variantes (e4c-jira-desktop…)
    const frames = [...html.matchAll(/data-frame="([^"]+)"/g)].map((m) => m[1]);
    const names = [...new Set(frames.map((f) => f.replace(/-(desktop|mobile)$/, '')))];
    for (const stateName of names) {
      const desktop = extractDiv(html, `data-frame="${stateName}-desktop"`);
      const mobile = extractDiv(html, `data-frame="${stateName}-mobile"`);
      screens.get(screen).push({ state: stateName, file: f, desktop, mobile });
    }
  }
  for (const [screen, states] of screens) {
    if (onlyPages && !onlyPages.includes(screen)) continue;
    const title = lot.screens?.[screen] ?? screen.toUpperCase();
    const blocks = states
      .map((s, i) => {
        const parts = [s.desktop && toFullScreen(stripSpecsChrome(s.desktop), s.mobile ? 'desktop' : 'only'), s.mobile && toFullScreen(stripSpecsChrome(s.mobile), 'mobile')].filter(Boolean);
        const missing = s.mobile ? '' : '\n  <!-- Pas de maquette mobile dans les specs (portée simplifiée) : prévoir un rendu mobile simple. -->';
        return `<section data-state="${s.state}" x-show="state === '${s.state}'"${i ? ' x-cloak' : ''}>${missing}\n  ${parts.join('\n  ')}\n</section>`;
      })
      .join('\n\n');
    // Racine de la page : l'état affiché vient de ?state=<id> (premier état par défaut) ; data-proto-static
    // marque une page pas encore câblée (le rédacteur retire l'attribut une fois la page câblée)
    const root = `<div x-data="{ state: $store.app.param('state') ?? '${states[0].state}' }" data-proto-static>\n${blocks}\n</div>`;
    const page = `<!--
  ${screen.toUpperCase()} · ${title}
  Généré depuis specs-ui (${name} : ${[...new Set(states.map((s) => s.file))].join(', ')}). États : ${states.map((s) => s.state).join(', ')}.
  Chaque état s'affiche avec ?state=<id>. À câbler : données du store ($store.app.data), actions, navigation,
  conditions des états (étendre le x-data racine), puis retirer data-proto-static.
-->
${root}
`;
    const target = join(outDir, 'src', 'pages', `${screen}.html`);
    if (existsSync(target) && !force) {
      mkdirSync(join(outDir, 'src', '_from-specs'), { recursive: true });
      writeFileSync(join(outDir, 'src', '_from-specs', `${screen}.html`), page);
      report.push(`${screen}: kept the wired page, specs version written to src/_from-specs/${screen}.html`);
    } else {
      writeFileSync(target, page);
    }
    pages.push({ screen, title, lot: lot.label ?? name });
  }
}
report.push(`${pages.length} page(s): ${pages.map((p) => p.screen).join(', ')}`);

// Table de navigation proposée : chaque entrée [data-nav] des coquilles mène au premier écran où elle est
// active (data-active des maquettes). À relire dans prototype.json → nav.
const navGuess = {};
for (const p of pages) {
  const html = read(join(outDir, 'src', 'pages', `${p.screen}.html`));
  for (const m of html.matchAll(/data-active="([^"]+)"/g)) {
    for (const id of m[1].split(/\s+/)) if (id && !navGuess[id]) navGuess[id] = `${p.screen}.html`;
  }
}

// ---------- Coquilles et templates ----------
const templateBlocks = [];
const sharedDir = join(specsDir, 'sources', 'shared');
if (existsSync(sharedDir)) for (const f of readdirSync(sharedDir).filter((f) => f.endsWith('.html')).sort()) templateBlocks.push(`<!-- specs-ui : shared/${f} -->\n${read(join(sharedDir, f)).trim()}`);
for (const name of site.lots) {
  const t = read(join(specsDir, 'sources', name, 'templates.html')).trim();
  if (t) templateBlocks.push(`<!-- specs-ui : ${name}/templates.html -->\n${t}`);
}
const shells = stripSpecsChrome(templateBlocks.join('\n\n')) + '\n';
const shellsPath = join(outDir, 'src', 'shells.html');
// shells.html est câblé par le modèle principal : --force ne l'écrase que sur un scaffold complet (sans --pages)
if (existsSync(shellsPath) && (!force || onlyPages)) {
  mkdirSync(join(outDir, 'src', '_from-specs'), { recursive: true });
  writeFileSync(join(outDir, 'src', '_from-specs', 'shells.html'), shells);
  report.push('shells.html kept, specs version written to src/_from-specs/shells.html');
} else {
  writeFileSync(shellsPath, shells);
  report.push('shells.html (shared shells, components and lot templates)');
}

// ---------- Fichiers de départ ----------
const writeIfMissing = (path, content, label) => {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  report.push(label);
};
writeIfMissing(
  join(outDir, 'src', 'data.js'),
  `/*\n * État initial du prototype, tiré des faits du fil rouge (specs-ui/CONTEXTE.md).\n * Collections d'objets métier, identifiants stables, valeurs exactes des specs.\n */\nwindow.PROTO_DATA = {\n  user: {},\n};\n\n/*\n * Situations de départ des scénarios (prototype.json → scenarios[].preset) : chaque preset modifie une\n * copie de l'état initial.\n */\nwindow.PROTO_PRESETS = {\n};\n`,
  'data.js (initial state to fill)',
);
writeIfMissing(
  join(outDir, 'src', 'actions.js'),
  `/*\n * Actions métier du prototype. \`this\` désigne le store : this.data, this.notify(), this.go().\n * Chaque action est suivie d'une sauvegarde automatique. Une action par geste des parcours.\n */\nwindow.PROTO_ACTIONS = {\n};\n`,
  'actions.js (actions to write)',
);
const slug = (site.title ?? 'prototype').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
writeIfMissing(
  join(outDir, 'src', 'prototype.json'),
  JSON.stringify(
    {
      id: slug,
      title: `${site.title ?? 'Produit'} · Prototype`,
      description: '',
      specs: relative(outDir, specsDir),
      artifact: '',
      start: pages[0] ? `${pages[0].screen}.html` : 'index.html',
      pages: pages.map((p) => ({ screen: p.screen, title: p.title, lot: p.lot })),
      nav: navGuess,
      params: {},
      scenarios: [],
    },
    null,
    2,
  ) + '\n',
  'prototype.json (scenarios to write)',
);
writeIfMissing(
  join(outDir, 'package.json'),
  JSON.stringify({ name: `${slug}-prototype`, private: true, description: 'Outils du build du prototype : Tailwind compilé, Alpine.js et Lucide servis localement (npm install une fois)', devDependencies: { '@tailwindcss/cli': '4.1.13', tailwindcss: '4.1.13', alpinejs: '3.14.1', lucide: '0.469.0' } }, null, 2) + '\n',
  'package.json (npm install once: Tailwind compiled, Alpine and Lucide served locally)',
);
writeIfMissing(join(outDir, '.gitignore'), 'node_modules/\n.check/\n.build-tmp/\n', '.gitignore');
writeIfMissing(join(outDir, 'PROTOTYPE.md'), read(join(skillDir, 'templates', 'prototype.md')).replaceAll('{{Produit}}', site.title ?? 'Produit'), 'PROTOTYPE.md (prototype memory)');

console.log(`Scaffolded ${outDir}:`);
report.forEach((r) => console.log(`  - ${r}`));
console.log('Next: fill data.js and actions.js from the story facts, wire the pages of the chosen journeys, write the scenarios in prototype.json, then build.mjs.');

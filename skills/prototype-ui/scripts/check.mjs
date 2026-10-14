#!/usr/bin/env node
/**
 * Contrôle le prototype construit (prototype-ui/site), du moins coûteux au plus coûteux.
 *
 * Usage : node check.mjs prototype-ui [output-dir] [--pages e2,e13] [--sheet] [--scenarios]
 *
 *   (par défaut)   contrôles sans image :
 *                  - statiques : liens et go('…') vers des pages absentes, départs de scénarios, restes de
 *                    l'habillage des specs (pastilles, action suivante, cadres de maquette)
 *                  - dans Chrome, en desktop (1440 px) puis en mobile (390 px), données de départ :
 *                    erreurs JS et Alpine, icônes inconnues, blocs non assemblés, débordement horizontal,
 *                    pages encore statiques (data-proto-static) ; puis chaque étape de chaque scénario, sur
 *                    son écran, avec l'état reconstitué par ses presets (?scenario=<id>&scenario-step=<n>)
 *   --sheet        planches de revue : chaque page en desktop (6 par image) et en mobile (10 par image)
 *   --scenarios    planches des scénarios : chaque étape en desktop et en mobile, légendée par son texte
 *   --pages e2,e13 limite aux pages dont le nom commence par ces identifiants (index : --pages index ;
 *                  étapes des scénarios : --pages scenarios)
 *
 * Images dans output-dir (par défaut prototype-ui/.check). Nécessite Chrome ou Chromium (variable
 * CHROME_PATH si le chemin n'est pas standard). Aucune dépendance. Code de sortie 1 si un problème bloquant.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const args = process.argv.slice(2);
const WITH_VALUE = new Set(['--pages']);
const option = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const [input, outputArg] = args.filter((a, i) => !a.startsWith('--') && !WITH_VALUE.has(args[i - 1]));
const root = input && resolve(input);
const siteDir = root && join(root, 'site');
if (!root || !existsSync(siteDir)) {
  console.error('Usage: node check.mjs prototype-ui [output-dir] [--pages e2,e13] [--sheet]   (run build.mjs first)');
  process.exit(2);
}
const outputDir = resolve(outputArg ?? join(root, '.check'));
const sheet = args.includes('--sheet');
const scenarioSheets = args.includes('--scenarios');
const onlyPages = option('pages')?.split(',').map((p) => p.toLowerCase());

const chrome = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((c) => existsSync(c));
if (!chrome) {
  console.error('No Chrome/Chromium found (set CHROME_PATH). Ask the person to open the prototype.');
  process.exit(1);
}

// Profil vierge par lancement : chaque contrôle part des données initiales (stockage du navigateur vide)
const profiles = [];
const freshProfile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'prototype-check-'));
  profiles.push(dir);
  return `--user-data-dir=${dir}`;
};
const baseArgs = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=9000'];
const pageUrl = (file, params) => `${pathToFileURL(join(siteDir, file)).href}?${params}`;
const run = promisify(execFile);
const dumpDom = async (url, size) => (await run(chrome, [...baseArgs, freshProfile(), `--window-size=${size}`, '--dump-dom', url], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 })).stdout;
// Quatre Chrome à la fois au plus
const pool = async (items, worker, size = 4) => {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
};
const screenshot = (url, png, size) => {
  try {
    execFileSync(chrome, [...baseArgs, freshProfile(), `--window-size=${size}`, `--screenshot=${png}`, url], { stdio: 'ignore', timeout: 90000 });
    return true;
  } catch {
    return false;
  }
};
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const allPages = readdirSync(siteDir).filter((f) => f.endsWith('.html')).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10)));
// « e1 » désigne e1.html, pas e10.html : le nom doit s'arrêter là ou continuer par autre chose qu'un chiffre
const pages = allPages.filter((f) => !onlyPages || onlyPages.some((p) => new RegExp(`^${p}(?!\\d)`, 'i').test(f)));
const blocking = [];
const notes = [];

// ---------- Contrôles statiques ----------
const config = JSON.parse(readFileSync(join(root, 'src', 'prototype.json'), 'utf8'));
for (const s of config.scenarios ?? []) {
  if (!allPages.includes(s.start)) blocking.push(`scenario "${s.id}": start page ${s.start} not found`);
  if (!s.steps?.length) blocking.push(`scenario "${s.id}": no steps`);
  // Une étape est une phrase, ou { text, page } : l'écran indiqué doit exister
  (s.steps ?? []).forEach((step, i) => {
    const text = typeof step === 'string' ? step : step?.text;
    if (!text?.trim()) blocking.push(`scenario "${s.id}": step ${i + 1} has no text`);
    const page = typeof step === 'object' ? step?.page?.split('?')[0] : null;
    if (page && !allPages.includes(page)) blocking.push(`scenario "${s.id}": step ${i + 1} page ${page} not found`);
  });
}
for (const f of pages) {
  const html = readFileSync(join(siteDir, f), 'utf8');
  // Le contenu des scripts (store, actions) est contrôlé à part : seuls les liens de la page comptent ici
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const targets = new Set();
  for (const m of markup.matchAll(/(?<![:\w-])href="([^"#?]+\.html)/g)) targets.add(m[1]);
  for (const m of html.matchAll(/\bgo\(\s*['"]([^'"#?]+\.html)/g)) targets.add(m[1]);
  const broken = [...targets].filter((t) => !/^[a-z]+:/i.test(t) && !allPages.includes(t));
  if (broken.length) blocking.push(`${f}: links to missing pages ${broken.join(', ')}`);
  const leftovers = [
    [/class="anno\b/, 'annotation markers'],
    [/\bnext-step\b/, 'next-step highlight'],
    [/data-anno-/, 'data-anno-* attributes'],
    [/data-frame="/, 'mockup frames (data-frame)'],
  ].filter(([rx]) => rx.test(markup)).map(([, label]) => label);
  if (leftovers.length) blocking.push(`${f}: specs chrome left: ${leftovers.join(', ')}`);
}
// data.js et actions.js exécutés à part : syntaxe, presets des scénarios, état initial sérialisable
const sandbox = { window: {} };
for (const f of ['data.js', 'actions.js']) {
  try {
    runInNewContext(readFileSync(join(root, 'src', f), 'utf8'), sandbox, { filename: f });
  } catch (e) {
    blocking.push(`src/${f}: ${e.message}`);
  }
}
const presets = sandbox.window.PROTO_PRESETS ?? {};
for (const s of config.scenarios ?? []) {
  if (s.preset && typeof presets[s.preset] !== 'function') blocking.push(`scenario "${s.id}": preset "${s.preset}" not defined in data.js`);
  (s.steps ?? []).forEach((step, i) => {
    if (step?.preset && typeof presets[step.preset] !== 'function') blocking.push(`scenario "${s.id}": step ${i + 1} preset "${step.preset}" not defined in data.js`);
  });
}
for (const [name, apply] of Object.entries(presets)) {
  try {
    apply(JSON.parse(JSON.stringify(sandbox.window.PROTO_DATA ?? {})));
  } catch (e) {
    blocking.push(`preset "${name}": ${e.message}`);
  }
}

// ---------- Contrôles dans Chrome ----------
// Cibles : chaque page, puis chaque étape de chaque scénario (?scenario=<id>&scenario-step=<n> reconstitue l'état de
// l'étape à partir des presets, sur l'écran de l'étape)
const sizes = { desktop: '1440,900', mobile: '390,844' };
const withParams = (page, params) => {
  const [file, query = ''] = page.split('?');
  return `${pathToFileURL(join(siteDir, file)).href}?${[query, params].filter(Boolean).join('&')}`;
};
const targets = pages.map((f) => ({ label: f, file: f, url: (params) => withParams(f, params), page: true }));
const scenarioSteps = [];
if (!onlyPages || onlyPages.includes('scenarios')) {
  for (const s of config.scenarios ?? []) {
    let last = s.start;
    (s.steps ?? []).forEach((step, i) => {
      const page = (typeof step === 'object' && step?.page) || last;
      last = page;
      if (!allPages.includes(page.split('?')[0])) return;
      const target = { label: `${s.id} step ${i + 1}`, file: page.split('?')[0], url: (params) => withParams(page, `scenario=${s.id}&scenario-step=${i + 1}&${params}`), scenario: s.id, step: i + 1, text: typeof step === 'string' ? step : step.text };
      targets.push(target);
      scenarioSteps.push(target);
    });
  }
}
const staticPages = [];
const runs = targets.flatMap((t) => Object.entries(sizes).map(([device, size]) => ({ t, device, size })));
const results = new Map();
await pool(runs, async (r) => {
  try {
    let dom = await dumpDom(r.t.url('check&clean'), r.size);
    // Un CDN lent sous la charge (Alpine) : une seconde tentative avant de conclure
    if (!/<pre id="proto-check" hidden/.test(dom) || dom.includes('&quot;alpine&quot;:false')) dom = await dumpDom(r.t.url('check&clean'), r.size);
    results.set(r, { dom });
  } catch (e) {
    results.set(r, { error: e.message.split('\n')[0] });
  }
});
for (const r of runs) {
  const { t, device } = r;
  let result;
  try {
    const { dom, error } = results.get(r);
    if (error) throw new Error(error);
    // Le vrai résultat porte l'attribut hidden (le commentaire du script inline cite aussi la balise)
    const json = dom.match(/<pre id="proto-check" hidden[^>]*>([\s\S]*?)<\/pre>/)?.[1];
    result = json ? JSON.parse(decode(json)) : null;
  } catch (e) {
    blocking.push(`${t.label} (${device}): page did not load: ${e.message.split('\n')[0]}`);
    continue;
  }
  if (!result) {
    blocking.push(`${t.label} (${device}): check results missing (page crashed before load, or built without check-hook)`);
    continue;
  }
  if (!result.alpine) blocking.push(`${t.label}: Alpine.js did not start (CDN unreachable?)`);
  for (const e of new Set(result.errors)) blocking.push(`${t.label} (${device}): ${e}`);
  if (result.unknownIcons.length) blocking.push(`${t.label}: unknown Lucide icons ${result.unknownIcons.join(', ')}`);
  if (result.unassembled.length) blocking.push(`${t.label}: blocks not assembled (missing template) ${result.unassembled.join(', ')}`);
  if (result.overflow) blocking.push(`${t.label} (${device}): horizontal overflow of ${result.overflow}px`);
  if (device === 'desktop' && t.page) {
    for (const w of new Set(result.warnings)) notes.push(`${t.label}: warning: ${w}`);
    if (result.staticStates) staticPages.push(`${t.label.replace('.html', '')} (${result.staticStates} states)`);
  }
}
if (staticPages.length) notes.push(`Pages still static (specs mockups, not wired; ?state=<id> shows a state): ${staticPages.join(', ')}`);

// ---------- Planches ----------
const images = [];
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
// Montage via une page HTML capturée par Chrome (aucune dépendance)
const montage = (list, tileWidth, perRow, name) => {
  if (!list.length) return;
  const [w, h] = list[0].size.split(',').map(Number);
  const tileHeight = Math.round((h * tileWidth) / w);
  const rows = Math.ceil(list.length / perRow);
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:12px;display:grid;grid-template-columns:repeat(${perRow},${tileWidth}px);gap:12px;background:#fff;font:12px sans-serif">${list
    .map((s) => `<figure style="margin:0"><img src="${pathToFileURL(s.png).href}" style="width:${tileWidth}px;display:block;border:1px solid #ddd"><figcaption>${s.name}</figcaption></figure>`)
    .join('')}</body>`;
  const page = join(outputDir, `${name}.html`);
  writeFileSync(page, html);
  const png = join(outputDir, `${name}.png`);
  if (screenshot(pathToFileURL(page).href, png, `${Math.min(list.length, perRow) * (tileWidth + 12) + 12},${rows * (tileHeight + 30) + 12}`)) images.push(png);
};
const shoot = (list, prefix, nameOf) => {
  const shots = { desktop: [], mobile: [] };
  for (const t of list) {
    for (const [device, size] of Object.entries(sizes)) {
      const png = join(outputDir, `${prefix}${t.label.replace(/\.html$/, '').replace(/\s+/g, '-')}-${device}.png`);
      if (screenshot(t.url('clean'), png, size)) shots[device].push({ name: nameOf(t), png, size });
    }
  }
  return shots;
};
if (sheet) {
  mkdirSync(outputDir, { recursive: true });
  const shots = shoot(targets.filter((t) => t.page), '', (t) => t.label.replace('.html', ''));
  chunks(shots.desktop, 6).forEach((c, i) => montage(c, 640, 2, `sheet-desktop-${i + 1}`));
  chunks(shots.mobile, 10).forEach((c, i) => montage(c, 260, 5, `sheet-mobile-${i + 1}`));
}
if (scenarioSheets) {
  mkdirSync(outputDir, { recursive: true });
  for (const s of config.scenarios ?? []) {
    const shots = shoot(scenarioSteps.filter((t) => t.scenario === s.id), 'scenario-', (t) => `${t.step} · ${t.text}`);
    chunks(shots.desktop, 6).forEach((c, i) => montage(c, 640, 2, `scenario-${s.id}-desktop-${i + 1}`));
    chunks(shots.mobile, 10).forEach((c, i) => montage(c, 260, 5, `scenario-${s.id}-mobile-${i + 1}`));
  }
}
profiles.forEach((dir) => rmSync(dir, { recursive: true, force: true }));

// ---------- Rapport ----------
console.log(`Checked ${pages.length} page(s) and ${scenarioSteps.length} scenario step(s), in desktop and mobile.`);
if (blocking.length) {
  console.log(`\nProblems (${blocking.length}):`);
  blocking.forEach((b) => console.log(`  - ${b}`));
} else console.log('No problem found.');
if (notes.length) {
  console.log('\nNotes:');
  notes.forEach((n) => console.log(`  - ${n}`));
}
if (images.length) {
  console.log('\nSheets (read these first):');
  images.forEach((i) => console.log(`  ${i}`));
}
process.exit(blocking.length ? 1 : 0);

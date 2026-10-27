#!/usr/bin/env node
/**
 * Contrôle et capture des pages de specs pour les relire, en commençant par le moins coûteux.
 *
 * Usage : node capture.mjs <file.html | site-dir> <output-dir> [options]
 *
 *   (par défaut)       contrôles seulement (aucune image) : version, icônes, blocs, contenu coupé, pastilles
 *   --sheet            planches de revue : cadres réduits, 6 desktop ou 10 mobiles par image (première relecture)
 *   --frames           capture chaque cadre de maquette seul, à sa taille réelle (en cas de doute)
 *   --thumbnails       test de la vignette : cadres desktop à 320 px sur une ligne
 *   --sections         une capture par section[id] (via ?only=<id>) ; la plus coûteuse à relire
 *   --ids e13,e15c     limite aux cadres, sections et pages dont le nom commence par ces identifiants
 *   --lot projets      (site) limite aux pages de ce lot
 *   --themes c,a,b     applique ces thèmes aux propositions, dans l'ordre (via ?themes=)
 *   --height 1500      hauteur de fenêtre des captures de section · --width 1440 largeur
 *
 * Un dossier (site construit par build.mjs) est contrôlé page par page. Nécessite Chrome ou Chromium
 * (variable CHROME_PATH si le chemin n'est pas standard, CHROME_ARGS pour des options en plus). Aucune dépendance.
 * Sans navigateur (bac à sable de claude.ai, voir references/claude-ai.md) : contrôles statiques seulement (version,
 * blocs data-use sans template) ; icônes, contenu coupé, pastilles et images ne sont pas vérifiés, et le script le dit.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, relative, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Versions des templates de ce skill (meta specs-ui-template), lues dans les templates eux-mêmes : les pages construites
// suivent specs.html, la page des propositions suit propositions.html.
const templateVersion = (name) => readFileSync(new URL(`../templates/${name}`, import.meta.url), 'utf8').match(/<meta name="specs-ui-template" content="([^"]+)"/)[1];
const TEMPLATE_VERSION = templateVersion('specs.html');
const PROPOSITIONS_VERSION = templateVersion('propositions.html');

const args = process.argv.slice(2);
const WITH_VALUE = new Set(['--ids', '--height', '--width', '--themes', '--lot']);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [input, outputDir] = args.filter((a, i) => !a.startsWith('--') && !WITH_VALUE.has(args[i - 1]));
if (!input || !outputDir) {
  console.error('Usage: node capture.mjs <file.html|site-dir> <output-dir> [--sheet] [--frames] [--thumbnails] [--sections] [--ids e13,e15c] [--themes c,a,b]');
  process.exit(2);
}
const width = option('width', '1440');
const height = option('height', '1500');
const sheet = args.includes('--sheet');
const thumbnails = args.includes('--thumbnails');
const frames = sheet || thumbnails || args.includes('--frames');
const sectionsWanted = args.includes('--sections');
const themes = option('themes', null);
const onlyIds = option('ids', null)?.split(',').map((s) => s.toLowerCase());
const matchesIds = (name) => !onlyIds || onlyIds.some((id) => name.toLowerCase().startsWith(id));

const chrome = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((c) => existsSync(c));
// CHROME_ARGS : options en plus (« --no-sandbox » dans un conteneur sans bac à sable Chrome, voir references/claude-ai.md)
const baseArgs = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=9000', ...(process.env.CHROME_ARGS ?? '').split(/\s+/).filter(Boolean)];
// Un Chrome qui ne démarre pas ferait accuser les pages : on le vérifie d'abord, et on passe aux contrôles statiques
let browserError = null;
if (chrome) {
  try {
    execFileSync(chrome, [...baseArgs, '--dump-dom', 'data:text/html,ok'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  } catch (e) {
    browserError = String(e.stderr || e.message).split('\n').find((line) => /fatal|error/i.test(line))?.trim() ?? String(e.message).split('\n')[0];
  }
}
if (!chrome) console.log('No Chrome/Chromium found (set CHROME_PATH): static checks only, see references/claude-ai.md to install one.');
else if (browserError) console.log(`Chrome found but it did not start (${browserError.slice(0, 200)}): static checks only. In a container, CHROME_ARGS=--no-sandbox (see references/claude-ai.md).`);
const browser = chrome && !browserError ? chrome : null;
const pageUrl = (file, params = {}) => {
  const u = new URL(pathToFileURL(resolve(file)).href);
  if (themes) u.searchParams.set('themes', themes);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.href;
};
const screenshot = (url, png, size) => {
  try {
    execFileSync(chrome, [...baseArgs, `--window-size=${size}`, `--screenshot=${png}`, url], { stdio: 'ignore', timeout: 90000 });
    return png;
  } catch (e) {
    return `(failed) ${png}: ${e.message}`;
  }
};
const dumpDom = (url) => execFileSync(chrome, [...baseArgs, '--dump-dom', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
const withoutCode = (html) => html.replace(/<template[\s\S]*?<\/template>|<script[\s\S]*?<\/script>/gi, '');
mkdirSync(outputDir, { recursive: true });
const suffix = themes ? `-themes-${themes.replace(/,/g, '')}` : '';

// Pages à contrôler : un fichier, ou toutes les pages d'un site
const isDir = statSync(input).isDirectory();
const listPages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listPages(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []));
const pageMatches = (f) => !onlyIds || matchesIds(basename(f, '.html')) || [...withoutCode(readFileSync(f, 'utf8')).matchAll(/data-frame="([^"]+)"/g)].some((m) => matchesIds(m[1]));
const lotFilter = option('lot', null);
const files = isDir ? listPages(input).filter((f) => !lotFilter || relative(input, f).split(/[\\/]/)[0] === lotFilter).filter(pageMatches) : [input];

const shots = [];
const framePngs = [];
const report = { versions: new Set(), icons: new Set(), unassembled: new Set(), annos: [], clipped: [], notIsolated: [] };
for (const file of files) {
  const label = isDir ? relative(input, file) : basename(file);
  const raw = readFileSync(file, 'utf8');
  const source = withoutCode(raw);
  const version = raw.match(/<meta name="specs-ui-template" content="([^"]+)"/)?.[1];
  const expected = basename(file) === 'propositions.html' ? PROPOSITIONS_VERSION : TEMPLATE_VERSION;
  if (version !== expected) report.versions.add(`${label} (${version ?? 'older than 1.4.0'})`);

  if (!browser) {
    // Contrôle statique : chaque bloc data-use doit trouver son template dans la page
    const ids = new Set([...raw.matchAll(/<template id="tpl-([^"]+)">/g)].map((m) => m[1]));
    for (const m of source.matchAll(/\sdata-use="([^"]+)"/g)) if (!ids.has(m[1])) report.unassembled.add(`${m[1]} (${label})`);
    continue;
  }
  if (sectionsWanted) {
    const ids = [...source.matchAll(/<section\b[^>]*\bid="([^"]+)"/gi)].map((m) => m[1]).filter(matchesIds);
    ids.forEach((id) => shots.push(screenshot(pageUrl(file, { only: id }), resolve(outputDir, `section-${id}${suffix}.png`), `${width},${height}`)));
  }
  const frameList = [...source.matchAll(/<div\b[^>]*data-frame="([^"]+)"[^>]*>/g)]
    .map((m) => ({ name: m[1], w: m[0].match(/\bw-\[(\d+)px\]/)?.[1] ?? '1280', h: m[0].match(/\bh-\[(\d+)px\]/)?.[1] ?? '820' }))
    .filter((f) => matchesIds(f.name));
  if (frames) {
    for (const f of frameList) {
      const png = screenshot(pageUrl(file, { frame: f.name }), resolve(outputDir, `frame-${f.name}${suffix}.png`), `${f.w},${f.h}`);
      framePngs.push({ ...f, png });
      if (!sheet && !thumbnails) shots.push(png);
    }
    if (frameList.length) {
      // Deux essais : Chrome rend parfois la page avant la fin des scripts
      const isolated = () => {
        try {
          const test = withoutCode(dumpDom(pageUrl(file, { frame: frameList[0].name })));
          return /data-frame-isolated=/.test(test) || !/<section\b/.test(test);
        } catch {
          return false;
        }
      };
      if (!isolated() && !isolated()) report.notIsolated.push(label);
    }
  }

  // Contrôles dans le DOM final
  let dom = '';
  try {
    dom = withoutCode(dumpDom(pageUrl(file)));
  } catch (e) {
    console.error(`Could not read the DOM of ${label}: ${e.message}`);
  }
  for (const m of dom.matchAll(/<i\b[^>]*data-lucide="([^"]+)"/g)) report.icons.add(`${m[1]} (${label})`);
  for (const m of dom.matchAll(/\sdata-use="([^"]+)"/g)) report.unassembled.add(`${m[1]} (${label})`);
  let currentFrame = null;
  for (const m of dom.matchAll(/data-frame="([^"]+)"|<span\b([^>]*class="anno[^"]*"[^>]*)>([^<]*)/g)) {
    if (m[1]) {
      currentFrame = m[1];
      continue;
    }
    const overlap = m[2].match(/data-overlap="([^"]*)"/)?.[1];
    if (overlap !== undefined) report.annos.push(`${currentFrame ?? label} · marker ${m[3].trim()} on "${overlap}"`);
    const cutBy = m[2].match(/data-anno-cut="([^"]*)"/)?.[1];
    if (cutBy !== undefined) report.annos.push(`${currentFrame ?? label} · marker ${m[3].trim()} cut by its container ${cutBy} (overflow hidden): move it inside`);
  }
  for (const m of dom.matchAll(/<div\b[^>]*>/g)) {
    const name = m[0].match(/data-frame="([^"]+)"/)?.[1];
    const n = m[0].match(/data-clipped="(\d+)"/)?.[1];
    if (name && n) report.clipped.push(`${name} (${n})`);
  }
}

// Planches : montage d'images via une page HTML capturée par Chrome (aucune dépendance)
const montage = (list, tileWidth, perRow, name) => {
  if (!list.length) return;
  const rows = Math.ceil(list.length / perRow);
  const tileHeight = Math.max(...list.map((f) => Math.round((f.h * tileWidth) / f.w)));
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:12px;display:grid;grid-template-columns:repeat(${perRow},${tileWidth}px);gap:12px;background:#fff;font:12px sans-serif">${list
    .map((f) => `<figure style="margin:0"><img src="${pathToFileURL(f.png).href}" style="width:${tileWidth}px;display:block;border:1px solid #ddd"><figcaption>${f.name}</figcaption></figure>`)
    .join('')}</body>`;
  const page = resolve(outputDir, `${name}.html`);
  writeFileSync(page, html);
  shots.push(screenshot(pathToFileURL(page).href, resolve(outputDir, `${name}${suffix}.png`), `${Math.min(list.length, perRow) * (tileWidth + 12) + 12},${rows * (tileHeight + 30) + 12}`));
};
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const okPngs = framePngs.filter((f) => !f.png.startsWith('('));
const desktops = okPngs.filter((f) => !/mobile/.test(f.name));
const mobiles = okPngs.filter((f) => /mobile/.test(f.name));
if (sheet) {
  chunks(desktops, 6).forEach((c, i) => montage(c, 640, 2, `sheet-desktop-${i + 1}`));
  chunks(mobiles, 10).forEach((c, i) => montage(c, 260, 5, `sheet-mobile-${i + 1}`));
}
if (thumbnails) {
  montage(desktops, 320, Math.max(desktops.length, 1), 'thumbnails');
  montage(mobiles, 220, Math.max(mobiles.length, 1), 'thumbnails-mobile');
}

// Compte rendu
console.log(`Checked ${files.length} page(s)${browser ? '' : ' without a browser'}.`);
if (report.versions.size) console.log(`WARNING: pages not on template ${TEMPLATE_VERSION}: ${[...report.versions].join(', ')}. Rebuild with build.mjs (or upgrade.mjs for a document without sources).`);
if (report.notIsolated.length) console.log(`WARNING: frames not isolated (?frame ignored) in: ${report.notIsolated.join(', ')}. Rebuild or upgrade those pages.`);
if (!browser) console.log(`NOT CHECKED without a browser: Lucide icons, clipped content, annotation markers${frames || sectionsWanted ? ', images (--sheet, --frames, --thumbnails, --sections)' : ''}. Say so to the person.`);
else console.log(report.icons.size ? `Unknown Lucide icons (nothing is drawn): ${[...report.icons].join(', ')}` : 'All Lucide icons render.');
if (report.unassembled.size) console.log(`Unassembled data-use blocks: ${[...report.unassembled].join(', ')} (check the <template id="tpl-…">).`);
if (report.annos.length) console.log(`Annotation markers to move to an empty area:\n${report.annos.map((a) => `  - ${a}`).join('\n')}`);
if (report.clipped.length) console.log(`Clipped content in: ${report.clipped.join(', ')}. Check on a sheet: fix a truncated block, or mark an intended cut (a list that goes on) with data-clip-ok on its container.`);
if (shots.length) {
  console.log('Images (read sheets first, single frames only when in doubt):');
  shots.forEach((s) => console.log(`- ${s}`));
}

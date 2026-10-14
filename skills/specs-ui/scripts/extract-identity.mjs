#!/usr/bin/env node
/**
 * Extrait les indices d'identité visuelle d'un site existant (URL) ou d'un code source (dossier).
 *
 * Usage :
 *   node extract-identity.mjs https://exemple.fr/page [--screenshots <dir>] [--json]
 *   node extract-identity.mjs ./chemin/du/projet [--json]
 *
 * Produit un rapport Markdown (ou JSON) : variables CSS, couleurs les plus utilisées et leurs
 * propriétés, familles de polices, tailles, rayons, ombres, points de rupture, navigation,
 * indices de framework. Avec --screenshots et un Chrome/Chromium installé, enregistre aussi des
 * captures desktop et mobile à regarder : la fréquence d'une couleur ne dit pas son rôle.
 *
 * Node 18+ requis (fetch natif). Aucune dépendance.
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--screenshots');
const asJson = args.includes('--json');
const screenshotDir = args.includes('--screenshots') ? args[args.indexOf('--screenshots') + 1] : null;
if (!target) {
  console.error('Usage: node extract-identity.mjs <url|folder> [--screenshots <dir>] [--json]');
  process.exit(2);
}

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const MAX_STYLESHEETS = 25;
const MAX_BYTES = 4_000_000;

async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: '*/*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
}

// ---------- Collecte ----------
async function fromUrl(url) {
  const html = await download(url);
  const css = [];
  const sources = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css.push(m[1]);
  for (const m of html.matchAll(/style="([^"]*)"/gi)) css.push(`x{${m[1]}}`);
  const links = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((l) => /rel=["']?[^"'>]*stylesheet/i.test(l))
    .map((l) => (l.match(/href=["']([^"']+)["']/i) || [])[1])
    .filter(Boolean)
    .map((h) => new URL(h.replace(/&amp;/g, '&'), url).href);
  const googleFonts = [];
  const queue = [...links];
  const seen = new Set();
  while (queue.length && seen.size < MAX_STYLESHEETS) {
    const link = queue.shift();
    if (seen.has(link)) continue;
    seen.add(link);
    if (/fonts\.googleapis\.com/.test(link)) {
      for (const family of new URL(link).searchParams.getAll('family')) googleFonts.push(family.split(':')[0].replace(/\+/g, ' '));
      continue;
    }
    try {
      const content = await download(link);
      css.push(content);
      sources.push(link);
      for (const m of content.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)/g)) queue.push(new URL(m[1], link).href);
    } catch (e) {
      sources.push(`(failed) ${link}: ${e.message}`);
    }
  }
  return { html, css: css.join('\n'), sources, googleFonts };
}

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out', 'coverage', 'vendor', '.turbo', '.cache']);
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less', '.pcss']);
const MARKUP_EXTENSIONS = new Set(['.html', '.vue', '.svelte', '.astro']);
function fromFolder(rootDir) {
  const css = [];
  const html = [];
  const sources = [];
  const configFiles = [];
  (function walk(dir, depth) {
    if (depth > 8) return;
    for (const name of readdirSync(dir)) {
      if (IGNORED_DIRS.has(name)) continue;
      const path = join(dir, name);
      const stats = statSync(path);
      if (stats.isDirectory()) walk(path, depth + 1);
      else if (stats.size < MAX_BYTES) {
        const ext = extname(name);
        if (/^tailwind\.config\.|^theme\.(ts|js|json)$|tokens?\.(json|ts|js|css)$/i.test(name)) configFiles.push(path);
        if (CSS_EXTENSIONS.has(ext)) {
          css.push(readFileSync(path, 'utf8'));
          sources.push(path);
        } else if (MARKUP_EXTENSIONS.has(ext)) {
          const text = readFileSync(path, 'utf8');
          html.push(text);
          for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css.push(m[1]);
        }
      }
    }
  })(resolve(rootDir), 0);
  const themeFiles = sources.filter((s) => /@theme\b/.test(readFileSync(s, 'utf8')));
  return { html: html.join('\n'), css: css.join('\n'), sources, configFiles, themeFiles, googleFonts: [] };
}

// ---------- Analyse ----------
function countValues(list) {
  const counts = new Map();
  for (const v of list) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
function normalizeColor(raw) {
  const c = raw.trim().toLowerCase();
  let m;
  if ((m = c.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((x) => x + x).join('');
    return h.length >= 6 ? '#' + h.slice(0, 6) : null;
  }
  if ((m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/))) return '#' + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3]);
  if ((m = c.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/))) {
    const [h, s, l] = [+m[1] / 360, +m[2] / 100, +m[3] / 100];
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return '#' + hex2(f(0) * 255) + hex2(f(8) * 255) + hex2(f(4) * 255);
  }
  return null;
}
function saturation(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

function analyze({ html, css }) {
  const declarations = [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/gi)].map((m) => [m[1].toLowerCase(), m[2].trim()]);
  const variables = countValues(declarations.filter(([p]) => p.startsWith('--')).map(([p, v]) => `${p}: ${v}`)).slice(0, 80);

  const usages = new Map();
  const colorPattern = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
  for (const [property, value] of declarations) {
    for (const raw of value.match(colorPattern) || []) {
      const hex = normalizeColor(raw);
      if (!hex) continue;
      const usage = usages.get(hex) || { total: 0, properties: new Map() };
      usage.total++;
      const key = property.startsWith('--') ? 'variable' : property.replace(/-(top|right|bottom|left|color)$/, '');
      usage.properties.set(key, (usage.properties.get(key) || 0) + 1);
      usages.set(hex, usage);
    }
  }
  const colors = [...usages.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 40)
    .map(([hex, u]) => ({
      hex,
      total: u.total,
      kind: saturation(hex) < 0.12 ? 'neutral' : 'chromatic',
      properties: [...u.properties.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${p} ${n}`).join(', '),
    }));

  const valuesOf = (pattern) => countValues(declarations.filter(([p]) => pattern.test(p)).map(([, v]) => v.replace(/\s*!important/, '')));
  const fontFaces = countValues([...css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*([^;]+)/gi)].map((m) => m[1].replace(/["']/g, '').trim()));
  const breakpoints = countValues([...css.matchAll(/\((?:min|max)-width\s*:\s*([\d.]+(?:px|em|rem))\)/gi)].map((m) => m[1]));

  const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim();
  const themeColor = (html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)/i) || [])[1];
  const logos = [...html.matchAll(/<(?:img|svg|a)\b[^>]*(?:logo)[^>]*>/gi)].slice(0, 5).map((m) => m[0].slice(0, 200));
  const nav = (html.match(/<nav\b[\s\S]*?<\/nav>/i) || [])[0] || '';
  const navLinks = [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 15);
  const hints = [];
  const utilityClasses = [...html.matchAll(/class(?:Name)?=["']([^"']*)["']/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter((c) => /^(?:[a-z]+:)*(?:bg|text|px|py|pt|pb|mt|mb|gap|rounded|flex|grid|w|h)-[a-z0-9[\]/.-]+$/.test(c)).length;
  if (/--tw-[a-z]/.test(css) || utilityClasses > 20) hints.push('Tailwind CSS (utility classes or --tw- variables)');
  if (/__next|_next\/static/.test(html)) hints.push('Next.js');
  if (/data-v-[0-9a-f]{6,}|__nuxt/.test(html)) hints.push('Vue / Nuxt');
  if (/ng-version/.test(html)) hints.push('Angular');
  if (/wp-content|wp-includes/.test(html)) hints.push('WordPress');
  if (/class="[^"]*\b(?:btn|col-md-|container-fluid)\b/.test(html)) hints.push('Bootstrap (likely)');
  if (/\bMui[A-Z]/.test(html)) hints.push('MUI');

  return {
    title,
    themeColor,
    logos,
    navLinks,
    hints,
    variables,
    colors,
    fontFamilies: valuesOf(/^font-family$/).slice(0, 12),
    fontFaces: fontFaces.slice(0, 12),
    fontSizes: valuesOf(/^font-size$/).slice(0, 15),
    fontWeights: valuesOf(/^font-weight$/).slice(0, 8),
    radii: valuesOf(/^border(-[a-z]+)*-radius$/).slice(0, 12),
    shadows: valuesOf(/^box-shadow$/).slice(0, 6),
    maxWidths: valuesOf(/^max-width$/).slice(0, 8),
    breakpoints: breakpoints.slice(0, 10),
  };
}

// ---------- Captures ----------
function findChrome() {
  return [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean).find((c) => existsSync(c));
}
function takeScreenshots(url, dir) {
  const chrome = findChrome();
  if (!chrome) return ['No Chrome/Chromium found (set CHROME_PATH): ask the person for screenshots.'];
  mkdirSync(dir, { recursive: true });
  const formats = [['desktop', '1440,900'], ['desktop-long', '1440,3000'], ['mobile', '390,844']];
  return formats.map(([name, size]) => {
    const output = resolve(dir, `${name}.png`);
    try {
      execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=6000', `--window-size=${size}`, `--user-agent=${USER_AGENT}`, `--screenshot=${output}`, url], { stdio: 'ignore', timeout: 60000 });
      return output;
    } catch (e) {
      return `(failed ${name}) ${e.message}`;
    }
  });
}

// ---------- Rapport ----------
function markdownReport(r) {
  const lines = [];
  const list = (heading, entries, format = ([v, n]) => `- \`${v}\` × ${n}`) => {
    lines.push(`\n## ${heading}`);
    lines.push(entries?.length ? entries.map(format).join('\n') : '_nothing found_');
  };
  lines.push(`# Extracted identity: ${r.target}`);
  if (r.title) lines.push(`\nTitle: ${r.title}`);
  if (r.themeColor) lines.push(`theme-color: \`${r.themeColor}\``);
  if (r.hints.length) lines.push(`Technical hints: ${r.hints.join(', ')}`);
  if (r.configFiles?.length) lines.push(`\nConfiguration / token files to read first:\n${r.configFiles.map((c) => `- ${c}`).join('\n')}`);
  if (r.themeFiles?.length) lines.push(`\nFiles with a @theme block (Tailwind v4):\n${r.themeFiles.map((c) => `- ${c}`).join('\n')}`);
  if (r.googleFonts?.length) lines.push(`\nGoogle Fonts loaded: ${r.googleFonts.join(', ')}`);
  list('Most used colors', r.colors, (c) => `- \`${c.hex}\` × ${c.total} · ${c.kind} · ${c.properties}`);
  list('CSS variables (most frequent)', r.variables);
  list('font-family', r.fontFamilies);
  list('@font-face', r.fontFaces);
  list('font-size', r.fontSizes);
  list('font-weight', r.fontWeights);
  list('border-radius', r.radii);
  list('box-shadow', r.shadows);
  list('max-width (containers)', r.maxWidths);
  list('Breakpoints', r.breakpoints);
  list('Links of the first <nav>', r.navLinks, (t) => `- ${t}`);
  list('Logo (candidates)', r.logos, (t) => `- \`${t}\``);
  if (r.screenshots) list('Screenshots', r.screenshots, (t) => `- ${t}`);
  list('Analyzed sources', r.sources, (t) => `- ${t}`);
  return lines.join('\n');
}

const isUrl = /^https?:\/\//i.test(target);
const collected = isUrl ? await fromUrl(target) : fromFolder(target);
const result = { target, ...analyze(collected), sources: collected.sources, googleFonts: collected.googleFonts, configFiles: collected.configFiles, themeFiles: collected.themeFiles };
if (isUrl && screenshotDir) result.screenshots = takeScreenshots(target, screenshotDir);
console.log(asJson ? JSON.stringify(result, null, 2) : markdownReport(result));

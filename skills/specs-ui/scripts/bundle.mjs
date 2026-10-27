#!/usr/bin/env node
/**
 * Version autonome d'un livrable : un seul fichier HTML, sans réseau au chargement, à télécharger, à joindre à un
 * message, ou à afficher là où un artifact ne contient qu'un fichier (chat claude.ai, voir references/claude-ai.md).
 * Sert aux trois skills de la chaîne (specs, prototype, cahier des charges).
 *
 * Usage :
 *   node bundle.mjs <site-dir> <out.html> [--start index.html]   site de plusieurs pages (specs, prototype)
 *   node bundle.mjs <page.html> <out.html>                        page seule (cahier des charges)
 *
 * Intégrés au fichier : scripts (locaux ou CDN), feuilles de style locales et images. Un script CDN est téléchargé
 * une fois (cache dans le dossier temporaire) depuis le CDN, sinon avec curl (qui suit le proxy du bac à sable), sinon
 * depuis le registre npm (npm pack) : le bac à sable de claude.ai n'autorise souvent que les gestionnaires de paquets.
 * Les polices Google Fonts restent des liens : sans réseau, la page prend ses polices de repli.
 *
 * Site : une page coquille affiche chaque page dans un cadre (srcdoc), sans adresse propre. Un script injecté en tête
 * de chaque page lui donne son adresse (window.__bundle), intercepte les liens et la navigation, et remplace
 * localStorage par un stockage tenu par la coquille : les données passent d'une page à l'autre, et restent dans le
 * localStorage de la coquille quand le navigateur le permet. Scripts et images communs à plusieurs pages ne sont
 * stockés qu'une fois. L'adresse de la page affichée est dans le fragment de la coquille (#/lot/e3.html#e3b).
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname, relative, extname, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [input, output] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--start');
if (!input || !output || !existsSync(input)) {
  console.error('Usage: node bundle.mjs <site-dir> <out.html> [--start index.html] | <page.html> <out.html>');
  process.exit(2);
}
const isSite = statSync(input).isDirectory();
const root = resolve(isSite ? input : dirname(input));

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
};
const isRemote = (ref) => /^(?:https?:)?\/\//.test(ref);
const isInlineable = (ref) => ref && !isRemote(ref) && !/^(?:data|blob|mailto|tel|javascript):|^#/.test(ref);
// Chemin d'une ressource depuis la racine, à partir de la page qui la cite (null si elle sort de la racine)
const fromPage = (pagePath, ref) => {
  const path = posix.normalize(posix.join(posix.dirname(pagePath), decodeURI(ref.split(/[?#]/)[0])));
  return path.startsWith('../') ? null : path;
};
// Un </script> dans le contenu fermerait la balise
const scriptText = (code) => code.replace(/<\/(script)/gi, '<\\/$1');

// ---------- Scripts CDN : cache, puis CDN, curl, registre npm ----------
const cacheDir = join(tmpdir(), 'skills-bundle-cache');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
async function remote(url) {
  url = url.startsWith('//') ? `https:${url}` : url;
  const cached = join(cacheDir, createHash('sha256').update(url).digest('hex').slice(0, 20));
  if (existsSync(cached)) return readFileSync(cached, 'utf8');
  const errors = [];
  const attempts = [
    async () => {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    () => execFileSync('curl', ['-fsSL', '--max-time', '30', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }),
    () => fromNpm(url),
  ];
  for (const [i, attempt] of attempts.entries()) {
    try {
      const text = await attempt();
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cached, text);
      return text;
    } catch (e) {
      errors.push(`${['fetch', 'curl', 'npm pack'][i]}: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
    }
  }
  throw new Error(`could not download ${url} (${errors.join(' · ')})`);
}
// https://cdn.jsdelivr.net/npm/<paquet>@<version>[/<chemin>] (ou unpkg) → fichier du paquet publié sur npm
function fromNpm(url) {
  const m = url.match(/^https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@[^/]+\/)?[^/@]+)@([^/]+)(\/[^?#]*)?/);
  if (!m) throw new Error('not an npm package URL');
  const [, name, version, path] = m;
  const dir = mkdtempSync(join(tmpdir(), 'skills-bundle-'));
  try {
    const tgz = execFileSync(npm, ['pack', `${name}@${version}`, '--silent'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }).trim().split('\n').pop();
    execFileSync('tar', ['-xzf', tgz], { cwd: dir, stdio: 'ignore' });
    const pkgDir = join(dir, 'package');
    let file = path && path !== '/' ? path.slice(1) : null;
    if (!file) {
      const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
      file = [pkg.jsdelivr, pkg.unpkg, typeof pkg.browser === 'string' ? pkg.browser : null, pkg.main, 'index.js'].find(Boolean);
    }
    return readFileSync(join(pkgDir, file.replace(/^\.\//, '')), 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- Ressources partagées (site) ----------
// Chaque script, feuille de style ou image n'est stocké qu'une fois ; les pages le citent par __bundle_rN__
const resources = [];
const resourceIndex = new Map();
const share = (key, value) => {
  if (!resourceIndex.has(key)) resourceIndex.set(key, resources.push(value) - 1);
  return `__bundle_r${resourceIndex.get(key)}__`;
};
const missing = new Set();
const dataUri = (path) => `data:${MIME[extname(path).toLowerCase()]};base64,${readFileSync(join(root, path)).toString('base64')}`;
const asset = (pagePath, ref) => {
  if (!isInlineable(ref) || !MIME[extname(ref.split(/[?#]/)[0]).toLowerCase()]) return null;
  const path = fromPage(pagePath, ref);
  if (!path || !existsSync(join(root, path))) {
    missing.add(`${ref} (in ${pagePath})`);
    return null;
  }
  return isSite ? share(`asset:${path}`, dataUri(path)) : dataUri(path);
};
const inlineCssUrls = (css, cssPath) => css.replace(/url\((["']?)([^"')]+)\1\)/g, (match, quote, ref) => {
  const value = asset(cssPath, ref);
  return value ? `url("${value}")` : match;
});

async function inlinePage(html, pagePath) {
  // Feuilles de style locales, puis images (avant les scripts, dont le code n'est pas à analyser)
  html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) => {
    const href = tag.match(/\shref="([^"]+)"/)?.[1];
    if (!isInlineable(href)) return tag;
    const path = fromPage(pagePath, href);
    if (!path || !existsSync(join(root, path))) {
      missing.add(`${href} (in ${pagePath})`);
      return tag;
    }
    const css = inlineCssUrls(readFileSync(join(root, path), 'utf8'), path).replace(/<\/(style)/gi, '<\\/$1');
    return `<style>${isSite ? share(`style:${path}`, css) : css}</style>`;
  });
  // Images et médias cités par un attribut, url(…) dans les styles
  html = html.replace(/(\s(?:src|href|poster)=")([^"]+)"/g, (match, prefix, ref) => {
    const value = asset(pagePath, ref);
    return value ? `${prefix}${value}"` : match;
  });
  html = html.replace(/url\((&quot;|["']?)([^"')&]+)\1\)/g, (match, quote, ref) => {
    const value = asset(pagePath, ref);
    return value ? `url(${quote}${value}${quote})` : match;
  });
  // Scripts : contenu intégré ; un script defer passe en fin de page, où il s'exécute dans le même ordre
  const deferred = [];
  const scripts = [...html.matchAll(/<script\b([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>/g)];
  const codes = await Promise.all(scripts.map(async ([, , src]) => {
    if (isRemote(src)) return { key: `remote:${src}`, code: await remote(src) };
    const path = fromPage(pagePath, src);
    if (!path || !existsSync(join(root, path))) {
      missing.add(`${src} (in ${pagePath})`);
      return null;
    }
    return { key: `script:${path}`, code: readFileSync(join(root, path), 'utf8') };
  }));
  let i = 0;
  html = html.replace(/<script\b([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>/g, (tag, before, src, after) => {
    const found = codes[i++];
    if (!found) return tag;
    const attrs = `${before}${after}`.replace(/\s(?:defer|async|crossorigin(?:="[^"]*")?|integrity="[^"]*")/g, '');
    const body = isSite ? share(found.key, scriptText(found.code)) : scriptText(found.code);
    const inline = `<script${attrs}>${body}</script>`;
    if (/\sdefer\b/.test(before + after)) {
      deferred.push(inline);
      return '';
    }
    return inline;
  });
  if (deferred.length) html = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${deferred.join('\n')}\n</body>`);
  return html;
}

// ---------- Script injecté en tête de chaque page du site ----------
// Exécuté dans le cadre : o = { path, search, hash, store }
function pageShim(o) {
  var ORIGIN = 'https://bundle.invalid';
  var base = ORIGIN + '/' + o.path;
  var post = function (message) { message.bundle = message.bundle || 'go'; parent.postMessage(message, '*'); };
  var bundle = (window.__bundle = {
    path: o.path,
    url: base + o.search + o.hash,
    hash: o.hash,
    // Changer de page : la coquille affiche la page demandée
    go: function (url) { post({ bundle: 'go', url: String(new URL(url, base)) }); },
    // Changer de paramètres sans recharger (history.replaceState d'une page servie normalement)
    replace: function (url) { bundle.url = String(new URL(url, base)); post({ bundle: 'replace', url: bundle.url }); },
  });
  // localStorage tenu par la coquille : lu ici d'un bloc, chaque écriture lui est renvoyée
  var data = o.store;
  var has = function (key) { return Object.prototype.hasOwnProperty.call(data, key); };
  var storage = {
    getItem: function (key) { return has(String(key)) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); post({ bundle: 'set', key: String(key), value: String(value) }); },
    removeItem: function (key) { delete data[key]; post({ bundle: 'remove', key: String(key) }); },
    clear: function () { data = {}; post({ bundle: 'clear' }); },
    key: function (i) { return Object.keys(data)[i] ?? null; },
    get length() { return Object.keys(data).length; },
  };
  try { Object.defineProperty(window, 'localStorage', { value: storage, configurable: true }); } catch (e) { /* stockage d'origine */ }
  // location.hash renvoie l'ancre demandée (#e3b) : la page la rejoue une fois mise en forme
  if (o.hash.length > 1) try { location.hash = o.hash; } catch (e) { /* ancre ignorée */ }
  var scrollToHash = function (hash) {
    var target = hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) target.scrollIntoView();
    else if (!hash || hash === '#') window.scrollTo(0, 0);
  };
  // Lien ou navigation vers une page du site : la coquille change de page ; même page : simple défilement
  var follow = function (url) {
    var current = new URL(bundle.url);
    if (url.pathname === current.pathname && url.search === current.search) {
      if (url.hash !== location.hash) try { location.hash = url.hash; } catch (e) { /* idem */ }
      scrollToHash(url.hash);
    } else bundle.go(url.href);
  };
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link || link.hasAttribute('download')) return;
    var url = new URL(link.href, base);
    // Lien externe : nouvel onglet, la version autonome reste affichée
    if (url.origin !== ORIGIN) {
      if (/^https?:$/.test(url.protocol)) link.target = '_blank';
      return;
    }
    event.preventDefault();
    follow(url);
  });
  // Filet de sécurité (navigateurs qui ont l'API Navigation) : location.href = … dans un script de la page
  if (window.navigation) {
    navigation.addEventListener('navigate', function (event) {
      var url = new URL(event.destination.url);
      if (url.origin !== ORIGIN || !event.cancelable) return;
      event.preventDefault();
      follow(url);
    });
  }
  document.addEventListener('DOMContentLoaded', function () { post({ bundle: 'title', title: document.title }); });
}

// ---------- Coquille ----------
function shell({ title, background, pages, start }) {
  title = title.replace(/["<]/g, (c) => (c === '"' ? '&quot;' : '&lt;'));
  const data = JSON.stringify({ pages, resources, start, shim: `(${pageShim.toString()})` }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Version autonome construite par bundle.mjs (skill specs-ui) : reconstruire le site puis ce fichier, ne pas modifier à la main. -->
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: ${background}; }
  #view { display: block; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<iframe id="view" title="${title}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
<script type="application/json" id="bundle-data">${data}</script>
<script>
(function () {
  var ORIGIN = 'https://bundle.invalid';
  var bundle = JSON.parse(document.getElementById('bundle-data').textContent);
  var view = document.getElementById('view');
  // Stockage commun aux pages : localStorage de la coquille s'il est disponible, sinon mémoire de la session
  var persistent = null;
  try { localStorage.setItem('__bundle__', '1'); localStorage.removeItem('__bundle__'); persistent = localStorage; } catch (e) { /* mémoire seule */ }
  var store = {};
  if (persistent) for (var i = 0; i < persistent.length; i++) store[persistent.key(i)] = persistent.getItem(persistent.key(i));
  var save = function (fn) { try { if (persistent) fn(persistent); } catch (e) { /* quota, stockage retiré */ } };
  var fill = function (html) { return html.replace(/__bundle_r(\\d+)__/g, function (m, n) { return bundle.resources[n]; }); };
  var current = '';
  var target = function (url) {
    var u = new URL(url || bundle.start, ORIGIN + '/');
    var path = decodeURIComponent(u.pathname.slice(1)) || bundle.start;
    if (path.endsWith('/')) path += 'index.html';
    if (!bundle.pages[path] && bundle.pages[path + '/index.html']) path += '/index.html';
    return { path: path, search: u.search, hash: u.hash };
  };
  var remember = function (t, push) {
    var hash = '#/' + t.path + t.search + t.hash;
    if (location.hash === hash) return;
    try { history[push ? 'pushState' : 'replaceState'](null, '', hash); } catch (e) { /* adresse figée : sans effet */ }
  };
  function show(url, push) {
    var t = target(url);
    if (!bundle.pages[t.path]) { console.warn('Page absente de la version autonome : ' + t.path); return; }
    remember(t, push);
    current = '#/' + t.path + t.search + t.hash;
    var options = JSON.stringify({ path: t.path, search: t.search, hash: t.hash, store: store }).replace(/</g, '\\\\u003c');
    var head = '<base href="' + ORIGIN + '/' + t.path + '"><script>' + bundle.shim + '(' + options + ');<\\/script>';
    view.srcdoc = fill(bundle.pages[t.path]).replace(/<head\\b[^>]*>/i, function (m) { return m + head; });
  }
  window.addEventListener('message', function (event) {
    var d = event.data;
    if (event.source !== view.contentWindow || !d || typeof d.bundle !== 'string') return;
    if (d.bundle === 'go') show(d.url, true);
    else if (d.bundle === 'replace') { var t = target(d.url); remember(t, false); current = location.hash; }
    else if (d.bundle === 'set') { store[d.key] = d.value; save(function (s) { s.setItem(d.key, d.value); }); }
    else if (d.bundle === 'remove') { delete store[d.key]; save(function (s) { s.removeItem(d.key); }); }
    else if (d.bundle === 'clear') { store = {}; save(function (s) { s.clear(); }); }
    else if (d.bundle === 'title') document.title = d.title;
  });
  var fromLocation = function () { return location.hash.indexOf('#/') === 0 ? location.hash.slice(2) : ''; };
  window.addEventListener('popstate', function () { if (location.hash !== current) show(fromLocation(), false); });
  show(fromLocation(), false);
})();
</script>
</body>
</html>
`;
}

// ---------- Construction ----------
const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
let result;
if (isSite) {
  const htmlFiles = listFiles(root).filter((f) => f.endsWith('.html')).map((f) => relative(root, f).split('\\').join('/'));
  const start = option('start', 'index.html');
  if (!htmlFiles.includes(start)) {
    console.error(`${start} not found in ${input} (build the site first, or pass --start)`);
    process.exit(1);
  }
  const pages = {};
  for (const path of htmlFiles.sort()) pages[path] = await inlinePage(readFileSync(join(root, path), 'utf8'), path);
  const startHtml = readFileSync(join(root, start), 'utf8');
  const title = startHtml.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Version autonome';
  // Fond de la coquille : celui de la page d'accueil (html { background: … }), blanc sinon
  const background = startHtml.match(/html\s*\{\s*background:\s*([^;}]+)/)?.[1].trim() ?? '#ffffff';
  result = shell({ title, background, pages, start });
  console.log(`Bundled ${htmlFiles.length} pages and ${resources.length} shared resources from ${relative(process.cwd(), root) || root}.`);
} else {
  // Page affichée en srcdoc (aperçu d'artifact) : un lien #ancre se résoudrait vers l'adresse du parent et viderait le
  // cadre ; la garde fait défiler la page à la place
  const anchorGuard = `<script>document.addEventListener('click', function (event) {
  if (location.protocol !== 'about:' || event.defaultPrevented || event.button !== 0) return;
  var link = event.target.closest && event.target.closest('a[href^="#"]');
  if (!link) return;
  event.preventDefault();
  var id = decodeURIComponent(link.getAttribute('href').slice(1));
  var target = id && document.getElementById(id);
  if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  try { location.hash = id; } catch (e) { /* ancre non mémorisée */ }
});</script>`;
  result = (await inlinePage(readFileSync(resolve(input), 'utf8'), posix.basename(input))).replace(/<head\b[^>]*>/i, (head) => `${head}\n${anchorGuard}`);
}
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(output, result);
const kb = Math.round(Buffer.byteLength(result) / 1024);
console.log(`Wrote ${output} (${kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}), no network needed except web fonts.`);
if (missing.size) console.log(`WARNING: files not found, left as links (${missing.size}): ${[...missing].slice(0, 15).join(', ')}${missing.size > 15 ? ', …' : ''}`);

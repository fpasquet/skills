#!/usr/bin/env node
/**
 * Construit le site du prototype à partir de ses sources.
 *
 * Usage : node build.mjs prototype-ui
 *
 * Sources (prototype-ui/src/) : prototype.json (titre, specs, scénarios, pages), data.js, actions.js,
 * shells.html (coquilles et templates), pages/eN.html (une page par écran).
 * L'identité vient du projet de specs indiqué par prototype.json → specs : tokens.css et polices du premier lot.
 *
 * Sortie (prototype-ui/site/) : index.html (accueil : scénarios, exploration libre, liste des écrans) et une
 * page par écran. Chaque page embarque Tailwind, Alpine.js, Lucide, l'état simulé (store), les actions,
 * les coquilles qu'elle utilise et le panneau « Scénarios ». Affiche les pages modifiées et supprime les
 * pages sans source.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') && resolve(args[0]);
if (!root || !existsSync(join(root, 'src', 'prototype.json'))) {
  console.error('Usage: node build.mjs prototype-ui [--cdn]   (the folder must contain src/prototype.json)');
  process.exit(2);
}
const read = (path, fallback = '') => (existsSync(path) ? readFileSync(path, 'utf8') : fallback);
const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(read(join(root, 'src', 'prototype.json')));
const specsDir = resolve(root, config.specs ?? '../specs-ui');
const outDir = join(root, 'site');

// Identité : tokens et polices du projet de specs
const tokens = read(join(specsDir, 'tokens.css'));
const theme = tokens.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0];
if (!theme) {
  console.error(`@theme block not found in ${join(specsDir, 'tokens.css')}`);
  process.exit(1);
}
const tokenValue = (name, fallback) => theme.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim() ?? fallback;
const site = JSON.parse(read(join(specsDir, 'sources', 'site.json'), '{}'));
const firstLot = (site.lots ?? []).find((l) => existsSync(join(specsDir, 'sources', l, 'lot.json')));
const fonts = config.fonts ?? (firstLot ? JSON.parse(read(join(specsDir, 'sources', firstLot, 'lot.json'))).fonts : '');

// Tailwind compilé au build (affichage immédiat, pas de compilation dans le navigateur) si la CLI est
// disponible : prototype-ui/node_modules (npm install), variable TAILWIND_CLI, ou tailwindcss dans le PATH.
// Sinon, repli sur Tailwind navigateur (CDN).
function findTailwind() {
  const candidates = [process.env.TAILWIND_CLI, join(root, 'node_modules', '.bin', 'tailwindcss')].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    execFileSync('tailwindcss', ['--help'], { stdio: 'ignore' });
    return 'tailwindcss';
  } catch {
    return null;
  }
}
const tailwindCli = args.includes('--cdn') ? null : findTailwind();
// Dossier de travail dans le prototype : la CLI y résout « tailwindcss » depuis prototype-ui/node_modules
const workDir = tailwindCli ? join(root, '.build-tmp') : null;
if (workDir) mkdirSync(workDir, { recursive: true });
const baseCss = `[x-cloak] { display: none !important; }
  [data-proto-probe] { display: none; }
  /* Règle hors couche : l'emporte sur le style de base qu'ajoute l'outil Artifact à la page principale */
  html body { margin: 0; background: ${tokenValue('--color-canvas', '#ffffff')}; color: ${tokenValue('--color-ink', '#111111')}; font-family: ${tokenValue('--font-sans', 'ui-sans-serif, system-ui, sans-serif')}; font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }`;
// CSS d'une page : seulement les classes qu'elle contient (y compris coquilles, panneau et scripts inlinés)
function compileCss(html, name) {
  const page = join(workDir, `${name}.html`);
  const input = join(workDir, `${name}.css`);
  const output = join(workDir, `${name}.out.css`);
  writeFileSync(page, `${html}\n${chrome}\n<script>${data}\n${actions}</script>`);
  writeFileSync(input, `@import "tailwindcss" source(none);\n@source "./${name}.html";\n${theme}\n${baseCss}\n`);
  try {
    execFileSync(tailwindCli, ['-i', input, '-o', output, '--minify'], { cwd: workDir, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    rmSync(workDir, { recursive: true, force: true });
    console.error(`Tailwind compilation failed for ${name} (rerun with --cdn to skip it):\n${String(e.stderr ?? e.message).trim()}`);
    process.exit(1);
  }
  return readFileSync(output, 'utf8');
}

// Alpine.js et Lucide servis depuis le site s'ils sont installés (npm install dans le prototype) : pas de
// réseau au chargement, contrôles stables ; sinon CDN aux mêmes versions
const vendor = [
  { name: 'alpine.js', from: join(root, 'node_modules', 'alpinejs', 'dist', 'cdn.min.js'), cdn: 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js', defer: true },
  { name: 'lucide.js', from: join(root, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js'), cdn: 'https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js', defer: false },
].map((v) => ({ ...v, local: existsSync(v.from) }));
const vendorTag = (v) => `<script${v.defer ? ' defer' : ''} src="${v.local ? v.name : v.cdn}"></script>`;

const store = read(join(skillDir, 'templates', 'store.js'));
const assemble = read(join(skillDir, 'templates', 'assemble.js'));
const checkHook = read(join(skillDir, 'templates', 'check-hook.js'));
const chrome = read(join(skillDir, 'templates', 'chrome.html')).replace(/^<!--[\s\S]*?-->\s*/, '');
const data = read(join(root, 'src', 'data.js'), 'window.PROTO_DATA = {};');
const actions = read(join(root, 'src', 'actions.js'), 'window.PROTO_ACTIONS = {};');
// Templates de premier niveau de shells.html ; ils peuvent contenir des <template x-for> imbriqués
function topLevelTemplates(html) {
  const found = [];
  for (const start of html.matchAll(/<template id="([^"]+)">/g)) {
    if (found.some((t) => start.index < t.end)) continue;
    let depth = 0;
    for (const m of html.slice(start.index).matchAll(/<template\b|<\/template>/g)) {
      depth += m[0] === '</template>' ? -1 : 1;
      if (depth === 0) {
        const end = start.index + m.index + '</template>'.length;
        found.push({ id: start[1], html: html.slice(start.index, end), end });
        break;
      }
    }
  }
  return found;
}
// Navigation des coquilles : prototype.json → nav { "<data-nav>": "e2.html", "<template>:<data-nav>": … }
// appliquée aux liens [data-nav] qui n'ont pas encore de destination. {param} reprend ce paramètre de la page
// en cours (prototype.json → params donne sa valeur par défaut) : "e5.html?project={project}".
const navTable = config.nav ?? {};
const navDefaults = config.params ?? {};
function navHref(target) {
  if (!target.includes('{')) return `href="${target}"`;
  const parts = target.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? `($store.app.param('${part}') ?? '${navDefaults[part] ?? ''}')` : `'${part}'`));
  return `:href="${parts.filter((p) => p !== "''").join(' + ')}"`;
}
function applyNav(template) {
  return {
    ...template,
    html: template.html.replace(/<a\b([^>]*?)\bdata-nav="([^"]+)"([^>]*)>/g, (tag, before, id, after) => {
      if (/\s:?href=/.test(before + after)) return tag;
      const target = navTable[`${template.id}:${id}`] ?? navTable[id];
      return target ? `<a${before}data-nav="${id}" ${navHref(target)}${after}>` : tag;
    }),
  };
}
const templates = topLevelTemplates(read(join(root, 'src', 'shells.html'))).map(applyNav);
const publicConfig = { id: config.id, title: config.title, home: 'index.html', scenarios: config.scenarios ?? [] };

// Templates réellement utilisés par une page (y compris imbriqués)
function usedTemplates(html) {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const used = new Set();
  const queue = [...html.matchAll(/data-use="([^"]+)"/g)].map((m) => `tpl-${m[1]}`);
  while (queue.length) {
    const id = queue.shift();
    if (used.has(id) || !byId.has(id)) continue;
    used.add(id);
    for (const m of byId.get(id).html.matchAll(/data-use="([^"]+)"/g)) queue.push(`tpl-${m[1]}`);
  }
  return templates.filter((t) => used.has(t.id));
}

function renderPage(title, body, name) {
  const pageTemplates = usedTemplates(body);
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Page construite par prototype-ui/build.mjs depuis prototype-ui/src : modifier les sources, pas ce fichier. -->
<title>${title}</title>
<script>
${checkHook.trim()}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style>
  /* Fond de l'application et contenu masqué jusqu'au démarrage d'Alpine (et, en mode CDN, jusqu'à ce que
     Tailwind ait produit les styles) : jamais de page brute ni d'états superposés. store.js ajoute .proto-ready. */
  html { background: ${tokenValue('--color-canvas', '#ffffff')}; }
  html:not(.proto-ready) body { opacity: 0; }${tailwindCli ? '' : '\n  html.proto-ready body { opacity: 1; transition: opacity 0.12s ease-out; }'}
</style>
${fonts ? `<link rel="stylesheet" href="${fonts}">\n` : ''}${tailwindCli ? '<style>/*__TAILWIND__*/</style>' : '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.13"></script>'}
${vendorTag(vendor[1])}
${vendorTag(vendor[0])}
${tailwindCli ? '' : `<style type="text/tailwindcss">\n  ${theme.replace(/\n/g, '\n  ')}\n  ${baseCss}\n</style>\n`}</head>
<body>
${body}

${pageTemplates.map((t) => t.html).join('\n\n')}

<script src="data.js"></script>
<script src="proto.js"></script>
</body>
</html>
`;
  return tailwindCli ? html.replace('/*__TAILWIND__*/', () => compileCss(html, name)) : html;
}

// ---------- Pages d'écran ----------
const pages = new Map();
const pagesDir = join(root, 'src', 'pages');
const screenFiles = existsSync(pagesDir) ? readdirSync(pagesDir).filter((f) => f.endsWith('.html')) : [];
const titleOf = (screen) => config.pages?.find((p) => p.screen === screen)?.title ?? screen.toUpperCase();
for (const f of screenFiles) {
  const screen = f.replace(/\.html$/, '');
  const body = read(join(pagesDir, f)).replace(/^\s*<!--[\s\S]*?-->\s*/, '');
  pages.set(f, renderPage(`${titleOf(screen)} · ${config.title}`, body, screen));
}

// ---------- Accueil ----------
const byLot = new Map();
for (const p of config.pages ?? []) {
  if (!screenFiles.includes(`${p.screen}.html`)) continue;
  if (!byLot.has(p.lot)) byLot.set(p.lot, []);
  byLot.get(p.lot).push(p);
}
const home = `<main class="mx-auto max-w-5xl px-4 py-10 sm:px-6" x-data="protoScenarios">
  <p class="font-mono text-xs font-medium tracking-wider text-primary uppercase">Prototype</p>
  <h1 class="mt-1 font-display text-3xl font-semibold tracking-tight">${config.title}</h1>
  ${config.description ? `<p class="mt-3 text-muted">${config.description}</p>` : ''}
  <div class="mt-6 flex flex-wrap gap-3">
    <a href="${config.start}" class="inline-flex h-control items-center gap-2 rounded-control bg-primary px-4 font-medium text-on-primary">Explorer librement</a>
    <button type="button" class="inline-flex h-control items-center gap-2 rounded-control border border-line-strong bg-surface px-4 font-medium" @click="$store.app.reset()">Réinitialiser les données</button>
  </div>
  <section class="mt-10">
    <h2 class="font-display text-lg font-semibold">Scénarios de test</h2>
    <p class="mt-1 text-sm text-muted">Chaque scénario donne un objectif et des étapes à cocher dans le panneau « Scénarios », sur le bord droit de l’écran.</p>
    <ol class="mt-4 grid gap-3 md:grid-cols-2">
      <template x-for="s in scenarios" :key="s.id">
        <li class="flex flex-col rounded-card border border-line bg-surface p-4 shadow-card">
          <p class="font-semibold" x-text="s.title"></p>
          <p class="mt-1 text-xs text-muted" x-text="(s.persona ? 'Persona : ' + s.persona + ' · ' : '') + s.steps.length + ' étapes'"></p>
          <p class="mt-2 text-sm" x-text="s.goal"></p>
          <button type="button" class="mt-3 self-start inline-flex h-control items-center rounded-control bg-primary px-3 text-sm font-medium text-on-primary" @click="start(s.id)">Commencer</button>
        </li>
      </template>
    </ol>
  </section>
  <section class="mt-10">
    <h2 class="font-display text-lg font-semibold">Tous les écrans</h2>
    <div class="mt-3 grid gap-4 md:grid-cols-2">
      ${[...byLot].map(([lot, list]) => `<div><p class="text-sm font-medium text-muted">${lot}</p><ul class="mt-1 text-sm">${list.map((p) => `<li><a class="hover:text-primary" href="${p.screen}.html"><span class="font-mono text-xs text-muted">${p.screen.toUpperCase()}</span> ${p.title}</a></li>`).join('')}</ul></div>`).join('\n      ')}
    </div>
  </section>
</main>`;
pages.set('index.html', renderPage(config.title, home, 'index'));

// ---------- Écriture ----------
// Socle partagé par toutes les pages, hors des pages : une correction du socle ou des données ne change
// qu'un fichier (publication incrémentale), et le navigateur le garde en cache d'un écran à l'autre
pages.set('data.js', `// Construit par build.mjs : configuration, données et actions du prototype (src/)\nwindow.PROTO_CONFIG = ${JSON.stringify(publicConfig)};\n${data}\n${actions}\n`);
// Le panneau « Scénarios » est inséré par proto.js, avant le démarrage d'Alpine (chargé en defer)
pages.set('proto.js', `// Construit par build.mjs : socle du skill prototype-ui (panneau, store, scénarios, assemblage des blocs)\ndocument.body.insertAdjacentHTML('beforeend', ${JSON.stringify(chrome)});\n${store}\n${assemble}\n`);
mkdirSync(outDir, { recursive: true });
for (const v of vendor.filter((v) => v.local)) {
  pages.set(v.name, readFileSync(v.from, 'utf8'));
}
const changed = [];
for (const [path, html] of pages) {
  const target = join(outDir, path);
  if (read(target) !== html) changed.push(path);
  writeFileSync(target, html);
}
const removed = [];
for (const f of readdirSync(outDir).filter((f) => /\.(html|js)$/.test(f))) {
  if (!pages.has(f)) {
    unlinkSync(join(outDir, f));
    removed.push(f);
  }
}
if (workDir) rmSync(workDir, { recursive: true, force: true });
const sizes = [...pages].filter(([path]) => path.endsWith('.html')).map(([, h]) => h.length);
console.log(`Built ${relative(process.cwd(), outDir) || outDir}: ${sizes.length} pages + data.js, proto.js${vendor.every((v) => v.local) ? ', alpine.js, lucide.js' : ' (Alpine and Lucide from CDN)'} (largest ${Math.round(Math.max(...sizes) / 1024)} KB), ${config.scenarios?.length ?? 0} scenario(s), Tailwind ${tailwindCli ? 'compiled' : 'from CDN (run npm install in the prototype folder to compile it)'}.`);
console.log(changed.length ? `Changed pages (${changed.length}): ${changed.join(', ')}` : 'No page changed.');
if (removed.length) console.log(`Removed pages without source: ${removed.join(', ')}`);
const missing = (config.scenarios ?? []).filter((s) => !pages.has(s.start.split('?')[0])).map((s) => `${s.id} → ${s.start}`);
if (missing.length) console.log(`WARNING: scenario start pages not found: ${missing.join(', ')}`);

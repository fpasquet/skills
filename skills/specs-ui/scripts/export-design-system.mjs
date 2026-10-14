#!/usr/bin/env node
/**
 * Prépare un dossier Design System (Claude Design) à partir de l'identité d'un projet de specs.
 * Fonctionnalité facultative : à lancer seulement si la personne a choisi de l'utiliser.
 *
 * Usage : node export-design-system.mjs specs-ui [--out specs-ui/design-system]
 *
 * Produit :
 *   README.md                  consignes : produit, thème, vocabulaire des tokens, règles d'usage, composants
 *   tokens.css                 copie de specs-ui/tokens.css
 *   foundations/*.html         couleurs, typographie, formes et relief (valeurs lues dans tokens.css)
 *   components/*.html          composants du catalogue du skill (templates/design-system.html)
 *   patterns/*.html            composants propres au projet (sources/shared/*.html : coquilles, en-têtes…)
 * Chaque aperçu commence par le marqueur <!-- @dsCard group="…" --> lu par Claude Design.
 * La synchronisation se fait ensuite avec le skill /design-sync, lancé par la personne.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const root = args[0] && resolve(args[0]);
if (!root || !existsSync(join(root, 'tokens.css'))) {
  console.error('Usage: node export-design-system.mjs specs-ui [--out specs-ui/design-system]   (the folder must contain tokens.css)');
  process.exit(2);
}
const outDir = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : join(root, 'design-system');
const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path, fallback = '') => (existsSync(path) ? readFileSync(path, 'utf8') : fallback);

const tokensCss = read(join(root, 'tokens.css'));
const theme = tokensCss.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0];
if (!theme) {
  console.error('@theme block not found in tokens.css');
  process.exit(1);
}
const site = JSON.parse(read(join(root, 'sources', 'site.json'), '{}'));
const product = site.title ?? 'Produit';
const firstLot = (site.lots ?? []).find((l) => existsSync(join(root, 'sources', l, 'lot.json')));
const fonts = firstLot ? JSON.parse(read(join(root, 'sources', firstLot, 'lot.json'))).fonts ?? '' : '';
const template = read(join(skillDir, 'templates', 'specs.html'));
const finalScript = [...template.matchAll(/<script>[\s\S]*?<\/script>/g)].at(-1)?.[0] ?? '';
// La note d'un token est le commentaire sur sa propre ligne, pas l'intertitre de la ligne suivante
const tokenEntries = [...theme.matchAll(/(--[\w-]+)\s*:\s*([^;]+);(?:[ \t]*\/\*[ \t]*([^*\n]*?)[ \t]*\*\/)?/g)].map((m) => ({ name: m[1], value: m[2].trim(), note: m[3] ?? '' }));
const themeComment = tokensCss.match(/\/\*([\s\S]*?)\*\//)?.[1]?.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean).join('\n') ?? '';

// ---------- Gabarit d'un aperçu ----------
function previewPage({ group, title, body, templates = '' }) {
  return `<!-- @dsCard group="${group}" -->
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${product}</title>
${fonts ? `<link rel="stylesheet" href="${fonts}">\n` : ''}<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.13"></script>
<script src="https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js"></script>
<style type="text/tailwindcss">
  ${theme.replace(/\n/g, '\n  ')}
  html body { margin: 0; padding: 24px; background: var(--color-canvas); color: var(--color-ink); font-family: var(--font-sans); font-size: 14px; line-height: 1.5; }
</style>
</head>
<body>
<div id="page">
${body}
</div>
${templates}
${finalScript}
</body>
</html>
`;
}

// ---------- Fondations ----------
const colors = tokenEntries.filter((t) => t.name.startsWith('--color-'));
// Une classe plutôt qu'une variable : Tailwind ne publie que les variables de thème utilisées par une classe
const swatch = (t) => `<div><div class="h-14 rounded-control border border-line bg-${t.name.replace('--color-', '')}"></div><p class="mt-1.5 text-sm font-medium">${t.name.replace('--color-', '')}</p><p class="font-mono text-xs text-muted">${t.value}</p>${t.note ? `<p class="text-xs text-muted">${t.note}</p>` : ''}</div>`;
const foundations = {
  colors: {
    title: 'Couleurs',
    body: `<h1 class="font-display text-xl font-semibold">Couleurs</h1>
<div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">${colors.map(swatch).join('\n')}</div>`,
  },
  typography: {
    title: 'Typographie',
    body: `<h1 class="font-display text-xl font-semibold">Typographie</h1>
<div class="mt-4 flex flex-col gap-4">
  <div><p class="text-xs text-muted">Titre de page · font-display</p><p class="font-display text-3xl font-semibold tracking-tight">Titre de page</p></div>
  <div><p class="text-xs text-muted">Titre de section</p><p class="font-display text-lg font-semibold">Titre de section</p></div>
  <div><p class="text-xs text-muted">Texte courant · font-sans</p><p class="max-w-prose">Le texte courant se lit sans effort, avec des phrases courtes et des libellés qui disent ce qui va se passer.</p></div>
  <div><p class="text-xs text-muted">Métadonnées</p><p class="text-sm text-muted">il y a 12 min · 4 dépôts</p></div>
  <div><p class="text-xs text-muted">Références et chiffres · font-mono</p><p class="font-mono tabular-nums">S-1042 · 128,40 € · 14:20</p></div>
</div>
<p class="mt-6 font-mono text-xs text-muted">${tokenEntries.filter((t) => t.name.startsWith('--font-')).map((t) => `${t.name} : ${t.value}`).join('<br>')}</p>`,
  },
  shapes: {
    title: 'Formes, densité et relief',
    body: `<h1 class="font-display text-xl font-semibold">Formes, densité et relief</h1>
<div class="mt-4 flex flex-wrap items-end gap-6">
  <div><div class="flex h-control w-40 items-center justify-center rounded-control border border-line-strong bg-surface text-sm">h-control · rounded-control</div></div>
  <div><div class="flex h-24 w-48 items-center justify-center rounded-card border border-line bg-surface text-sm shadow-card">rounded-card · shadow-card</div></div>
  <div><div class="flex h-24 w-48 items-center justify-center rounded-card bg-surface text-sm shadow-overlay">shadow-overlay</div></div>
  <div class="w-64"><div class="flex h-row items-center border-y border-line bg-surface px-3 text-sm">Ligne · h-row</div></div>
</div>
<p class="mt-6 font-mono text-xs text-muted">${tokenEntries.filter((t) => /^--(radius|spacing|shadow)-/.test(t.name)).map((t) => `${t.name} : ${t.value}`).join('<br>')}</p>`,
  },
};

// ---------- Composants du catalogue ----------
const catalogue = [...read(join(skillDir, 'templates', 'design-system.html')).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)].map((m) => ({
  title: m[1].match(/data-card="([^"]+)"/)?.[1],
  group: m[1].match(/data-group="([^"]+)"/)?.[1] ?? 'Composants',
  slug: m[1].match(/data-slug="([^"]+)"/)?.[1],
  body: m[2].trim(),
}));

// ---------- Composants propres au projet ----------
const sharedDir = join(root, 'sources', 'shared');
const sharedTemplates = existsSync(sharedDir)
  ? readdirSync(sharedDir).filter((f) => f.endsWith('.html')).flatMap((f) => [...read(join(sharedDir, f)).matchAll(/(?:<!--((?:(?!-->)[\s\S])*)-->\s*)?<template id="([^"]+)">[\s\S]*?<\/template>/g)].map((m) => ({ id: m[2], comment: (m[1] ?? '').trim(), html: m[0] })))
  : [];
const allTemplatesHtml = sharedTemplates.map((t) => t.html).join('\n');
const patternFrame = (t) => {
  const name = t.id.replace(/^tpl-/, '');
  const mobile = /mobile/.test(name);
  const [w, h] = mobile ? [390, 844] : /shell/.test(name) ? [1280, 820] : [1100, 160];
  return `<p class="mb-2 text-sm font-medium">${name}</p>${t.comment ? `<p class="mb-3 text-xs text-muted">${t.comment}</p>` : ''}
<div class="relative overflow-hidden rounded-card border border-line bg-canvas" style="width:${w}px;height:${h}px" data-use="${name}"></div>`;
};

// ---------- Écriture ----------
for (const sub of ['foundations', 'components', 'patterns']) rmSync(join(outDir, sub), { recursive: true, force: true });
const written = [];
const write = (path, content) => {
  mkdirSync(dirname(join(outDir, path)), { recursive: true });
  writeFileSync(join(outDir, path), content);
  written.push(path);
};
write('tokens.css', tokensCss);
for (const [slug, f] of Object.entries(foundations)) write(`foundations/${slug}.html`, previewPage({ group: 'Fondations', title: f.title, body: f.body }));
for (const c of catalogue) write(`components/${c.slug}.html`, previewPage({ group: c.group, title: c.title, body: `<h1 class="mb-4 font-display text-lg font-semibold">${c.title}</h1>\n${c.body}` }));
for (const t of sharedTemplates) write(`patterns/${t.id.replace(/^tpl-/, '')}.html`, previewPage({ group: 'Composants du produit', title: t.id.replace(/^tpl-/, ''), body: patternFrame(t), templates: allTemplatesHtml }));

const readme = `# ${product} · Design System

Généré par le skill specs-ui (scripts/export-design-system.mjs) à partir de \`specs-ui/tokens.css\` et des composants partagés des specs. Les specs restent la référence fonctionnelle ; ce Design System en est l'identité visuelle et les composants.

## Thème

${themeComment || 'Voir tokens.css.'}

## Tokens (Tailwind v4)

Les classes s'écrivent avec les noms sémantiques : \`bg-primary\`, \`text-muted\`, \`border-line\`, \`rounded-card\`, \`h-control\`…

| Token | Valeur | Rôle |
|---|---|---|
${tokenEntries.map((t) => `| \`${t.name}\` | \`${t.value}\` | ${t.note} |`).join('\n')}

## Règles d'usage

- Couleurs : uniquement les tokens ; la couleur principale signale l'action et la sélection, les couleurs d'état ne décorent jamais.
- Un état porte toujours un libellé (et si possible une pastille ou une icône) : la couleur seule ne suffit pas.
- Une seule action principale par écran ; un libellé de bouton est un verbe qui dit ce qui va se passer.
- Hiérarchie : titre de page, titre de section, texte courant, métadonnées ; références et chiffres en police mono.
- Cartes réservées aux objets manipulables ; sinon espace, intertitres et séparateurs.
- Contrastes WCAG AA vérifiés pour toutes les paires texte / fond.

## Contenu

- Fondations : ${Object.values(foundations).map((f) => f.title).join(', ')}.
- Composants : ${catalogue.map((c) => c.title).join(', ')}.
- Composants du produit : ${sharedTemplates.map((t) => t.id.replace(/^tpl-/, '')).join(', ') || 'aucun'}.
`;
write('README.md', readme);

console.log(`Design System ready: ${outDir} (${written.length} files: ${Object.keys(foundations).length} foundations, ${catalogue.length} components, ${sharedTemplates.length} product patterns).`);
console.log('Next: the person runs the /design-sync skill and points it to this folder (create or choose a design-system project). Re-run this export after any identity or shared-component change, then sync again.');

#!/usr/bin/env node
/**
 * Construit le paquet « tokens seuls » du produit pour Claude Design (skill /design-sync).
 * Modèle fourni par le skill specs-ui (templates/design-sync/build.mjs), copié par design-sync-package.mjs.
 *
 * Source de vérité : le projet de specs indiqué par package.json → specsUi (par défaut ../specs-ui) :
 * tokens.css (bloc @theme), maquettes (sources/), catalogue exporté (design-system/), polices du premier lot.
 * Sortie :
 *   styles.css      tokens en variables CSS + classes utilitaires Tailwind compilées (celles des maquettes,
 *                   plus tout le vocabulaire des tokens et la mise en page courante), polices du projet
 *   dist/index.js   les tokens en objet JS (aucun composant : design system « tokens seuls »)
 *   dist/index.d.ts leur type
 *
 *   cards/          fiches de specs-ui (design-system/ : fondations, composants, motifs) rebranchées sur
 *                   styles.css : ce sont les cartes visibles dans le panneau Design System
 *
 * Usage : node build.mjs                 (ou npm run build)
 *         node build.mjs --into ds-bundle   copie seulement cards/ dans le bundle, après package-build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, cpSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const specsDir = resolve(here, pkg.specsUi ?? '../specs-ui');
const specsRel = relative(here, specsDir).split('\\').join('/');
const site = existsSync(join(specsDir, 'sources', 'site.json')) ? JSON.parse(readFileSync(join(specsDir, 'sources', 'site.json'), 'utf8')) : {};
const firstLot = (site.lots ?? []).find((l) => existsSync(join(specsDir, 'sources', l, 'lot.json')));
const fontsUrl = firstLot ? JSON.parse(readFileSync(join(specsDir, 'sources', firstLot, 'lot.json'), 'utf8')).fonts : null;
const cardsSource = join(specsDir, 'design-system');
const cardDirs = ['foundations', 'components', 'patterns'];

// Copie des cartes dans le bundle (le convertisseur vide ds-bundle/ à chaque passage)
const intoIndex = process.argv.indexOf('--into');
if (intoIndex > 0) {
  const target = join(process.cwd(), process.argv[intoIndex + 1]);
  cpSync(join(here, 'cards'), join(target, 'cards'), { recursive: true });
  console.log(`cards/ copied into ${process.argv[intoIndex + 1]}`);
  process.exit(0);
}
const tokensCss = readFileSync(join(specsDir, 'tokens.css'), 'utf8');
const theme = tokensCss.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0];
if (!theme) {
  console.error(`@theme block not found in ${join(specsDir, 'tokens.css')}`);
  process.exit(1);
}

// Tokens -> objet JS
const tokens = { color: {}, font: {}, radius: {}, spacing: {}, shadow: {} };
for (const [, group, name, value] of theme.matchAll(/--(color|font|radius|spacing|shadow)-([\w-]+)\s*:\s*([^;]+);/g)) {
  tokens[group][name] = value.trim();
}
const colorNames = Object.keys(tokens.color);

// Vocabulaire garanti même s'il n'apparaît pas dans les maquettes
const colorList = colorNames.join(',');
const inline = [
  `{hover:,focus-visible:,}{bg,text,border,ring,outline,fill,stroke,divide,from,to,accent,caret}-{${colorList}}`,
  `{h,min-h,size}-{control,row}`,
  `rounded{,-t,-b,-l,-r}-{control,card}`,
  `shadow-{card,overlay}`,
  `font-{sans,display,mono}`,
  // Mise en page courante, pour ne pas dépendre des seules classes des maquettes
  `{sm:,md:,lg:,xl:,}grid-cols-{1..12}`,
  `{sm:,md:,lg:,xl:,}col-span-{1..12}`,
  `{sm:,md:,lg:,xl:,}{flex,grid,hidden,block,inline-flex}`,
  `{sm:,md:,lg:,}{gap,gap-x,gap-y,space-y,space-x}-{0..12}`,
  `{sm:,md:,lg:,}{p,px,py,pt,pb,pl,pr,m,mx,my,mt,mb,ml,mr}-{0..12}`,
  `{sm:,md:,lg:,}text-{xs,sm,base,lg,xl,2xl,3xl,4xl}`,
  `font-{normal,medium,semibold,bold}`,
  `{w,h,size}-{0..12}`,
];

const input = `@import "tailwindcss" source(none);
@source "${specsRel}/sources/**/*.html";
@source "${specsRel}/design-system/**/*.html";
${inline.map((p) => `@source inline("${p}");`).join('\n')}

${theme.replace(/@theme\s*\{/, '@theme static {')}

@layer base {
  html, body { background: var(--color-canvas); color: var(--color-ink); font-family: var(--font-sans); font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
}
`;
const tmpInput = join(here, '.input.css');
writeFileSync(tmpInput, input);
const compiled = join(here, '.compiled.css');
execFileSync(join(here, 'node_modules', '.bin', 'tailwindcss'), ['-i', tmpInput, '-o', compiled], { cwd: here, stdio: ['ignore', 'ignore', 'inherit'] });
const css = readFileSync(compiled, 'utf8');
rmSync(tmpInput);
rmSync(compiled);

// Les @import doivent précéder toute règle : la police passe en tête
const fonts = fontsUrl ? `@import url("${fontsUrl}");\n` : '';
const header = `/*
 * ${site.title ?? 'Produit'} · tokens et classes utilitaires
 * Généré par build.mjs depuis ${specsRel}/tokens.css : ne pas modifier à la main.
 */`;
writeFileSync(join(here, 'styles.css'), `${fonts}${header}\n${css}`);

// Cartes : Tailwind navigateur et bloc @theme remplacés par un lien vers styles.css
rmSync(join(here, 'cards'), { recursive: true, force: true });
let cardCount = 0;
for (const dir of cardDirs) {
  if (!existsSync(join(cardsSource, dir))) continue;
  mkdirSync(join(here, 'cards', dir), { recursive: true });
  for (const f of readdirSync(join(cardsSource, dir)).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(join(cardsSource, dir, f), 'utf8')
      .replace(/<script src="[^"]*@tailwindcss\/browser[^"]*"><\/script>\n?/, '')
      .replace(/<style type="text\/tailwindcss">[\s\S]*?<\/style>/, '<link rel="stylesheet" href="../../styles.css">\n<style>html body { margin: 0; padding: 24px; }</style>');
    writeFileSync(join(here, 'cards', dir, f), html);
    cardCount++;
  }
}

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'index.js'), `// Généré par build.mjs : tokens du produit (aucun composant)\nexport const tokens = ${JSON.stringify(tokens, null, 2)};\n`);
const dts = (obj) => `{ ${Object.keys(obj).map((k) => `${JSON.stringify(k)}: string;`).join(' ')} }`;
writeFileSync(
  join(here, 'dist', 'index.d.ts'),
  `export declare const tokens: {\n${Object.entries(tokens).map(([g, o]) => `  ${g}: ${dts(o)};`).join('\n')}\n};\n`,
);
console.log(`styles.css: ${Math.round(css.length / 1024)} KB, ${colorNames.length} colors, ${(css.match(/^\s*\.[^{]+\{/gm) ?? []).length} rules; ${cardCount} cards`);

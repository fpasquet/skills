#!/usr/bin/env node
/**
 * Assemble le cahier des charges à partir de ses sources.
 *
 * Usage : node build.mjs cdc
 *
 * Lit cdc/sources/*.md dans l'ordre de leur préfixe numérique (00-, 10-, 20-…), remplace chaque
 * <!-- include: generated/lot-sessions.md --> par le fichier indiqué (chemin relatif à cdc/sources/),
 * génère la table des matières à l'emplacement <!-- toc --> (titres de niveau 2 et 3) et écrit
 * cdc/<output> (cdc.json → output, par défaut cahier-des-charges.md). Les titres inclus sont décalés pour rester sous le titre qui les inclut :
 * <!-- include: generated/lot-sessions.md shift=0 --> pour ne pas décaler.
 * Ne pas lire le fichier produit : travailler dans les sources, puis lancer check.mjs.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { render, inline } from './render.mjs';

const root = process.argv[2] && resolve(process.argv[2]);
if (!root || !existsSync(join(root, 'sources'))) {
  console.error('Usage: node build.mjs cdc   (the folder must contain sources/)');
  process.exit(2);
}
const sourcesDir = join(root, 'sources');
const config = existsSync(join(root, 'cdc.json')) ? JSON.parse(readFileSync(join(root, 'cdc.json'), 'utf8')) : {};
const files = readdirSync(sourcesDir).filter((f) => /^\d+-.*\.md$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
const missing = [];

// Ancres de titres façon GitHub : minuscules, sans ponctuation, espaces → tirets
export const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

function include(text, depth = 0) {
  return text.replace(/<!--\s*include:\s*([^\s>]+)(?:\s+shift=(\d+))?\s*-->/g, (_, path, shiftArg) => {
    const file = join(sourcesDir, path);
    if (!existsSync(file) || depth > 3) {
      missing.push(path);
      return `> **Fichier manquant** : \`${path}\``;
    }
    let content = include(readFileSync(file, 'utf8').replace(/^<!--[\s\S]*?-->\s*/, ''), depth + 1);
    const shift = shiftArg === undefined ? 0 : Number(shiftArg);
    if (shift) content = content.replace(/^(#{1,5}) /gm, (m, hashes) => `${'#'.repeat(Math.min(hashes.length + shift, 6))} `);
    return content.trim();
  });
}

let doc = files.map((f) => include(readFileSync(join(sourcesDir, f), 'utf8')).trim()).join('\n\n');

// Titres de niveau 2 et 3 (hors blocs de code) : ancre explicite <a id> devant le texte, quel que soit le
// moteur de rendu Markdown, puis table des matières vers ces ancres
const headings = [];
doc = doc
  .split(/(```[\s\S]*?```)/g)
  .map((part) =>
    part.startsWith('```')
      ? part
      : part.replace(/^(#{2,3}) (?!<a id=)(.+)$/gm, (_, hashes, text) => {
          const id = slug(text);
          headings.push({ level: hashes.length, text: text.trim(), id });
          return `${hashes} <a id="${id}"></a>${text}`;
        }),
  )
  .join('');
const toc = headings.map((h) => `${h.level === 3 ? '  ' : ''}- [${h.text.replace(/<[^>]+>/g, '')}](#${h.id})`).join('\n');
const docWithoutToc = doc.replace(/<!--\s*toc\s*-->/, '');
doc = doc.replace(/<!--\s*toc\s*-->/, `**Sommaire**\n\n${toc}`);

// Nom du fichier produit : il devient le titre de l'artifact Markdown (cdc.json → output)
const target = join(root, config.output ?? 'cahier-des-charges.md');
const before = existsSync(target) ? readFileSync(target, 'utf8') : '';
const output = `${doc.trim()}\n`;
writeFileSync(target, output);
console.log(`Built ${target}: ${Math.round(output.length / 1024)} Ko, ${files.length} source file(s), ${headings.length} heading(s) in the table of contents${before === output ? ', no change' : ''}.`);
if (missing.length) console.log(`WARNING: missing included files: ${[...new Set(missing)].join(', ')}`);

// ---------- Page HTML (lecture dans l'artifact) ----------
// Même contenu que le Markdown, converti au build : sommaire latéral, pastilles d'identifiants, diagrammes,
// copie du Markdown (complet ou par partie). Deux fichiers : <nom>.html (document complet, ouvrable en
// local, diagrammes rendus par mermaid) et publish/<nom>.html (sans enveloppe, pour l'outil Artifact, qui
// rend les diagrammes lui-même).
const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(join(skillDir, 'templates', 'page.html'), 'utf8');
const product = (config.title ?? 'Produit').split('·')[0].trim();
const parts = docWithoutToc.split(/^(?=## )/m);
const intro = parts.shift();
let partIndex = 0;
const content = [
  render(intro),
  `<p class="legend"><span><strong class="id id-rf">RF</strong> règle fonctionnelle</span><span><strong class="id id-ca">CA</strong> critère d'acceptation</span><span><strong class="id id-nf">NF</strong> exigence non fonctionnelle</span><span><strong class="id id-dt">DT</strong> décision technique</span><span><strong class="id id-rq">RQ</strong> risque</span></p>`,
  ...parts.map((part) => {
    const html = render(part).replace(/^(<h2[^>]*>[\s\S]*?<\/h2>)/, `<div class="part-head">$1<button type="button" class="btn btn-small" data-copy-part="${partIndex}">Copier cette partie</button></div>`);
    partIndex++;
    return `<section class="part">${html}</section>`;
  }),
].join('\n');
const nav = [];
for (const h of headings) {
  const label = inline(h.text.replace(/<[^>]+>/g, ''));
  if (h.level === 2) nav.push({ link: `<a href="#${h.id}">${label}</a>`, children: [] });
  else nav[nav.length - 1]?.children.push(`<li><a href="#${h.id}">${label}</a></li>`);
}
const navHtml = nav.map((n) => `<li>${n.link}${n.children.length ? `<ul>${n.children.join('')}</ul>` : ''}</li>`).join('');
const data = JSON.stringify({ markdown: output, parts: parts.map((p) => p.trim() + '\n') }).replace(/</g, '\\u003c');
const page = template
  .replace('{{TITLE}}', () => `Cahier des charges ${product}`)
  .replaceAll('{{PRODUCT}}', () => product)
  .replace('{{INITIAL}}', () => product.charAt(0).toUpperCase())
  .replaceAll('{{NAV}}', () => navHtml)
  .replace('{{CONTENT}}', () => content)
  .replace('{{DATA}}', () => data);
const htmlName = (config.output ?? 'cahier-des-charges.md').replace(/\.md$/, '.html');
mkdirSync(join(root, 'publish'), { recursive: true });
writeFileSync(join(root, 'publish', htmlName), page);
const local = `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${page.replace(/<script type="application\/json"/, '<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>\n<script>mermaid.initialize({ startOnLoad: true, theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral" });</script>\n<script type="application/json"')}\n</html>\n`;
writeFileSync(join(root, htmlName), local);
console.log(`Built ${join(root, htmlName)} (local) and publish/${htmlName} (artifact): ${Math.round(page.length / 1024)} Ko.`);
if (config.artifacts?.cdc) console.log(`Publish: same file, same artifact (${config.artifacts.cdc}).`);

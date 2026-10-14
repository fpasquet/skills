#!/usr/bin/env node
/**
 * Prépare le paquet « tokens seuls » qui permet d'envoyer l'identité des specs vers Claude Design avec le
 * skill /design-sync (option facultative, voir SKILL.md « Option · Design System Claude Design »).
 *
 * Usage : node design-sync-package.mjs specs/ui [--out specs/design-system-package]
 *
 * Crée, à côté du projet de specs (sans écraser un fichier existant) :
 *   package.json                  mini-paquet sans composant (Tailwind CLI, React pour le convertisseur)
 *   build.mjs                     construit styles.css, dist/ et cards/ depuis les specs
 *   .design-sync/config.json      configuration du convertisseur design-sync
 *   .design-sync/conventions.md   brouillon de l'en-tête de conventions, à compléter
 *   .design-sync/NOTES.md         notes de synchronisation
 * Prérequis : avoir lancé export-design-system.mjs (catalogue <specs>/design-system/, source des cartes).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const specsDir = args[0] && !args[0].startsWith('--') && resolve(args[0]);
if (!specsDir || !existsSync(join(specsDir, 'tokens.css'))) {
  console.error('Usage: node design-sync-package.mjs specs/ui [--out specs/design-system-package]   (the specs folder must contain tokens.css)');
  process.exit(2);
}
const outDir = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : join(dirname(specsDir), 'design-system-package'));
const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'design-sync');
const site = existsSync(join(specsDir, 'sources', 'site.json')) ? JSON.parse(readFileSync(join(specsDir, 'sources', 'site.json'), 'utf8')) : {};
const product = site.title ?? 'Produit';
const slug = product.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pkgName = `${slug}-tokens`;
const globalName = slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('') + 'Tokens';
const specsRel = relative(outDir, specsDir).split('\\').join('/');

// Vocabulaire des tokens, groupé, pour le brouillon de conventions
const theme = readFileSync(join(specsDir, 'tokens.css'), 'utf8').match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
const names = (group) => [...theme.matchAll(new RegExp(`--${group}-([\\w-]+)\\s*:`, 'g'))].map((m) => m[1]);
const tokenList = [
  ['Colors', names('color').map((n) => `\`${n}\``).join(', ')],
  ['Fonts', names('font').map((n) => `\`font-${n}\``).join(', ')],
  ['Radius', names('radius').map((n) => `\`rounded-${n}\``).join(', ')],
  ['Sizes', names('spacing').map((n) => `\`h-${n}\``).join(', ')],
  ['Shadows', names('shadow').map((n) => `\`shadow-${n}\``).join(', ')],
].filter(([, v]) => v).map(([k, v]) => `- **${k}**: ${v}${k === 'Colors' ? ' (as `bg-*`, `text-*`, `border-*`)' : ''}.`).join('\n');
const fill = (text) => text.replaceAll('{{PRODUCT}}', product).replaceAll('{{PKG}}', pkgName).replaceAll('{{SPECS_REL}}', specsRel).replaceAll('{{TOKENS}}', tokenList);

const written = [];
const writeIfMissing = (path, content) => {
  const target = join(outDir, path);
  if (existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  written.push(path);
};
writeIfMissing('package.json', JSON.stringify({
  name: pkgName,
  version: '1.0.0',
  private: true,
  description: `${product} identity: design tokens and utility classes (tokens-only design system)`,
  type: 'module',
  main: 'dist/index.js',
  types: 'dist/index.d.ts',
  specsUi: specsRel,
  scripts: { build: 'node build.mjs' },
  devDependencies: { '@tailwindcss/cli': '4.1.13', tailwindcss: '4.1.13', react: '18.3.1', 'react-dom': '18.3.1' },
}, null, 2) + '\n');
if (!existsSync(join(outDir, 'build.mjs'))) {
  copyFileSync(join(templates, 'build.mjs'), join(outDir, 'build.mjs'));
  written.push('build.mjs');
}
writeIfMissing('.design-sync/config.json', JSON.stringify({ pkg: pkgName, globalName, shape: 'package', buildCmd: 'npm run build', cssEntry: 'styles.css', readmeHeader: '.design-sync/conventions.md' }, null, 2) + '\n');
writeIfMissing('.design-sync/conventions.md', fill(readFileSync(join(templates, 'conventions.md'), 'utf8')));
writeIfMissing('.design-sync/NOTES.md', fill(readFileSync(join(templates, 'notes.md'), 'utf8')));
writeIfMissing('.gitignore', '.ds-sync/\nds-bundle/\n.design-sync/.cache/\n.design-sync/learnings/\n.design-sync/node_modules\nnode_modules/\n');

console.log(written.length ? `Wrote in ${outDir}: ${written.join(', ')}` : `${outDir} already set up, nothing written.`);
if (!existsSync(join(specsDir, 'design-system'))) console.log('WARNING: run export-design-system.mjs first (the cards come from <specs>/design-system/).');
console.log('Next: complete .design-sync/conventions.md from CONTEXTE.md, then `npm install && npm run build`, then the person runs /design-sync from this folder.');

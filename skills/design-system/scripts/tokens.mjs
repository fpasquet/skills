#!/usr/bin/env node
/**
 * Copie dans l'application les tokens des specs (skill specs-ui), avec leur provenance, et dit si la copie est à jour.
 * Les specs vivent dans un dépôt de specs, à part : l'application ne peut pas importer leur fichier, elle en garde une
 * copie qu'on ne modifie jamais à la main. Une couleur, une police ou un rayon se change dans les specs, puis ce script
 * recopie le fichier.
 *
 * Usage : node tokens.mjs <app-dir> --from <projet>/ui [--check] [--strict] [--force] [--dry-run] [--styles <dir>]
 *   --from     dossier des specs (celui de tokens.css) ou fichier de tokens, depuis le dossier courant
 *   --check    n'écrit rien : copie à jour, en retard sur les specs ou modifiée à la main (sans --from, seulement ce
 *              dernier point, ce qui suffit en CI)
 *   --strict   avec --check : code de sortie 1 si la copie n'est pas à jour
 *   --force    remplace un fichier de tokens qui n'est pas une copie des specs, ou une copie modifiée à la main
 *
 * La copie remplace le fichier de tokens que la feuille d'entrée importe, sinon <styles>/tokens.css. Les tokens
 * ajoutés et retirés sont listés : un token retiré casse les classes qui l'utilisent (audit.mjs les trouve), un token
 * de couleur ajouté demande sa valeur sombre dans le bloc .dark de theme.css si l'application a un mode sombre.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  detectProject,
  isDir,
  isSpecsTokens,
  parseArgs,
  parseTokensCopy,
  read,
  rel,
  specsTokensFile,
  tokenNames,
  tokensCopy,
  tokensHash,
} from './project.mjs';

const { options, positional } = parseArgs(process.argv.slice(2), ['check', 'strict', 'force', 'dry-run']);
if (!positional[0] || !isDir(positional[0]) || (!options.check && !options.from)) {
  console.error('Usage: node tokens.mjs <app-dir> --from <projet>/ui [--dry-run] [--force] | <app-dir> --check [--from <projet>/ui] [--strict]');
  process.exit(2);
}
const project = detectProject(positional[0], { styles: options.styles });
const source = options.from ? specsTokensFile(options.from) : null;
if (source && !existsSync(source)) {
  console.error(`Specs tokens not found: ${source} (--from takes the specs folder, <projet>/ui, or its tokens.css).`);
  process.exit(2);
}

// Copie : le fichier de tokens de l'application, jamais celui d'un projet de specs (ancienne disposition)
const inRepo = (file) => file && resolve(file).startsWith(project.repo + sep);
const target = project.tokens && inRepo(project.tokens) && !isSpecsTokens(project.tokens) && !project.tokensInTheme ? project.tokens : join(project.styles, 'tokens.css');
if (source && resolve(source) === resolve(target)) {
  console.error(`${rel(project, target)} is the specs file itself: pass the application folder as <app-dir>.`);
  process.exit(2);
}
const notes = [];
if (project.tokens && isSpecsTokens(project.tokens)) {
  notes.push(
    `The entry stylesheet imports the specs file directly (${relative(process.cwd(), project.tokens)}, old layout with specs/ in the application): once the specs live in the specs repository, import ${rel(project, target)} instead.`,
  );
}
if (project.tokensInTheme) notes.push(`${rel(project, project.theme)} holds the tokens: split them first (SKILL.md, step 2), the copy goes to ${rel(project, target)}.`);

const current = read(target);
const copy = parseTokensCopy(current);
const sourceText = source ? read(source) : '';
const shown = rel(project, target);

// ---------- Contrôle ----------
if (options.check) {
  let state;
  if (!existsSync(target)) state = `${shown} does not exist: copy the specs tokens with --from.`;
  else if (!copy) state = `${shown} is not a copy of the specs tokens (no provenance header).`;
  else if (copy.edited) state = `${shown} was edited by hand since the copy from ${copy.source}: report the change in the specs, then copy again.`;
  else if (source && tokensHash(sourceText) !== copy.hash) state = `${shown} is behind the specs (${copy.source}): copy again with --from.`;
  const ok = !state;
  console.log(ok ? `${shown} is up to date${source ? ' with the specs' : ' (not edited since the copy)'} · ${copy.source}.` : `WARNING: ${state}`);
  for (const note of notes) console.log(`NOTE: ${note}`);
  process.exit(options.strict && !ok ? 1 : 0);
}

// ---------- Copie ----------
if (copy && !copy.edited && tokensHash(sourceText) === copy.hash) {
  console.log(`${shown} is already up to date with ${copy.source}, nothing written.`);
  for (const note of notes) console.log(`NOTE: ${note}`);
  process.exit(0);
}
if (existsSync(target) && !copy && tokensHash(current) !== tokensHash(sourceText) && !options.force) {
  console.error(
    `${shown} is not a copy of the specs tokens and differs from them: compare first (the application may have tokens the specs lack), then pass --force to replace it.`,
  );
  process.exit(1);
}
if (copy?.edited && !options.force) {
  console.error(`${shown} was edited by hand since the last copy: report the change in the specs first, or pass --force to drop it.`);
  process.exit(1);
}
const before = tokenNames(copy ? copy.body : current);
const after = tokenNames(sourceText);
const added = [...after].filter((name) => !before.has(name));
const removed = [...before].filter((name) => !after.has(name));
if (!options['dry-run']) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, tokensCopy(source));
}
console.log(`${options['dry-run'] ? 'Would copy' : 'Copied'} ${relative(process.cwd(), source)} to ${shown}.`);
if (added.length && current) console.log(`Tokens added (${added.length}): ${added.join(', ')}`);
if (removed.length) console.log(`Tokens removed (${removed.length}): ${removed.join(', ')}. Classes that use them break: run audit.mjs.`);
const darkMode = /\.dark\s*\{/.test(read(project.theme ?? join(project.styles, 'theme.css')));
const newColors = added.filter((name) => name.startsWith('--color-'));
if (darkMode && newColors.length && current) console.log(`Dark mode: give ${newColors.join(', ')} a value in the .dark block of theme.css.`);
const entry = project.entry;
if (entry && !new RegExp(`@import\\s+['"][^'"]*${target.split(sep).at(-1).replace('.', '\\.')}['"]`).test(read(entry))) {
  notes.push(`${rel(project, entry)} does not import ${shown} yet: scaffold.mjs adds it, or add the @import after Tailwind.`);
}
for (const note of notes) console.log(`NOTE: ${note}`);
console.log('Commit the copy in the application. Never edit it there: change the specs, then run this script again.');

#!/usr/bin/env node
/**
 * Réécrit les classes de shadcn d'une application avec les tokens du design system : bg-card → bg-surface,
 * text-muted-foreground → text-muted, shadow-xs → shadow-card… d'après la correspondance de theme.css. Pour le code
 * écrit avant les tokens, ou ajouté depuis par la CLI de shadcn. La réécriture peut être relancée sans dommage.
 *
 * Usage : node retoken.mjs <app-dir> [--dry-run] [--src …]
 *   Touche les chaînes des fichiers .tsx, .jsx, .ts, .js (classes du JSX, cn(), cva()) et les @apply des feuilles CSS.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { detectProject, isDir, parseArgs, rel, shadcnTokenizer, walk } from './project.mjs';

const { options, positional } = parseArgs(process.argv.slice(2), ['dry-run']);
if (!positional[0] || !isDir(positional[0])) {
  console.error('Usage: node retoken.mjs <app-dir> [--dry-run]');
  process.exit(2);
}
const project = detectProject(positional[0], options);
if (!project.theme || !project.tokens) {
  console.error('No theme.css or tokens found: run scaffold.mjs first (or pass --tokens).');
  process.exit(1);
}
const { toTokens, count } = shadcnTokenizer(project);
// Une liste de classes : mots séparés par des espaces, chacun ayant l'allure d'un utilitaire
const rewriteList = (list) => list.replace(/[^\s'"`]+/g, (token) => (/^[!\w:/.[\]-]+$/.test(token) ? toTokens(token) : token));

const changed = [];
for (const file of walk(project.src, ['.tsx', '.jsx', '.ts', '.js', '.css'])) {
  if (file.endsWith('.d.ts')) continue;
  const before = count();
  const code = readFileSync(file, 'utf8');
  const next = file.endsWith('.css')
    ? code.replace(/(@apply\s+)([^;]+);/g, (_, at, list) => `${at}${rewriteList(list)};`)
    : // Contenu des chaînes ; dans un gabarit, seulement hors des ${…}
      code.replace(/(["'])((?:(?!\1)[^\\\n]|\\.)*)\1|`([^`]*)`/g, (match, quote, single, template) =>
        template === undefined
          ? `${quote}${rewriteList(single)}${quote}`
          : `\`${template.replace(/(^|\})([^$}]*)(?=\$\{|$)/g, (m, brace, text) => `${brace}${rewriteList(text)}`)}\``,
      );
  if (next !== code) {
    changed.push([rel(project, file), count() - before]);
    if (!options['dry-run']) writeFileSync(file, next);
  }
}
console.log(`${options['dry-run'] ? 'Would rewrite' : 'Rewrote'} ${count()} classes in ${changed.length} files:`);
for (const [file, n] of changed) console.log(`  ${file}  ${n}`);
console.log('\nThen run the formatter, the linter (class order) and the tests that check class names.');

#!/usr/bin/env node
/**
 * Applique les espaces insécables de la typographie française au texte d'une page de specs.
 *
 * Usage : node typography.mjs <file.html> [--check]
 *         (build.mjs l'applique automatiquement aux documents construits depuis les sources)
 *
 * Avant « : » et à l'intérieur des guillemets « … » : espace insécable (U+00A0).
 * Avant « ; ! ? » : espace fine insécable (U+202F).
 * Les espaces déjà présentes sont normalisées (une U+00A0 avant « ; » devient U+202F, etc.).
 * Ne touche que le texte entre les balises : ni les attributs (classes Tailwind), ni <script>, <style>,
 * <code>, <kbd>, <pre>. Les heures (14:32) et les URL ne sont pas concernées (pas d'espace avant).
 * Avec --check, compte seulement les corrections à faire (code de sortie 1 s'il y en a).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const NBSP = ' ';
const NARROW_NBSP = ' ';

/** Renvoie { html, fixes } avec la typographie française appliquée au texte. */
export function applyTypography(source) {
  let fixes = 0;
  const replace = (text, pattern, wanted) =>
    text.replace(pattern, (match, ...groups) => {
      const next = wanted(...groups);
      if (next !== match) fixes++;
      return next;
    });
  const fixText = (text) => {
    let t = replace(text, /[   ]:(?=\s|$)/g, () => `${NBSP}:`);
    t = replace(t, /[   ]([;!?])/g, (mark) => `${NARROW_NBSP}${mark}`);
    t = replace(t, /«[   ]/g, () => `«${NBSP}`);
    return replace(t, /[   ]»/g, () => `${NBSP}»`);
  };
  // Découpe en balises / texte ; suit les éléments à ignorer
  const skipped = [];
  const html = source
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        const opening = part.match(/^<(script|style|code|kbd|pre)\b/i);
        const closing = part.match(/^<\/(script|style|code|kbd|pre)\b/i);
        if (opening && !part.endsWith('/>')) skipped.push(opening[1].toLowerCase());
        if (closing && skipped.at(-1) === closing[1].toLowerCase()) skipped.pop();
        return part;
      }
      return skipped.length ? part : fixText(part);
    })
    .join('');
  return { html, fixes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, flag] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: node typography.mjs <file.html> [--check]');
    process.exit(2);
  }
  const { html, fixes } = applyTypography(readFileSync(file, 'utf8'));
  if (flag === '--check') {
    console.log(fixes ? `${fixes} non-breaking space(s) to add or fix.` : 'French typography: nothing to fix.');
    process.exit(fixes ? 1 : 0);
  }
  writeFileSync(file, html);
  console.log(`${fixes} non-breaking space(s) added or fixed in ${file}.`);
}

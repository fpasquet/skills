#!/usr/bin/env node
/**
 * Vérifie les contrastes WCAG des tokens d'identité visuelle.
 *
 * Usage : node check-contrast.mjs <file.css|file.html> [...]
 *
 * Lit les tokens --color-<nom> (bloc @theme de tokens.css ou des specs) et --t-<nom>
 * (blocs [data-product-theme] de propositions.html), groupés par bloc CSS. Seules les valeurs
 * hexadécimales sont contrôlées. Code de sortie 1 si une paire obligatoire échoue.
 */
import { readFileSync } from 'node:fs';

// [texte, fond, ratio minimal, obligatoire ?]
const PAIRS = [
  ['ink', 'canvas', 4.5, true],
  ['ink', 'surface', 4.5, true],
  ['ink', 'surface-alt', 4.5, true],
  ['muted', 'surface', 4.5, true],
  ['muted', 'canvas', 4.5, true],
  ['muted', 'surface-alt', 4.5, true],
  ['on-primary', 'primary', 4.5, true],
  ['on-primary', 'primary-hover', 4.5, true],
  ['primary', 'surface', 4.5, true],
  ['primary', 'primary-soft', 4.5, true],
  ['success', 'success-soft', 4.5, true],
  ['warning', 'warning-soft', 4.5, true],
  ['danger', 'danger-soft', 4.5, true],
  ['info', 'info-soft', 4.5, true],
  ['on-danger', 'danger', 4.5, true],
  // Couleurs d'état et de marque posées directement sur les fonds (« Haute », « 1 test en échec », liens)
  ['primary', 'canvas', 4.5, true],
  ['success', 'surface', 4.5, true],
  ['warning', 'surface', 4.5, true],
  ['danger', 'surface', 4.5, true],
  ['info', 'surface', 4.5, true],
  ['ink', 'primary-soft', 4.5, true],
  ['muted', 'primary-soft', 4.5, true],
  ['success', 'canvas', 4.5, true],
  ['warning', 'canvas', 4.5, true],
  ['danger', 'canvas', 4.5, true],
  ['nav-ink', 'nav', 4.5, true],
  ['nav-muted', 'nav', 4.5, true],
  ['nav-ink', 'nav-active', 4.5, true],
  // WCAG 1.4.11 : bordure qui délimite un champ. Souvent assoupli dans les outils internes.
  ['line-strong', 'surface', 3, false],
];

function hexToRgb(hex) {
  let h = hex.replace('#', '').toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance([r, g, b]) {
  const channels = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function extractGroups(source) {
  const groups = [];
  const block = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = block.exec(source))) {
    const selector = m[1].trim().split('\n').pop().trim() || '(block)';
    const tokens = {};
    for (const [, name, value] of m[2].matchAll(/--(?:color|t)-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) tokens[name] = value;
    if (tokens.ink && (tokens.surface || tokens.canvas)) groups.push({ selector, tokens });
  }
  return groups;
}

let failures = 0;
const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node check-contrast.mjs <file.css|file.html> [...]');
  process.exit(2);
}
for (const file of files) {
  const groups = extractGroups(readFileSync(file, 'utf8'));
  if (!groups.length) console.log(`\n${file}: no token group found (--color-ink / --t-ink in hexadecimal).`);
  for (const { selector, tokens } of groups) {
    console.log(`\n${file} · ${selector}`);
    for (const [text, background, min, required] of PAIRS) {
      const fg = tokens[text];
      const bg = tokens[background];
      if (!fg || !bg) continue;
      const a = hexToRgb(fg);
      const b = hexToRgb(bg);
      if (!a || !b) continue;
      const r = ratio(a, b);
      const ok = r >= min;
      if (!ok && required) failures++;
      const status = ok ? 'ok    ' : required ? 'FAIL  ' : 'advice';
      console.log(`  ${status}  ${r.toFixed(2).padStart(5)} (min ${min})  ${text} on ${background}  ${fg} / ${bg}`);
    }
  }
}
console.log(failures ? `\n${failures} required pair(s) below the WCAG AA threshold.` : '\nAll required contrasts pass WCAG AA.');
process.exit(failures ? 1 : 0);

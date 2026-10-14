#!/usr/bin/env node
/**
 * Met à niveau un document de specs ou de propositions vers la version actuelle des templates,
 * sans toucher aux maquettes.
 *
 * Usage : node upgrade.mjs <file.html>
 *
 * - Renomme les conventions des anciennes versions (attributs et identifiants en français :
 *   data-cadre, data-fond, data-theme-produit, classe cible, tokens doc-nouveau…) vers les noms actuels.
 * - Remplace, à partir du template correspondant (propositions.html si le document contient
 *   data-product-theme, sinon specs.html) : la meta specs-ui-template, l'habillage du document dans
 *   <style type="text/tailwindcss"> (depuis le commentaire « Habillage du document » jusqu'à </style>),
 *   le <script> final, le corps (<body> sans classes, conteneur id="page") et les badges en couleurs brutes.
 * Ne touche pas : le bloc @theme du produit, les maquettes, les textes.
 * Une copie de sauvegarde est écrite à côté du fichier, puis le compte rendu liste chaque opération.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Anciens noms (versions 1.x en français) → noms actuels. Appliqué au balisage et au CSS, pas au texte.
const LEGACY_RENAMES = [
  [/data-cadre-isole\b/g, 'data-frame-isolated'],
  [/data-cadre=/g, 'data-frame='],
  [/\[data-cadre\]/g, '[data-frame]'],
  [/data-coupe=/g, 'data-clipped='],
  [/data-anno-chevauche=/g, 'data-anno-overlap='],
  [/data-chevauche=/g, 'data-overlap='],
  [/data-actif=/g, 'data-active='],
  [/data-sans=/g, 'data-omit='],
  [/data-fond\b/g, 'data-backdrop'],
  [/data-compte=/g, 'data-count='],
  [/data-valeur=/g, 'data-value='],
  [/data-theme-produit/g, 'data-product-theme'],
  [/data-choix=/g, 'data-choice='],
  [/data-slot-titre=/g, 'data-slot-title='],
  [/data-slot="titre"/g, 'data-slot="title"'],
  [/data-slot="contenu"/g, 'data-slot="content"'],
  [/tpl-identite\b/g, 'tpl-identity'],
  [/data-use="identite"/g, 'data-use="identity"'],
  [/tpl-choix-theme\b/g, 'tpl-theme-picker'],
  [/data-use="choix-theme"/g, 'data-use="theme-picker"'],
  [/--doc-nouveau\b/g, '--doc-new'],
  [/--color-doc-nouveau\b/g, '--color-doc-new'],
  [/\bdoc-nouveau\b/g, 'doc-new'],
  [/--doc-modifie\b/g, '--doc-changed'],
  [/--color-doc-modifie\b/g, '--color-doc-changed'],
  [/\bdoc-modifie\b/g, 'doc-changed'],
  [/\.cible\b/g, '.next-step'],
];

/** Renomme les anciennes conventions dans le balisage et le CSS ; renvoie { html, count }. */
export function applyLegacyRenames(source) {
  let count = 0;
  // Le texte entre balises n'est pas touché, sauf dans <style> (sélecteurs, variables)
  const parts = source.split(/(<[^>]+>)/);
  let inStyle = false;
  const html = parts
    .map((part) => {
      const isTag = part.startsWith('<');
      if (isTag && /^<style\b/i.test(part)) inStyle = true;
      if (isTag && /^<\/style>/i.test(part)) inStyle = false;
      if (!isTag && !inStyle) return part;
      let next = part;
      for (const [pattern, replacement] of LEGACY_RENAMES) next = next.replace(pattern, () => (count++, replacement));
      // Classe « cible » dans un attribut class
      if (isTag) next = next.replace(/(class="[^"]*?)\bcible\b/g, (_, before) => (count++, `${before}next-step`));
      return next;
    })
    .join('');
  return { html, count };
}

function upgrade(file) {
  let doc = readFileSync(file, 'utf8');
  const report = [];
  const warnings = [];

  const renamed = applyLegacyRenames(doc);
  doc = renamed.html;
  if (renamed.count) report.push(`${renamed.count} legacy name(s) renamed (attributes, classes, doc-* tokens)`);

  const templateName = /data-product-theme=/.test(doc) ? 'propositions.html' : 'specs.html';
  const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', templateName), 'utf8');

  // Meta de version
  const version = template.match(/<meta name="specs-ui-template" content="([^"]+)">/)[1];
  if (/<meta name="specs-ui-template"[^>]*>/.test(doc)) doc = doc.replace(/<meta name="specs-ui-template"[^>]*>/, `<meta name="specs-ui-template" content="${version}">`);
  else doc = doc.replace(/(<meta name="viewport"[^>]*>)/, `$1\n<meta name="specs-ui-template" content="${version}">`);
  report.push(`version meta: ${version}`);

  // Habillage du document dans le style Tailwind
  const MARKER = /\/\* =+ (?:\d+\. )?Habillage du document[^\n]*\n/;
  const segment = (html) => {
    const m = html.match(MARKER);
    if (!m) return null;
    const end = html.indexOf('</style>', m.index);
    return end > m.index ? { start: m.index, end } : null;
  };
  const docSegment = segment(doc);
  const templateSegment = segment(template);
  if (docSegment && templateSegment) {
    doc = doc.slice(0, docSegment.start) + template.slice(templateSegment.start, templateSegment.end) + doc.slice(docSegment.end);
    report.push('document chrome replaced (doc-* tokens, @layer base, @layer components)');
  } else {
    warnings.push('"Habillage du document" comment not found in <style>: chrome not replaced, copy it from the template by hand');
  }

  // Script final (dernier <script> sans src)
  const lastScript = (html) => [...html.matchAll(/<script>[\s\S]*?<\/script>/g)].at(-1);
  const docScript = lastScript(doc);
  const templateScript = lastScript(template);
  if (docScript && templateScript) {
    doc = doc.slice(0, docScript.index) + templateScript[0] + doc.slice(docScript.index + docScript[0].length);
    report.push('final script replaced');
  } else {
    warnings.push('final script not found: not replaced');
  }

  // Corps et conteneur
  if (/<body\s+class="[^"]*">/.test(doc)) {
    doc = doc.replace(/<body\s+class="[^"]*">/, '<body>');
    report.push('<body> classes removed (the body is styled in CSS)');
  }
  if (!/id="page"/.test(doc)) {
    const before = doc;
    doc = doc.replace(/(<body>\s*<div)(\s+class="mx-auto)/, '$1 id="page"$2');
    if (doc !== before) report.push('id="page" container added');
    else warnings.push('main container not found: add id="page" to the first <div> of <body>');
  }

  // Badges d'écran en couleurs brutes
  let badges = 0;
  doc = doc.replace(/bg-emerald-600\/15([^"]*?)text-emerald-700 dark:text-emerald-300/g, (_, middle) => (badges++, `bg-doc-new/15${middle}text-doc-new`));
  if (badges) report.push(`${badges} "Nouveau" badge(s) moved to doc-new tokens`);
  const leftovers = (doc.replace(/<template[\s\S]*?<\/template>/g, '').match(/\b(?:dark:[\w-]+|(?:bg|text|border)-(?:emerald|amber|red|green|zinc|gray|slate)-\d{2,3})/g) || []).filter((c) => c !== 'ring-zinc-900');
  if (leftovers.length) warnings.push(`raw Tailwind colors or dark: variants left (${[...new Set(leftovers)].slice(0, 8).join(', ')}): check they belong to the document chrome and move them to doc-* tokens`);

  // La sauvegarde va dans le dossier temporaire du système, jamais dans le projet
  const backup = join(tmpdir(), `${basename(file, '.html')}.before-upgrade.${Date.now()}.html`);
  copyFileSync(file, backup);
  writeFileSync(file, doc);
  console.log(`Upgraded ${file} (template ${templateName} ${version}):`);
  report.forEach((r) => console.log(`  - ${r}`));
  warnings.forEach((w) => console.log(`  WARNING: ${w}`));
  console.log(`Backup: ${backup}. Check with capture.mjs --sheet.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node upgrade.mjs <file.html>');
    process.exit(2);
  }
  upgrade(file);
}

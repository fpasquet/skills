/**
 * daisyUI dans les maquettes, quand le produit l'emploie (`sources/site.json` → `"daisyui": "<version>"`).
 *
 * Les pages chargent depuis le CDN les seules feuilles de daisyUI utiles : ses propriétés de base et les composants
 * dont une classe apparaît dans la page. Jamais `daisyui.css` : il contient les thèmes intégrés, rangés dans la couche
 * base, qui l'emportent sur les tokens. Un thème pointé sur les tokens règle les composants, avec la même
 * correspondance que le skill design-system dans l'application (`templates/styles/theme.css`, section daisyUI) : les
 * maquettes rendent ce que l'application rendra.
 *
 * Module partagé par build.mjs et export-design-system.mjs. Une copie vit dans le skill prototype-ui
 * (`scripts/daisyui.mjs`) : les deux se modifient ensemble.
 */

// Feuilles de composants de daisyUI 5 (dossier components/ du paquet) dont la classe racine diffère du nom du fichier
const ROOTS = {
  button: ['btn'],
  calendar: ['cally', 'react-day-picker'],
  fileinput: ['file-input'],
  hover3d: ['hover-3d'],
  hovergallery: ['hover-gallery'],
  label: ['label', 'floating-label'],
  mockup: ['mockup-code', 'mockup-window', 'mockup-browser', 'mockup-phone'],
  radialprogress: ['radial-progress'],
  stat: ['stats', 'stat'],
  steps: ['steps', 'step'],
  tab: ['tabs', 'tab'],
  textrotate: ['text-rotate'],
};
// Les autres feuilles portent le nom de leur classe racine
const SAME_NAME = [
  'alert', 'aura', 'avatar', 'badge', 'breadcrumbs', 'card', 'carousel', 'chat', 'checkbox', 'collapse', 'countdown', 'diff',
  'divider', 'dock', 'drawer', 'dropdown', 'fab', 'fieldset', 'filter', 'footer', 'hero', 'indicator', 'input', 'join', 'kbd',
  'link', 'list', 'loading', 'mask', 'megamenu', 'menu', 'modal', 'navbar', 'otp', 'progress', 'radio', 'range', 'rating',
  'select', 'skeleton', 'stack', 'status', 'swap', 'table', 'textarea', 'timeline', 'toast', 'toggle', 'tooltip', 'validator',
];
const FILES = [...Object.entries(ROOTS), ...SAME_NAME.map((name) => [name, [name]])];
// Propriétés de base (@property des barres circulaires, grain) ; le reste de base/ (fond de page, verrou du
// défilement des fenêtres, barre de défilement) toucherait l'habillage du document, et Tailwind a déjà son reset
const BASE = ['properties', 'svg'];

/** Version de daisyUI déclarée par le projet de specs (`"daisyui": "5.7.50"`), ou null. */
export function daisyuiVersion(site) {
  const version = typeof site?.daisyui === 'string' ? site.daisyui : site?.daisyui?.version;
  if (!version) return null;
  // Version exacte : les artifacts n'acceptent qu'un script ou une feuille de version figée
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`site.json: "daisyui" must be an exact version such as "5.7.50", not "${version}"`);
  }
  return version;
}

/**
 * Feuilles de composants dont la classe racine apparaît dans le HTML (variantes md:, hover: comprises). Un composant
 * de daisyUI porte toujours sa racine (`btn btn-primary`, `tabs` > `tab`) : la racine seule suffit, et un utilitaire
 * de Tailwind au même préfixe (`list-disc`, `mask-radial`, `table-auto`) ne charge rien.
 */
export function daisyuiComponents(html) {
  const classes = new Set();
  for (const m of html.matchAll(/\bclass=(["'])(.*?)\1/gs)) {
    for (const token of m[2].split(/\s+/)) if (token) classes.add(token.split(':').pop().replace(/^!/, ''));
  }
  const used = FILES.filter(([, roots]) => roots.some((r) => classes.has(r)));
  return used.map(([file]) => file).sort();
}

/**
 * Balises de l'en-tête : ordre des couches de Tailwind déclaré avant les feuilles de daisyUI (sans lui, leurs
 * `@layer base` et `@layer utilities` passeraient devant `theme` et `components`), puis les feuilles du CDN.
 */
export function daisyuiHead(version, files) {
  const cdn = `https://cdn.jsdelivr.net/npm/daisyui@${version}`;
  return [
    '<!-- daisyUI : feuilles des composants de la page ; thème pointé sur les tokens (bloc tailwindcss) -->',
    '<style>@layer theme, base, components, utilities;</style>',
    ...BASE.map((name) => `<link rel="stylesheet" href="${cdn}/base/${name}.css">`),
    ...files.map((name) => `<link rel="stylesheet" href="${cdn}/components/${name}.css">`),
  ].join('\n');
}

/**
 * Tokens et thème daisyUI pour le bloc `<style type="text/tailwindcss">` : `@theme static` émet chaque token, même ceux
 * qu'aucune classe de la page n'emploie (`btn-primary` lit `--color-primary` sans que Tailwind le voie).
 */
export function daisyuiTheme(theme) {
  return `${theme.replace(/^@theme\s*\{/, '@theme static {')}

/* Thème daisyUI pointé sur les tokens (même correspondance que le skill design-system) : primary, success, warning
   et info sont les tokens eux-mêmes ; le texte posé sur une couleur d'état reprend la surface. */
:root {
  --color-base-100: var(--color-surface);
  --color-base-200: var(--color-surface-alt);
  --color-base-300: var(--color-line);
  --color-base-content: var(--color-ink);
  --color-primary-content: var(--color-on-primary);
  --color-secondary: var(--color-surface-alt);
  --color-secondary-content: var(--color-ink);
  --color-accent: var(--color-surface-alt);
  --color-accent-content: var(--color-ink);
  --color-neutral: var(--color-ink);
  --color-neutral-content: var(--color-surface);
  --color-info-content: var(--color-surface);
  --color-success-content: var(--color-surface);
  --color-warning-content: var(--color-surface);
  --color-error: var(--color-danger);
  --color-error-content: var(--color-on-danger);
  --radius-selector: var(--radius-control);
  --radius-field: var(--radius-control);
  --radius-box: var(--radius-card);
  --size-selector: 0.25rem;
  --size-field: calc(var(--spacing-control) / 10);
  --border: 1px;
  --depth: 0;
  --noise: 0;
}`;
}

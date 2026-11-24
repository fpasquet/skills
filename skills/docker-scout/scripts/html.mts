/**
 * Rendu HTML commun au rapport d'une image et à la vue d'ensemble : texte, champs variables, graphiques, page.
 */
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGINS, SEVERITIES, SEVERITY_LABEL, SEVERITY_LETTER, countBySeverity, formatSize } from './lib.mts';
import type { Code, Counts, Finding, Origin, Package, Row, Scan, Severity, Table } from './types.mts';

export const esc = (text: unknown) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const fr = new Intl.NumberFormat('fr-FR');
export const plural = (count: number, one: string, many = `${one}s`) => `${fr.format(count)} ${count > 1 ? many : one}`;
export const color = (severity: Severity) => `var(--sev-${SEVERITY_LETTER[severity].toLowerCase()})`;
export const chips = (counts: Counts) => `<div class="chips">${SEVERITIES.filter((severity) => counts[severity]).map((severity) => `<span style="color:${color(severity)}" title="${SEVERITY_LABEL[severity]}">${fr.format(counts[severity])} ${SEVERITY_LETTER[severity]}</span>`).join('') || '<span class="yes">aucune</span>'}</div>`;
const legend = `<div class="legend">${SEVERITIES.map((severity) => `<span><i style="background:${color(severity)}"></i>${SEVERITY_LABEL[severity]}</span>`).join('')}</div>`;

export interface Bar { label: string; note?: string; counts: Counts; mono?: boolean }
export interface Section { id: string; nav: string }

/** Textes et blocs d'une page, dont les champs variables sont lus dans `scans`. */
export function createRenderer(scans: Record<string, Scan>, errors: string[]) {
  function variable(path: string): string | null {
    const [label, ...keys] = path.split('.');
    const scan = scans[label];
    if (!scan) return null;
    const count = (counts: Counts | undefined, key = 'total') => {
      if (!counts) return null;
      const severity = SEVERITIES.find((item) => SEVERITY_LETTER[item] === key || item === key);
      return key === 'total' ? fr.format(counts.total) : severity ? fr.format(counts[severity]) : null;
    };
    const [first, second, third] = keys;
    if (first === 'fixable') return count(scan.fixable, second);
    if (first === 'base') return count(scan.base?.counts, second);
    if (first === 'origin') return second in ORIGINS ? count(scan.byOrigin[second as Origin] ?? countBySeverity([]), third) : null;
    if (first === 'size') return formatSize(scan.image?.size);
    if (first === 'packages') return fr.format(scan.packageCount);
    if (first === 'user') return scan.image?.user ?? null;
    if (first === 'digest') return scan.image?.digest?.slice(7, 19) ?? null;
    if (first === 'kev') return fr.format(scan.kevCount);
    return count(scan.counts, first);
  }
  // Un champ : {{current.total}}, ou {{api:current.total}} dans la vue d'ensemble.
  const fill = (text: string) => text.replace(/\{\{\s*([\w.:-]+)\s*\}\}/g, (match, path: string) => {
    const value = variable(path);
    if (value === null) errors.push(`champ variable inconnu : ${match}`);
    return value ?? match;
  });
  // Dans un bloc de code, les ${{ … }} de GitHub Actions ne sont pas des champs variables.
  const fillCode = (text: string) => text.replace(/(^|[^$])\{\{\s*([a-z0-9:-]+\.[\w.-]+)\s*\}\}/g, (match, before: string, path: string) => (variable(path) === null ? match : before + variable(path)));
  const inline = (text: string) => esc(fill(text))
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const prose = (text = '') => `<div class="prose">${text.split(/\n{2,}/).filter((block) => block.trim()).map((block) => {
    const lines = block.split('\n');
    if (lines.every((line) => /^\s*- /.test(line))) return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*- /, ''))}</li>`).join('')}</ul>`;
    return `<p>${inline(lines.join(' '))}</p>`;
  }).join('')}</div>`;
  const code = ({ title, lang, text }: Code) => `<div class="code"><div class="code-head"><span>${esc(title ?? lang ?? 'Commande')}</span><button type="button" class="copy">Copier</button></div><pre tabindex="0"><code>${esc(fillCode(text))}</code></pre></div>`;
  const table = ({ head, rows }: Table) => `<div class="table-box"><table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const finding = (item: Finding) => `<article class="card finding ${item.level ?? 'info'}"><h3>${inline(item.title)}</h3>${prose(item.body)}${item.table ? table(item.table) : ''}</article>`;
  function bars(items: Bar[], caption: string): string {
    const max = Math.max(1, ...items.map((item) => item.counts.total));
    return `<div class="card">${legend}<div class="bars" role="img" aria-label="${esc(`${caption} : ${items.map((item) => `${item.label} ${item.counts.total}`).join(', ')}`)}">${items.map(({ label, note, counts, mono }) => `<div class="bar-row"><div class="lab"><span${mono ? ' class="mono"' : ''}>${mono ? esc(label) : inline(label)}</span>${note ? `<small>${inline(note)}</small>` : ''}</div><div class="bar-wrap"><div class="bar" style="width:calc((100% - 7.5rem) * ${(counts.total / max).toFixed(4)})">${SEVERITIES.filter((severity) => counts[severity]).map((severity) => `<span style="flex:${counts[severity]} 0 0;background:${color(severity)}" title="${SEVERITY_LABEL[severity]} : ${counts[severity]}"></span>`).join('')}</div><span class="bar-total">${fr.format(counts.total)} <small>${counts.CRITICAL} C · ${counts.HIGH} H</small></span></div></div>`).join('')}</div></div>`;
  }
  const sections: Section[] = [];
  function section(id: string, nav: string, eyebrow: string, title: string, lead: string, body: string): string {
    if (!body.trim()) return '';
    sections.push({ id, nav });
    return `<section class="section" id="${id}"><header><span class="eyebrow">${esc(eyebrow)}</span><h2>${inline(title)}</h2>${lead ? `<p class="lead">${inline(lead)}</p>` : ''}</header>${body}</section>`;
  }
  return { variable, fill, inline, prose, code, table, finding, bars, section, sections };
}

export type SourceUse = 'image' | 'production' | 'development' | 'ci' | 'unknown';
/** Où un paquet du code source se retrouve : dans l'image, en production sans y être vu (compilé), ou hors production. */
export function sourceUse(pkg: Package, inImages: Set<string>, manifests: string[]): SourceUse {
  if (pkg.origin === 'ci') return 'ci';
  if (inImages.has(`${pkg.name}@${pkg.version}`)) return 'image';
  if (!pkg.usedBy) return 'unknown';
  // Sans manifeste déclaré, tout manifeste compte : on préfère signaler trop que pas assez.
  return pkg.usedBy.some((path) => !manifests.length || manifests.includes(path)) ? 'production' : 'development';
}
export const SOURCE_USES: Record<SourceUse, string> = {
  image: 'Présent dans une image', production: 'Production, hors de l’image (compilé)', development: 'Développement et tests', ci: 'Actions GitHub', unknown: 'Hors de l’image, usage inconnu',
};
export const SOURCE_NOTES: Record<SourceUse, string> = {
  image: 'Déjà compté dans le rapport de l’image.',
  production: 'Dépendances de production que Scout ne voit pas dans l’image : un bundler les a compilées (interface web, API en un fichier), ou elles n’y sont pas copiées. À traiter comme l’image.',
  development: 'Outils de développement et de test : sur les postes et les runners, pas en production.',
  ci: 'Actions utilisées par les workflows.',
  unknown: 'Lockfile sans distinction de production : dépendances de développement, ou code compilé dans l’application.',
};

export const clientRow = (row: Row, gone?: boolean) => ({
  id: row.id, sev: SEVERITY_LETTER[row.severity], pkg: row.pkg.name, ver: row.pkg.version, fix: row.fix, origin: row.pkg.origin, url: row.url,
  score: row.score, epss: row.epss, kev: row.kev, sum: row.summary, gone,
});

export interface PageOptions { title: string; header: string; nav: string; body: string; footer: string; data?: unknown }

const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'report');
export function page({ title, header, nav, body, footer, data }: PageOptions): string {
  // L'avertissement d'API expérimentale de Node n'apprend rien à la personne qui lance le rapport.
  process.removeAllListeners('warning');
  const script = stripTypeScriptTypes(readFileSync(join(templates, 'client.ts'), 'utf8')).replace(/^\s*[\r\n]/gm, '');
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
${readFileSync(join(templates, 'styles.css'), 'utf8')}</style>
<div class="wrap">
<header class="top">${header}</header>
<nav class="toc" aria-label="Sommaire">${nav}</nav>
${body}
<footer>${footer}</footer>
</div>
${data ? `<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n` : ''}<script>
${script.replace(/<\/script/gi, '<\\/script')}</script>
`;
}

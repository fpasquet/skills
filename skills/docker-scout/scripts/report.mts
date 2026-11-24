#!/usr/bin/env node
/**
 * Construit le rapport HTML d'un audit à partir des scans et de l'analyse rédigée (analysis.json). Tous les chiffres
 * viennent des scans : dans un texte, on écrit {{current.total}}, jamais le nombre.
 *
 *   node report.mts <dir> [--out <dir>/report.html] [--check]
 *
 *   --check   vérifie l'analyse (scans, paquets, champs variables) sans écrire la page ; code de sortie 1 s'il y a une erreur
 *
 * Champs variables : {{<scan>.total}}, .C .H .M .L .U, .fixable.total (ou .C…), .origin.base-os, .size, .packages, .user,
 * .base.total (ou .C…), .digest, .kev.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORIGINS, SEVERITIES, SEVERITY_LABEL, SEVERITY_LETTER, buildCommand, countBySeverity, diff, fail, flatten, formatSize, loadConfig, loadScans, parseArgs,
  rank, readJson, without, withScheme,
} from './lib.mts';
import type {
  Action, Analysis, BaseCandidate, Code, Config, Counts, Finding, Gain, Issue, Origin, Row, Scan, Scenario, Step, Table,
} from './types.mts';

const options = parseArgs(process.argv.slice(2), { flags: ['check'] });
const [input] = options.positionals;
if (!input) throw fail('usage : node report.mts <dir> [--out <fichier>] [--check]');
const dir = resolve(input);
const config = loadConfig(dir);
const root = resolve(dir, config.root ?? '..');
const scans = loadScans(dir);
const analysisPath = join(dir, 'analysis.json');
if (!existsSync(analysisPath)) fail(`${analysisPath} absent : lancer init.mts.`);
const analysis = JSON.parse(readFileSync(analysisPath, 'utf8')) as Analysis;
const detect = readJson<{ issues?: Issue[]; docker?: { path?: string } | null }>(join(dir, 'detect.json'), {});
const candidates = readJson<{ bases?: BaseCandidate[] }>(join(dir, 'bases.json'), {}).bases ?? [];
const errors: string[] = [];
const warnings: string[] = [];

const scanOf = (label: string | undefined, where: string): Scan | null => {
  if (!label) return null;
  if (scans[label]) return scans[label];
  errors.push(`${where} : scan « ${label} » introuvable (scans : ${Object.keys(scans).join(', ') || 'aucun'})`);
  return null;
};
const reference = scanOf(analysis.reference, 'reference') ?? Object.values(scans).find((scan) => scan.kind === 'image') ?? Object.values(scans)[0];
if (!reference) throw fail('aucun scan : lancer scan.mts.');
const target = scanOf(analysis.target, 'target');
const source = scanOf(analysis.source, 'source');

// ---------------------------------------------------------------------------
// Texte : échappement, petit Markdown, champs variables
// ---------------------------------------------------------------------------
const esc = (text: unknown) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fr = new Intl.NumberFormat('fr-FR');
const plural = (count: number, one: string, many = `${one}s`) => `${fr.format(count)} ${count > 1 ? many : one}`;

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

const fill = (text: string) => text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, path: string) => {
  const value = variable(path);
  if (value === null) errors.push(`champ variable inconnu : ${match}`);
  return value ?? match;
});
const inline = (text: string) => esc(fill(text))
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
const prose = (text = '') => `<div class="prose">${text.split(/\n{2,}/).filter((block) => block.trim()).map((block) => {
  const lines = block.split('\n');
  if (lines.every((line) => /^\s*- /.test(line))) return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*- /, ''))}</li>`).join('')}</ul>`;
  return `<p>${inline(lines.join(' '))}</p>`;
}).join('')}</div>`;
const code = ({ title, lang, text }: Code) => `<div class="code"><div class="code-head"><span>${esc(title ?? lang ?? 'Commande')}</span><button type="button" class="copy">Copier</button></div><pre><code>${esc(fillCode(text))}</code></pre></div>`;
// Les ${{ … }} de GitHub Actions ne sont pas des champs variables.
const fillCode = (text: string) => text.replace(/(^|[^$])\{\{\s*([a-z0-9-]+\.[\w.-]+)\s*\}\}/g, (match, before: string, path: string) => (variable(path) === null ? match : before + variable(path)));
const table = ({ head, rows }: Table) => `<div class="table-box"><table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// ---------------------------------------------------------------------------
// Éléments communs
// ---------------------------------------------------------------------------
const sections: { id: string; nav: string }[] = [];
function section(id: string, nav: string, eyebrow: string, title: string, lead: string, body: string): string {
  if (!body.trim()) return '';
  sections.push({ id, nav });
  return `<section class="section" id="${id}"><header><span class="eyebrow">${esc(eyebrow)}</span><h2>${inline(title)}</h2>${lead ? `<p class="lead">${inline(lead)}</p>` : ''}</header>${body}</section>`;
}
const color = (severity: string) => `var(--sev-${SEVERITY_LETTER[severity as keyof typeof SEVERITY_LETTER].toLowerCase()})`;
const chips = (counts: Counts) => `<div class="chips">${SEVERITIES.filter((severity) => counts[severity]).map((severity) => `<span style="color:${color(severity)}" title="${SEVERITY_LABEL[severity]}">${fr.format(counts[severity])} ${SEVERITY_LETTER[severity]}</span>`).join('') || '<span class="yes">aucune</span>'}</div>`;
const legend = `<div class="legend">${SEVERITIES.map((severity) => `<span><i style="background:${color(severity)}"></i>${SEVERITY_LABEL[severity]}</span>`).join('')}</div>`;
interface Bar { label: string; note?: string; counts: Counts; mono?: boolean }
function bars(items: Bar[], caption: string): string {
  const max = Math.max(1, ...items.map((item) => item.counts.total));
  return `<div class="card">${legend}<div class="bars" role="img" aria-label="${esc(`${caption} : ${items.map((item) => `${item.label} ${item.counts.total}`).join(', ')}`)}">${items.map(({ label, note, counts, mono }) => `<div class="bar-row"><div class="lab"><span${mono ? ' class="mono"' : ''}>${inline(label)}</span>${note ? `<small>${inline(note)}</small>` : ''}</div><div class="bar-wrap"><div class="bar" style="width:calc((100% - 7.5rem) * ${(counts.total / max).toFixed(4)})">${SEVERITIES.filter((severity) => counts[severity]).map((severity) => `<span style="flex:${counts[severity]} 0 0;background:${color(severity)}" title="${SEVERITY_LABEL[severity]} : ${counts[severity]}"></span>`).join('')}</div><span class="bar-total">${fr.format(counts.total)} <small>${counts.CRITICAL} C · ${counts.HIGH} H</small></span></div></div>`).join('')}</div></div>`;
}
const scenarioScan = (scenario: Scenario | Gain, where: string): Scan | null => {
  if ('scan' in scenario && scenario.scan) return scanOf(scenario.scan, where);
  const from = scanOf(scenario.from, where);
  return from && scenario.without ? without(from, scenario.without) : from;
};

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
const POLICIES: Record<string, string> = {
  'default-non-root-user': 'Utilisateur par défaut non root',
  'copyleft-license': 'Paquets sous licence copyleft',
  'fixable-vulnerabilities': 'Failles critiques ou hautes corrigeables',
  'high-profile-vulnerabilities': 'Failles très médiatisées ou exploitées',
  'no-stale-base-images': 'Image de base à jour',
  'approved-base-images': 'Image de base approuvée',
  'supply-chain-attestations': 'Attestations SBOM et provenance',
};

function scoutSection(): string {
  const commands: [string, string][] = [
    ['docker scout quickview <image>', 'Résumé en un écran : failles par sévérité, image de base, politiques, health score. À lancer en premier.'],
    ['docker scout cves <image>', 'Liste des failles par paquet, avec la version corrective. Filtres : --only-severity critical,high, --only-fixed, --only-package-type npm, --only-cisa-kev.'],
    ['docker scout recommendations <image>', 'Images de base plus récentes ou moins vulnérables, quand Scout reconnaît l’image de base.'],
    ['docker scout compare <image> --to <autre>', 'Failles ajoutées et supprimées entre deux images, pour valider une montée de version.'],
    ['docker scout policy <image>', 'Détail des politiques non respectées : utilisateur, licences, attestations…'],
    ['docker scout sbom <image>', 'Inventaire complet des paquets (spdx, cyclonedx, list).'],
    ['docker scout cves --exit-code', 'Pour la CI : code de sortie 2 si une faille correspond aux filtres.'],
  ];
  return `<details class="card"><summary>Docker Scout en bref</summary><p class="lead">Docker Scout inventorie les paquets d’une image, les compare aux bases de failles connues (CVE) et indique la version qui corrige chacune. Il évalue aussi des bonnes pratiques de construction.</p><dl class="cmds">${commands.map(([name, text]) => `<dt>${esc(name)}</dt><dd>${esc(text)}</dd>`).join('')}</dl><p class="lead">L’image se désigne par <code>local://</code> (daemon local), <code>registry://</code>, <code>archive://</code>, <code>oci-dir://</code> ou <code>fs://</code> (dossier). Scout demande une connexion à un compte Docker Hub (<code>docker login</code>) et n’envoie à Docker que l’identité des paquets et l’empreinte des couches d’une image locale.</p></details>`;
}

function summarySection(): string {
  const { counts, fixable } = reference;
  const serious = counts.CRITICAL + counts.HIGH;
  const seriousFixable = fixable.CRITICAL + fixable.HIGH;
  const title = `${plural(counts.total, 'vulnérabilité')}${counts.CRITICAL ? `, dont ${plural(counts.CRITICAL, 'critique')}` : ''}`;
  const lead = `Elles touchent ${plural(reference.vulnerablePackages, 'paquet')} sur ${fr.format(reference.packageCount)}.${serious ? ` ${fr.format(seriousFixable)} des ${fr.format(serious)} failles critiques ou hautes ont déjà un correctif publié.` : ''}${target ? ` Après les corrections mesurées, il en reste ${fr.format(target.counts.total)}, dont ${plural(target.counts.CRITICAL, 'critique')} et ${plural(target.counts.HIGH, 'haute')}.` : ''}`;
  const cards = [...SEVERITIES.filter((severity) => severity !== 'UNSPECIFIED' || counts[severity]).map((severity) => `<div class="sev" style="--c:${color(severity)}"><span class="n">${fr.format(counts[severity])}</span><span class="l">${SEVERITY_LABEL[severity]}${counts[severity] > 1 ? 's' : ''}</span></div>`), `<div class="sev"><span class="n">${fr.format(counts.total)}</span><span class="l">Total</span></div>`];
  const facts: [string, string][] = [];
  if (reference.health) facts.push(['Health score', `${reference.health.grade} (${reference.health.percent} %)${target?.health ? ` → ${target.health.grade} (${target.health.percent} %)` : ''}`]);
  if (reference.policies) facts.push(['Politiques respectées', `${reference.policies.filter((policy) => policy.pass).length} sur ${reference.policies.length}`]);
  facts.push(['Critiques et hautes corrigeables', `${fixable.CRITICAL} C · ${fixable.HIGH} H`]);
  facts.push(['Exploitées (catalogue CISA KEV)', fr.format(reference.kevCount)]);
  if (reference.base) facts.push(['Image de base', reference.base.ref]);
  const policies = reference.policies?.length ? `<h3>Politiques Scout</h3><div class="rows">${[...reference.policies].sort((a, b) => Number(b.pass) - Number(a.pass)).map((policy) => {
    const informative = policy.id === 'copyleft-license';
    return `<div class="row"><span><span class="pill ${policy.pass ? 'ok' : informative ? '' : 'warning'}">${policy.pass ? 'Respectée' : informative ? 'Informatif' : 'À traiter'}</span></span><span>${esc(POLICIES[policy.id] ?? policy.id)}</span><span class="r tnum">${policy.pass ? '' : plural(policy.violations, 'écart')}</span></div>`;
  }).join('')}</div>` : '';
  return section('synthese', 'Synthèse', 'Résultat du scan', title, lead, `<div class="sev-row">${cards.join('')}</div>${reference.blindSpot ? `<article class="card finding error"><h3>Analyse incomplète</h3><p>${esc(reference.blindSpot)}.</p></article>` : ''}<div class="facts">${facts.map(([name, value]) => `<div class="fact"><span>${esc(name)}</span><span>${esc(value)}</span></div>`).join('')}</div>${policies}`);
}

const findings = (analysis.findings ?? []).map((finding: Finding) => `<article class="card finding ${finding.level ?? 'info'}"><h3>${inline(finding.title)}</h3>${prose(finding.body)}${finding.table ? table(finding.table) : ''}</article>`).join('');

// Texte par défaut de chaque origine, remplacé par originNotes.
const ORIGIN_NOTES: Record<Origin, string> = {
  'base-os': 'Paquets système et moteur d’exécution de l’image de base. Ils se corrigent en reconstruisant sur une image de base à jour, ou en changeant de variante.',
  'base-tools': 'Outils livrés par l’image de base (npm, pip…), rarement utiles à l’exécution : les retirer de l’image de production.',
  'app-os': 'Paquets installés par le Dockerfile, avec leurs dépendances : retirer ceux qui ne servent pas à l’exécution, reconstruire sans cache pour les autres.',
  app: 'Dépendances directes ou transitives de l’application : monter la version, sinon forcer la version transitive.',
  ci: 'Actions utilisées par les workflows : épingler une version corrigée.',
};
function originSection(): string {
  const cards = (Object.keys(ORIGINS) as Origin[]).filter((origin) => reference.byOrigin[origin]).map((origin) => {
    const counts = reference.byOrigin[origin] as Counts;
    const after = target ? ` <small>(${fr.format(target.byOrigin[origin]?.total ?? 0)} après corrections)</small>` : '';
    return `<article class="card"><h3>${ORIGINS[origin]}</h3><div class="big">${fr.format(counts.total)}${after}</div>${chips(counts)}<p>${inline(analysis.originNotes?.[origin] ?? ORIGIN_NOTES[origin])}</p></article>`;
  }).join('');
  const rows = flatten(reference);
  const byLayer = reference.layers.map((layer) => ({ layer, counts: countBySeverity(rows.filter((row) => row.pkg.layer === layer.index)) })).filter((item) => item.counts.total);
  const layers = byLayer.length > 1 ? `<h3>Par instruction du Dockerfile</h3>${bars(byLayer.map(({ layer, counts }) => ({ label: layer.instruction.length > 90 ? `${layer.instruction.slice(0, 88)}…` : layer.instruction, note: layer.fromBase ? 'image de base' : 'projet', counts, mono: true })), 'Failles par instruction')}` : '';
  const packages = [...reference.packages].sort((a, b) => b.vulnerabilities.length - a.vulnerabilities.length).slice(0, 10);
  const top = packages.length ? `<h3>Paquets les plus touchés</h3>${bars(packages.map((pkg) => ({ label: `${pkg.name} ${pkg.version}`, note: ORIGINS[pkg.origin], counts: countBySeverity(pkg.vulnerabilities), mono: true })), 'Failles par paquet')}` : '';
  const extra = source ? sourceCard(source) : '';
  return section('origine', 'Origine', 'D’où viennent les failles', 'Chaque origine a sa façon de corriger', '', `<div class="grid">${cards}${extra}</div>${layers}${top}`);
}

function sourceCard(scan: Scan): string {
  const inImage = new Set(reference.packages.map((pkg) => `${pkg.name}@${pkg.version}`));
  const only = scan.packages.filter((pkg) => !inImage.has(`${pkg.name}@${pkg.version}`));
  const counts = countBySeverity(only.flatMap((pkg) => pkg.vulnerabilities));
  return `<article class="card"><h3>Code source, hors image</h3><div class="big">${fr.format(counts.total)}</div>${chips(counts)}<p>Lockfiles et actions GitHub du dépôt (${plural(scan.packageCount, 'paquet')}) : ce qui sert au développement et à la CI sans entrer dans l’image.</p></article>`;
}

function scenarioSection(): string {
  const items = (analysis.scenarios ?? []).flatMap((scenario): Bar[] => {
    const scan = scenarioScan(scenario, `scenarios « ${scenario.label} »`);
    return scan ? [{ label: scenario.label, note: [scenario.note, scenario.scan ? 'mesuré' : 'estimé'].filter(Boolean).join(', '), counts: scan.counts }] : [];
  });
  return section('scenarios', 'Scénarios', 'Effet des corrections', 'Avant et après', 'Un scénario mesuré vient d’un nouveau build analysé ; un scénario estimé retire des failles connues d’un scan.', items.length > 1 ? bars(items, 'Failles par scénario') : '');
}

function basesSection(): string {
  if (!candidates.length) return '';
  const rows = candidates.map((item) => `<tr><td class="mono">${esc(item.ref)}${item.blindSpot ? ' <span class="pill warning">incomplet</span>' : ''}</td><td class="tnum">${item.blindSpot ? '–' : fr.format(item.counts.total)}</td><td>${item.blindSpot ? 'non mesurable' : chips(item.counts)}</td><td class="tnum">${item.blindSpot ? '–' : fr.format(item.fixable.total)}</td><td class="tnum">${formatSize(item.size)}</td><td class="tnum">${fr.format(item.packages)}</td><td>${esc(item.distro)}</td><td>${esc(item.user)}</td></tr>`).join('');
  return section('bases', 'Images de base', 'Choix de l’image de base', 'Images de base comparées', 'Chaque image analysée seule, telle que publiée, sans l’application.', `<div class="table-box"><table><thead><tr><th>Image</th><th>Failles</th><th>Par sévérité</th><th>Corrigeables</th><th>Taille</th><th>Paquets</th><th>Système</th><th>Utilisateur</th></tr></thead><tbody>${rows}</tbody></table></div>${candidates.filter((item) => item.blindSpot).map((item) => `<p class="lead"><code>${esc(item.ref)}</code> : ${esc(item.blindSpot)}.</p>`).join('')}`);
}

const LEVELS: Record<string, string> = { error: 'À corriger', warning: 'À améliorer', info: 'Conseil' };
function dockerfileSection(): string {
  const fixed = analysis.dockerfile?.fixed ?? [];
  const rows = (detect.issues ?? []).map((issue) => {
    const done = fixed.includes(issue.rule);
    const note = analysis.dockerfile?.notes?.[issue.rule];
    return `<div class="row"><span><span class="pill ${done ? 'ok' : issue.level}">${done ? 'Corrigé' : LEVELS[issue.level]}</span></span><span>${esc(issue.message)}${note ? `<br><span class="lead">${inline(note)}</span>` : ''}</span><span class="r mono">${esc(issue.file)}${issue.line ? `:${issue.line}` : ''}</span></div>`;
  }).join('');
  return section('dockerfile', 'Dockerfile', 'Construction de l’image', 'Audit du Dockerfile', analysis.dockerfile?.intro ?? '', rows ? `<div class="rows">${rows}</div>` : '');
}

const STATUS: Record<string, [string, string]> = { todo: ['À faire', 'info'], done: ['Fait', 'ok'], accepted: ['Risque accepté', 'warning'] };
function gainPill(gain: Gain, where: string): string {
  const before = scanOf(gain.from, where);
  const after = gain.to ? scanOf(gain.to, where) : before && without(before, gain.without);
  if (!before || !after) return '';
  const delta = before.counts.total - after.counts.total;
  const label = delta > 0 ? `−${plural(delta, 'faille')}` : delta < 0 ? `+${plural(-delta, 'faille')}` : 'aucune faille en moins';
  return `<span class="gain${gain.to ? '' : ' est'}">${label} · ${after.counts.CRITICAL} C, ${after.counts.HIGH} H restantes (${gain.to ? 'mesuré' : 'estimé'})</span>`;
}

function actionCard(action: Action): string {
  const where = `action « ${action.title} »`;
  const [label, tone] = STATUS[action.status ?? 'todo'] ?? STATUS.todo;
  const rows = (action.packages ?? []).map((item) => {
    const found = [reference, ...Object.values(scans)].flatMap((scan) => scan.packages).find((pkg) => pkg.name === item.name && (!item.version || pkg.version === item.version));
    if (!found) errors.push(`${where} : paquet ${item.name}${item.version ? ` ${item.version}` : ''} absent des scans`);
    return `<tr><td class="mono">${esc(found ? `${found.name} ${found.version}` : item.name)}</td><td>${found ? chips(countBySeverity(found.vulnerabilities)) : ''}</td><td>${inline(item.by ?? 'direct')}</td><td>${inline(item.fix)}</td></tr>`;
  }).join('');
  const packages = rows ? `<div class="table-box"><table><thead><tr><th>Paquet vulnérable</th><th>Failles</th><th>Tiré par</th><th>Correction</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
  return `<article class="card action"><div class="action-head"><h3>${inline(action.title)}</h3><span class="pill ${tone}">${label}</span>${action.gain ? gainPill(action.gain, where) : ''}</div>${prose(action.body)}${packages}${action.table ? table(action.table) : ''}${(action.code ?? []).map(code).join('')}</article>`;
}

const steps = (items: Step[] = []) => items.map((item) => `<article class="card"><h3>${inline(item.title)}</h3>${item.body ? prose(item.body) : ''}${(item.code ?? []).map(code).join('')}</article>`).join('');

function buildSection(): string {
  if (!config.image) return '';
  const command = buildCommand(config as Config, 'scout');
  const body = `${code({ title: 'Build de l’image de production, depuis la racine du projet', text: command })}${code({
    title: 'Publication, avec SBOM et provenance attachés à l’image',
    text: `${buildCommand(config as Config, '<version>').replace('docker build', 'docker buildx build --sbom=true --provenance=mode=max --push').replace(`--tag ${config.image}:`, `--tag <registre>/${config.image}:`)}`,
  })}${steps(analysis.build)}`;
  return section('build', 'Build', 'Image de production', 'Construire l’image de production', '', body);
}

function ciSection(): string {
  const workflow = analysis.ci?.workflow ?? '.github/workflows/docker-scout.yml';
  const path = join(root, workflow);
  const secrets = analysis.ci?.secrets ?? [];
  const blocks = [
    analysis.ci?.intro ? prose(analysis.ci.intro) : '',
    secrets.length ? `<h3>Secrets et variables du dépôt</h3><div class="table-box"><table><thead><tr><th>Nom</th><th>Type</th><th>Usage</th></tr></thead><tbody>${secrets.map((item) => `<tr><td class="mono">${esc(item.name)}</td><td>${item.kind === 'secret' ? 'Secret' : 'Variable'}</td><td>${inline(item.why)}</td></tr>`).join('')}</tbody></table></div>${code({ title: 'Création avec la CLI GitHub (la valeur est demandée, jamais passée en argument)', text: secrets.map((item) => (item.kind === 'secret' ? `gh secret set ${item.name}\ngh secret set ${item.name} --app dependabot` : `gh variable set ${item.name}`)).join('\n') })}` : '',
    steps(analysis.ci?.steps),
    existsSync(path) ? code({ title: workflow, lang: 'yaml', text: readFileSync(path, 'utf8') }) : '',
  ].join('');
  return section('ci', 'CI', 'Intégration continue', 'Analyser chaque build avec GitHub Actions', '', blocks);
}

interface VexDocument { author?: string; statements?: { vulnerability?: { name?: string }; products?: { subcomponents?: { '@id'?: string }[] }[]; status?: string; justification?: string; impact_statement?: string; timestamp?: string }[] }
function vexSection(): string {
  const folder = join(root, config.vex?.dir ?? '.vex');
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return '';
  const rows = readdirSync(folder).filter((name) => name.endsWith('.json')).flatMap((name) => {
    const document = JSON.parse(readFileSync(join(folder, name), 'utf8')) as VexDocument;
    return (document.statements ?? []).map((statement) => `<tr><td class="mono id">${esc(statement.vulnerability?.name)}</td><td class="mono">${esc((statement.products ?? []).flatMap((product) => product.subcomponents ?? []).map((item) => item['@id']).join(', '))}</td><td>${esc(statement.status)}</td><td>${esc(statement.justification ?? '')}</td><td>${esc(statement.impact_statement ?? '')}</td><td class="mono id">${esc((statement.timestamp ?? '').slice(0, 10))}</td></tr>`);
  }).join('');
  return section('exceptions', 'Exceptions', 'Risques acceptés', 'Exceptions VEX', 'Failles écartées des analyses, avec leur justification. Elles se relisent à chaque audit.', rows ? `<div class="table-box"><table><thead><tr><th>Faille</th><th>Paquet</th><th>Statut</th><th>Justification</th><th>Explication</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>` : '');
}

// Données du tableau : le scan de référence, la cible et le code source.
const clientRow = (row: Row, gone?: boolean) => ({
  id: row.id, sev: SEVERITY_LETTER[row.severity], pkg: row.pkg.name, ver: row.pkg.version, fix: row.fix, origin: row.pkg.origin, url: row.url,
  score: row.score, epss: row.epss, kev: row.kev, sum: row.summary, gone,
});
const comparison = target ? diff(reference, target) : null;
const images = [
  { id: reference.label, label: reference.title ?? 'Image analysée', versus: target ? 'Après corrections' : undefined, rows: flatten(reference).map((row) => clientRow(row, comparison ? !comparison.has(row) : undefined)) },
  ...(target ? [{ id: target.label, label: target.title ?? 'Après corrections', rows: flatten(target).map((row) => clientRow(row)) }] : []),
  ...(source ? [{ id: source.label, label: source.title ?? 'Code source', rows: flatten(source).map((row) => clientRow(row)) }] : []),
];
function detailSection(): string {
  const usedOrigins = [...new Set(images.flatMap((image) => image.rows.map((row) => row.origin)))];
  return section('detail', 'Détail', 'Détail', 'Toutes les vulnérabilités', 'Triées par sévérité, puis failles exploitées et probabilité d’exploitation (EPSS). Chaque identifiant ouvre la fiche Docker Scout.', `
<div class="controls"><div class="seg" id="images" role="group" aria-label="Scan affiché">${images.map((image, index) => `<button type="button" data-index="${index}" aria-pressed="${index === 0}">${esc(image.label)}</button>`).join('')}</div><div class="filters" id="sev-filters" role="group" aria-label="Sévérités affichées"></div></div>
<div class="controls"><select id="origin-filter" aria-label="Origine"><option value="">Toutes les origines</option>${usedOrigins.map((origin) => `<option value="${origin}">${esc(ORIGINS[origin])}</option>`).join('')}</select><select id="fix-filter" aria-label="Correctif"><option value="">Avec ou sans correctif</option><option value="fixed">Corrigeables</option><option value="unfixed">Sans correctif</option><option value="kev">Exploitées (KEV)</option></select><input type="search" id="search" placeholder="Filtrer par CVE ou paquet" aria-label="Filtrer par CVE ou paquet"><span class="count" id="count" aria-live="polite"></span></div>
<div class="table-box tall" tabindex="0" role="region" aria-label="Vulnérabilités"><table class="vulns"><thead><tr><th>Sévérité</th><th>Identifiant</th><th>Paquet</th><th>Corrigé en</th><th>CVSS</th><th>EPSS</th><th>Origine</th><th id="versus-head"></th></tr></thead><tbody id="vuln-rows"></tbody></table></div>`);
}

function commandsSection(): string {
  const refs = Object.values(scans).sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
  const lines = refs.flatMap((scan) => {
    const ref = withScheme(scan.ref, 'local');
    if (scan.kind === 'fs') return [`# ${scan.title ?? scan.label}`, `docker scout cves ${ref}`];
    return [`# ${scan.title ?? scan.label}`, `docker scout quickview ${ref}`, `docker scout cves --only-severity critical,high --only-fixed ${ref}`];
  });
  if (target) lines.push('# Comparaison', `docker scout compare ${withScheme(target.ref, 'local')} --to ${withScheme(reference.ref, 'local')}`);
  return section('reproduire', 'Reproduire', 'Reproduire l’analyse', 'Commandes utilisées', '', code({ title: 'Docker Scout', text: ['docker login', '', ...lines].join('\n') }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'report');
const body = [
  scoutSection(), summarySection(),
  section('constats', 'Constats', 'Ce qu’il faut retenir', findings && (analysis.findings ?? []).length > 1 ? 'Constats' : 'Constat principal', '', findings),
  originSection(), scenarioSection(), basesSection(), dockerfileSection(),
  section('actions', 'Plan d’action', 'Plan d’action', 'Corrections, par ordre d’impact', '', analysis.actions?.length ? `<div class="actions">${analysis.actions.map(actionCard).join('')}</div>` : ''),
  buildSection(), ciSection(), vexSection(), detailSection(), commandsSection(),
].join('\n');

const meta: [string, string][] = [
  ['Image', reference.ref], ['Digest', reference.image?.digest?.slice(7, 19) ?? ''], ['Plateforme', reference.image?.platform ?? ''], ['Taille', reference.image?.size ? formatSize(reference.image.size) : ''],
  ['Paquets', fr.format(reference.packageCount)], ['Docker Scout', reference.scout], ...(analysis.context ?? []),
];
const date = new Date(reference.scannedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
// L'avertissement d'API expérimentale de Node n'apprend rien à la personne qui lance le rapport.
process.removeAllListeners('warning');
const script = stripTypeScriptTypes(readFileSync(join(templates, 'client.ts'), 'utf8')).replace(/^\s*[\r\n]/gm, '');
const payload = { images, severities: Object.fromEntries(SEVERITIES.map((severity) => [SEVERITY_LETTER[severity], SEVERITY_LABEL[severity]])), origins: ORIGINS };
const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(analysis.pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
${readFileSync(join(templates, 'styles.css'), 'utf8')}</style>
<div class="wrap">
<header class="top"><span class="eyebrow">Audit de vulnérabilités · Docker Scout</span><h1>${inline(analysis.title)}</h1><p class="lead">${inline(analysis.lead)}</p><div class="meta">${meta.filter(([, value]) => value).map(([name, value]) => `<span>${esc(name)} <b class="mono">${esc(fill(value))}</b></span>`).join('')}</div></header>
<nav class="toc" aria-label="Sommaire">${sections.map(({ id, nav }) => `<a href="#${id}">${esc(nav)}</a>`).join('')}</nav>
${body}
<footer><p>Analyse du ${date} avec Docker Scout ${esc(reference.scout)}. ${plural(Object.keys(scans).length, 'scan')} : ${Object.values(scans).map((scan) => `<span class="mono">${esc(scan.ref)}</span>`).join(', ')}.</p><p>L’origine d’un paquet vient de la comparaison avec l’image de base${reference.base ? ` (${esc(reference.base.ref)}, ${reference.base.source === 'provenance' ? 'lue dans la provenance du build' : reference.base.source === 'option' ? 'indiquée à l’analyse' : 'reconnue par Scout'})` : ' (inconnue ici : origine déduite des chemins)'}. Les gains « estimés » n’ont pas été mesurés par un nouveau build.</p></footer>
</div>
<script type="application/json" id="data">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
<script>
${script.replace(/<\/script/gi, '<\\/script')}</script>
`;

if (!analysis.findings?.length) warnings.push('aucun constat (findings)');
if (!analysis.actions?.length) warnings.push('aucune action (actions)');
if (/\bTODO\b|\{\{[A-Z_]+\}\}/.test(readFileSync(analysisPath, 'utf8'))) warnings.push('analysis.json contient encore des textes à remplir (TODO)');
const written = [analysis.title, analysis.lead, ...(analysis.findings ?? []).map((item) => item.body), ...(analysis.actions ?? []).map((item) => item.body)].join('\n');
for (const match of written.matchAll(/(?<![\w.-])\d+\s+(?:vulnérabilités?|failles?|critiques?|hautes?)\b/g)) warnings.push(`chiffre écrit à la main : « ${match[0]} » (utiliser un champ variable)`);
for (const cve of new Set(written.match(/CVE-\d{4}-\d+/g) ?? [])) if (!Object.values(scans).some((scan) => scan.packages.some((pkg) => pkg.vulnerabilities.some((item) => item.id === cve)))) warnings.push(`${cve} citée mais absente des scans`);
const serious = flatten(reference).filter((row) => rank(row.severity) <= 1 && row.fix).length;
for (const message of warnings) console.log(`Avertissement : ${message}`);
for (const message of new Set(errors)) console.log(`Erreur : ${message}`);
if (options.flags.check || errors.length) {
  if (!errors.length) console.log(`Analyse valide (${serious} failles critiques ou hautes corrigeables dans ${reference.label}).`);
  process.exit(errors.length ? 1 : 0);
}
const out = resolve(options.values.out ?? join(dir, 'report.html'));
const previous = existsSync(out) ? readFileSync(out, 'utf8') : '';
writeFileSync(out, html);
console.log(previous === html ? `Rapport inchangé : ${out}` : `Rapport écrit : ${out} (${Math.round(html.length / 1024)} Ko, sections : ${sections.map((item) => item.id).join(', ')})`);
console.log(config.artifact ? `Artifact à mettre à jour : ${config.artifact}` : 'Première publication : noter ensuite l’URL dans scout.json → artifact.');

/**
 * Fonctions communes aux scripts du skill : lecture des options, appels à Docker Scout, normalisation d'un
 * scan (origine de chaque paquet, sévérités, correctifs), comparaison de scans. Aucune dépendance.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type {
  Base, Config, Counts, Exclusion, Health, Layer, Origin, Package, Policy, RawArtifact, RawLocation, RawScan, RawVulnerability, Row, Scan, Severity, Summary,
  Vulnerability,
} from './types.mts';

export const CONFIG_FILE = 'scout.json';
export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNSPECIFIED'];
export const SEVERITY_LETTER: Record<Severity, string> = { CRITICAL: 'C', HIGH: 'H', MEDIUM: 'M', LOW: 'L', UNSPECIFIED: 'U' };
export const SEVERITY_LABEL: Record<Severity, string> = { CRITICAL: 'Critique', HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse', UNSPECIFIED: 'Non classée' };
export const ORIGINS: Record<Origin, string> = {
  'base-os': 'Système de l’image de base',
  'base-tools': 'Outils fournis par l’image de base',
  'app-os': 'Paquets système du Dockerfile',
  app: 'Dépendances de l’application',
  ci: 'Actions GitHub',
};
const OS_TYPES = new Set(['deb', 'apk', 'rpm', 'alpm']);
// Sans image de base connue, les outils que les images officielles embarquent se reconnaissent à leur chemin.
const TOOL_PATHS = /^\/(usr\/local\/lib\/node_modules\/(npm|corepack)|opt\/yarn|usr\/local\/lib\/python[\d.]+\/(site-packages\/(pip|setuptools|wheel)|ensurepip)|usr\/local\/lib\/ruby\/gems|usr\/share\/dotnet)/;

export interface Options {
  positionals: string[];
  values: Record<string, string | undefined>;
  lists: Record<string, string[] | undefined>;
  flags: Record<string, boolean | undefined>;
}

// Options : --name value, --name=value, --flag (si listé dans `flags`), et --name répété (si listé dans `multi`).
export function parseArgs(argv: string[], { flags = [], multi = [] }: { flags?: string[]; multi?: string[] } = {}): Options {
  const options: Options = { positionals: [], values: {}, lists: {}, flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const match = argv[i].match(/^--([\w-]+)(?:=([\s\S]*))?$/);
    if (!match) {
      options.positionals.push(argv[i]);
      continue;
    }
    const name = match[1];
    const inline = match[2];
    if (flags.includes(name)) {
      options.flags[name] = true;
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined) return fail(`--${name} attend une valeur.`);
    if (multi.includes(name)) (options.lists[name] ??= []).push(value);
    else options.values[name] = value;
  }
  return options;
}

export function fail(message: string, code = 2): never {
  console.error(`Erreur : ${message}`);
  process.exit(code);
}

export function run(command: string, args: string[], env?: Record<string, string>) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, ...(env ? { env: { ...process.env, ...env } } : {}) });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? String(result.error ?? '') };
}

export const readJson = <T,>(path: string, fallback: T): T => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : fallback);
export const writeJson = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 1) + '\n');

export function loadConfig(dir: string): Partial<Config> {
  return readJson<Partial<Config>>(join(resolve(dir), CONFIG_FILE), {});
}

export function loadScans(dir: string): Record<string, Scan> {
  const folder = join(resolve(dir), 'scans');
  if (!existsSync(folder)) return {};
  const scans: Record<string, Scan> = {};
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json')).sort()) {
    scans[file.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(folder, file), 'utf8')) as Scan;
  }
  return scans;
}

// Un scan se désigne par son chemin, ou par son label dans un espace de travail (`<dir>:label`).
export function loadScan(ref: string): Scan {
  const parse = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Scan;
  if (existsSync(ref) && ref.endsWith('.json')) return parse(ref);
  const match = ref.match(/^(.*):([^:/]+)$/);
  const path = match && join(resolve(match[1]), 'scans', `${match[2]}.json`);
  if (path && existsSync(path)) return parse(path);
  return fail(`scan introuvable : ${ref} (attendu un fichier .json ou <dossier>:<label>)`);
}

// ---------------------------------------------------------------------------
// Docker Scout
// ---------------------------------------------------------------------------

const SCHEMES = /^(image|local|registry|oci-dir|archive|fs|sbom):\/\//;
export const isFileSystem = (ref: string) => ref.startsWith('fs://');
export const withScheme = (ref: string, scheme: string) => (SCHEMES.test(ref) ? ref : `${scheme}://${ref}`);

export function scoutVersion(): string {
  const { status, stdout, stderr } = run('docker', ['scout', 'version']);
  if (status !== 0) fail(`Docker Scout indisponible (${stderr.trim().split('\n')[0]}). Voir references/build.md, « Prérequis ».`);
  return stdout.match(/version:\s*v?([\w.-]+)/)?.[1] ?? 'inconnue';
}

const scoutError = (stderr: string) => stderr.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split(/[\r\n]+/).map((line) => line.trim())
  .filter((line) => line && !/^[✓!]|^\.\.\.|^What's next|^View |^Learn|^Compare /.test(line)).slice(-4).join(' | ');

// Espace de travail de Scout : sur disque plutôt que dans /tmp, souvent un tmpfs sous quota trop petit pour les couches
// d'une grosse image, et où ses dossiers d'extraction (trivy-*, stereoscope-*) restent après chaque analyse. Ceux d'un
// appel sont supprimés à la fin ; le cache des inventaires, réutilisé d'un appel à l'autre, est gardé.
const scoutHome = () => join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'docker-scout-skill');
function scoutTemp(): { dir: string; env: Record<string, string> } {
  const home = scoutHome();
  mkdirSync(join(home, 'sbom'), { recursive: true });
  const dir = mkdtempSync(join(home, 'run-'));
  return { dir, env: { TMPDIR: dir, DOCKER_SCOUT_CACHE_DIR: process.env.DOCKER_SCOUT_CACHE_DIR || join(home, 'sbom') } };
}

// Lance une commande Scout qui écrit un fichier, et en rend le contenu (null si elle échoue).
function scoutFile(args: string[], ref: string, { allowFailure = false } = {}): string | null {
  const { dir, env } = scoutTemp();
  const output = join(dir, 'out');
  try {
    const { status, stdout, stderr: errors } = run('docker', ['scout', ...args, '--output', output, ref], env);
    const stderr = `${errors}\n${stdout}`;
    if (!existsSync(output)) {
      if (allowFailure) return null;
      const hint = /disk quota|no space left/i.test(stderr) ? ` → plus de place dans ${scoutHome()} : en libérer, ou désigner un autre disque par XDG_CACHE_HOME.` : /unauthorized|log in|login|denied|pull failed/i.test(stderr) ? ' → docker login (compte Docker Hub), et docker login <registre> pour un registre privé.' : '';
      fail(`docker scout ${args[0]} ${ref} (code ${status}) : ${scoutError(stderr) || stderr.trim().slice(-400)}${hint}`, 1);
    }
    return readFileSync(output, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const platformArgs = (platform?: string) => (platform ? ['--platform', platform] : []);

export function scoutCves(ref: string, { platform, extra = [] }: { platform?: string; extra?: string[] } = {}): RawScan {
  return JSON.parse(scoutFile(['cves', '--format', 'sbom', ...platformArgs(platform), ...extra], ref) ?? '{}') as RawScan;
}

// Comme scoutCves, sans s'arrêter sur une image inaccessible.
export function tryScoutCves(ref: string, platform?: string): RawScan | null {
  const content = scoutFile(['cves', '--format', 'sbom', ...platformArgs(platform)], ref, { allowFailure: true });
  return content ? JSON.parse(content) as RawScan : null;
}

export function scoutPolicies(ref: string, { platform }: { platform?: string } = {}): { health: Health | null; policies: Policy[] } | null {
  const { dir } = scoutTemp();
  const resultFile = join(dir, 'policies.json');
  try {
    const text = scoutFile(['policy', ...platformArgs(platform), '--result-file', resultFile], ref, { allowFailure: true });
    if (!text) return null;
    const health = text.match(/Health score\s+([A-F])\s+\((\d+)\s?%\)/);
    const policies = Object.entries(readJson<Record<string, { pass?: boolean; violations?: unknown[] }>>(resultFile, {})).map(([id, value]) => ({
      id,
      pass: Boolean(value.pass),
      violations: value.violations?.length ?? 0,
      sample: (value.violations ?? []).slice(0, 2),
    }));
    return { health: health ? { grade: health[1], percent: Number(health[2]) } : null, policies };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const packageName = (artifact: RawArtifact) => (artifact.namespace && !OS_TYPES.has(artifact.type) ? `${artifact.namespace}/${artifact.name}` : artifact.name);
export const severityOf = (vulnerability: RawVulnerability): Severity => {
  const value = String(vulnerability.cvss?.severity ?? 'UNSPECIFIED').toUpperCase() as Severity;
  return SEVERITIES.includes(value) ? value : 'UNSPECIFIED';
};

// Premier paragraphe utile de la description, pour reconnaître la faille sans ouvrir sa fiche.
function summarize(text = ''): string {
  const line = text.replace(/\r/g, '').split('\n').map((part) => part.replace(/^#+\s*/, '').replace(/[`*]/g, '').trim())
    .find((part) => part.length > 25 && !/^(impact|summary|details|description|overview|patches|workarounds)\b.{0,12}$/i.test(part)) ?? '';
  return line.length > 200 ? `${line.slice(0, 197)}…` : line;
}

// L'image de base exacte (nom et digest) vient de l'attestation de provenance que BuildKit joint au build.
interface ProvenanceBase { name: string; tag: string; digest: string }
interface Material { uri?: string; digest?: { sha256?: string } }
interface Statement { predicateType?: string; predicate?: { materials?: Material[]; buildDefinition?: { resolvedDependencies?: Material[] } } }

export function provenanceBases(raw: RawScan): ProvenanceBase[] {
  const bases: ProvenanceBase[] = [];
  for (const attestation of raw.attestations ?? []) {
    let statement: Statement;
    try {
      statement = JSON.parse(Buffer.from(attestation.payload ?? '', 'base64').toString('utf8')) as Statement;
    } catch {
      continue;
    }
    if (!/provenance/.test(statement.predicateType ?? '')) continue;
    const materials = statement.predicate?.buildDefinition?.resolvedDependencies ?? statement.predicate?.materials ?? [];
    for (const { uri = '', digest } of materials) {
      const match = uri.match(/^pkg:docker\/([^@?]+)(?:@([^?]+))?/);
      if (!match || !digest?.sha256 || /^(docker\/dockerfile|docker\/buildkit-syft|docker\/scout-sbom|[\w-]+\/buildkit)/.test(match[1])) continue;
      const name = decodeURIComponent(match[1]);
      bases.push({ name, tag: match[2] ? decodeURIComponent(match[2]) : '', digest: `sha256:${digest.sha256}` });
    }
  }
  const seen = new Set<string>();
  return bases.filter((base) => !seen.has(base.digest) && seen.add(base.digest));
}

export function layersOf(raw: RawScan): Layer[] {
  const config = raw.source?.image?.config;
  const history = (config?.history ?? []).filter((entry) => !entry.empty_layer);
  return (config?.rootfs?.diff_ids ?? []).map((diffId, index) => ({
    index,
    diffId,
    instruction: (history[index]?.created_by ?? '').replace(/^\/bin\/sh -c (#\(nop\)\s*)?/, '').replace(/^RUN \/bin\/sh -c /, 'RUN ').replace(/ # buildkit$/, '').replace(/\s+/g, ' ').trim().slice(0, 240),
  }));
}

// Référence de comparaison de l'image de base : paquets système par nom, paquets de langage par chemin.
interface BaseIndex { os: Set<string>; files: Set<string> }

function baseIndex(rawBase: RawScan | null | undefined): BaseIndex | null {
  if (!rawBase) return null;
  const os = new Set<string>();
  const files = new Set<string>();
  for (const artifact of rawBase.artifacts ?? []) {
    if (OS_TYPES.has(artifact.type)) os.add(`${artifact.type}/${artifact.name}`);
    else for (const location of artifact.locations ?? []) files.add(`${packageName(artifact)}@${artifact.version} ${location.path}`);
  }
  return { os, files };
}

function originOf(artifact: RawArtifact, path: string, base: BaseIndex | null, kind: Scan['kind']): Origin {
  if (artifact.type === 'github') return 'ci';
  if (kind === 'fs') return 'app';
  const isOs = OS_TYPES.has(artifact.type);
  const inBase = base
    ? (isOs ? base.os.has(`${artifact.type}/${artifact.name}`) : base.files.has(`${packageName(artifact)}@${artifact.version} ${path}`))
    : (isOs || TOOL_PATHS.test(path) || artifact.type === 'generic');
  if (isOs) return inBase ? 'base-os' : 'app-os';
  // Le moteur d'exécution (node, python…) se corrige comme le système : par une image de base à jour.
  if (inBase) return artifact.type === 'generic' ? 'base-os' : 'base-tools';
  return 'app';
}

// Couche d'un paquet système : celle de sa propre fiche dpkg, sinon la première connue.
function layerIndex(artifact: RawArtifact, layers: Layer[]): number | null {
  const locations = artifact.locations ?? [];
  const best = locations.find((location) => /\/var\/lib\/dpkg\/(info|status\.d)\//.test(location.path)) ?? artifact.files?.[0] ?? locations[0];
  const index = layers.findIndex((layer) => layer.diffId === best?.diff_id);
  return index === -1 ? null : index;
}

export function countBySeverity(items: { severity: Severity }[]): Counts {
  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNSPECIFIED: 0 };
  for (const item of items) counts[item.severity]++;
  return { ...counts, total: items.length };
}

// Une ligne par couple faille × paquet, comme Docker Scout les compte.
export const flatten = (scan: { packages: Package[] }): Row[] => scan.packages.flatMap((pkg) => pkg.vulnerabilities.map((vulnerability) => ({ ...vulnerability, pkg })));
const identity = (row: Row) => `${row.id} ${row.pkg.type}/${row.pkg.name}`;

interface NormalizeOptions {
  label: string; ref: string; title?: string; scout: string; base: Base | null; rawBase: RawScan | null; kev: Set<string>;
  policies: { health: Health | null; policies: Policy[] } | null;
}

export function normalize(raw: RawScan, { label, ref, title, scout, base, rawBase, kev, policies }: NormalizeOptions): Scan {
  const kind: Scan['kind'] = raw.source?.type === 'image' ? 'image' : 'fs';
  const image = raw.source?.image;
  const index = baseIndex(rawBase);
  const layers = layersOf(raw);
  const baseDiffIds = new Set(layersOf(rawBase ?? {}).map((layer) => layer.diffId));
  for (const layer of layers) layer.fromBase = baseDiffIds.has(layer.diffId);
  const artifacts = new Map((raw.artifacts ?? []).map((artifact) => [artifact.purl, artifact]));

  const packages = (raw.vulnerabilities ?? []).map(({ purl, vulnerabilities }): Package => {
    const artifact: RawArtifact = artifacts.get(purl) ?? { type: purl.match(/^pkg:([^/]+)/)?.[1] ?? '', name: purl, version: '', purl };
    const paths = [...new Set((artifact.locations ?? []).map((location: RawLocation) => location.path))];
    const origins = [...new Set((paths.length ? paths : ['']).map((path) => originOf(artifact, path, index, kind)))];
    // Présent à la fois dans l'image de base et dans le projet : c'est le projet qui doit agir.
    const order: Origin[] = ['app', 'app-os', 'ci', 'base-tools', 'base-os'];
    const origin = order.find((id) => origins.includes(id)) ?? 'app';
    return {
      purl, type: artifact.type, name: packageName(artifact), version: artifact.version, origin, origins,
      paths: paths.slice(0, 4), pathCount: paths.length, layer: layerIndex(artifact, layers),
      vulnerabilities: vulnerabilities.map((item) => ({
        id: item.source_id, advisory: item.original_source_id !== item.source_id ? item.original_source_id : undefined,
        severity: severityOf(item), score: item.cvss?.score ?? null, fix: item.fixed_by && item.fixed_by !== 'not fixed' ? item.fixed_by : null,
        epss: item.epss?.score ?? null, kev: kev.has(item.source_id) || undefined, url: item.url, published: item.published_at?.slice(0, 10), summary: summarize(item.description),
      })),
    };
  });
  const inventory = new Map<string, [string, string, string, Origin]>();
  for (const artifact of raw.artifacts ?? []) {
    const paths = (artifact.locations ?? []).map((location) => location.path);
    for (const path of paths.length ? paths : ['']) {
      const entry: [string, string, string, Origin] = [artifact.type, packageName(artifact), artifact.version, originOf(artifact, path, index, kind)];
      inventory.set(entry.join(' '), entry);
    }
  }
  const scan = {
    label, title, ref, kind, scannedAt: new Date().toISOString(), scout,
    image: image ? {
      digest: image.digest, platform: [image.platform?.os, image.platform?.architecture, image.platform?.variant].filter(Boolean).join('/'), size: image.size,
      distro: [image.distro?.os_name, image.distro?.os_version].filter(Boolean).join(' '), user: image.config?.config?.User || 'root',
      created: image.config?.created, env: image.config?.config?.Env?.filter((entry) => /_VERSION=/.test(entry)),
    } : null,
    base: base ? { ...base, counts: rawBase ? countBySeverity(flattenRaw(rawBase)) : undefined, packages: rawBase?.artifacts?.length, size: rawBase?.source?.image?.size } : null,
    packageCount: raw.artifacts?.length ?? 0, blindSpot: kind === 'image' ? blindSpot(raw) : undefined, layers, health: policies?.health ?? null, policies: policies?.policies ?? null, packages, inventory: [...inventory.values()],
  };
  return { ...scan, ...summary(scan) };
}

// Les avis Debian et Ubuntu portent sur les paquets sources (glibc, openssl). Une image dont Scout ne voit que les
// paquets binaires (libc6, libssl3t64 : distroless, fiches dpkg retirées) affiche zéro faille à tort.
export function blindSpot(raw: RawScan): string | undefined {
  const names = new Set((raw.artifacts ?? []).filter((artifact) => artifact.type === 'deb').map((artifact) => artifact.name));
  if (names.has('libc6') && !names.has('glibc')) return 'paquets système indexés sous leur nom binaire (libc6 et non glibc) : leurs failles ne sont pas détectées, le résultat est incomplet';
  // Un binaire Go sans informations de build (esbuild 0.28 et plus) échappe à Scout : ses failles disparaissent du total
  // sans être corrigées.
  const goTool = (raw.artifacts ?? []).find((artifact) => artifact.type === 'npm' && artifact.namespace === '@esbuild');
  if (goTool && !(raw.artifacts ?? []).some((artifact) => artifact.type === 'golang' && artifact.name === 'stdlib')) return `binaire Go sans informations de build (@esbuild/${goTool.name} ${goTool.version}) : les failles de sa bibliothèque standard ne sont pas détectées. Comparer sa version de Go (strings <binaire> | grep -o 'go1[.][0-9.]*') à celles des correctifs`;
  const image = raw.source?.image;
  const hasOs = (raw.artifacts ?? []).some((artifact) => OS_TYPES.has(artifact.type));
  // Image de buildpack (Cloud Run functions…) : le système est ajouté à l'exécution par la plateforme, Scout ne le voit pas.
  if (!hasOs && (raw.artifacts ?? []).some((artifact) => (artifact.locations ?? []).some((location) => /^\/(cnb\/lifecycle|layers\/google\.)/.test(location.path)))) return 'image de buildpack sans système : celui-ci vient de la plateforme à l’exécution et n’est pas analysé';
  const known = image?.distro?.os_name && !/scratch|wolfi|chainguard/i.test(image.distro.os_name);
  if (known && !hasOs) return 'aucun paquet système trouvé (base de paquets retirée de l’image ?) : leurs failles ne sont pas détectées';
  return undefined;
}

export const flattenRaw = (raw: RawScan) => (raw.vulnerabilities ?? []).flatMap((entry) => entry.vulnerabilities.map((item) => ({ severity: severityOf(item), fix: item.fixed_by && item.fixed_by !== 'not fixed' })));

export function summary(scan: { packages: Package[] }): Summary {
  const rows = flatten(scan);
  const byOrigin: Summary['byOrigin'] = {};
  for (const origin of Object.keys(ORIGINS) as Origin[]) {
    const subset = rows.filter((row) => row.pkg.origin === origin);
    if (subset.length) byOrigin[origin] = countBySeverity(subset);
  }
  return {
    counts: countBySeverity(rows), fixable: countBySeverity(rows.filter((row) => row.fix)), byOrigin,
    vulnerablePackages: scan.packages.length, kevCount: rows.filter((row) => row.kev).length,
  };
}

// Scan dérivé, pour une estimation : celui d'origine moins des origines, des paquets ou des failles.
export function without(scan: Scan, { origins = [], packages = [], cves = [] }: Exclusion = {}): Scan {
  const derived = {
    ...scan,
    packages: scan.packages
      // Une origine ne s'enlève que si le paquet n'a pas d'autre exemplaire ailleurs dans l'image.
      .filter((pkg) => !(origins.length && pkg.origins.every((origin) => origins.includes(origin))))
      .filter((pkg) => !packages.some((name) => name === pkg.name || name === `${pkg.name}@${pkg.version}`))
      .map((pkg) => ({ ...pkg, vulnerabilities: pkg.vulnerabilities.filter((item) => !cves.includes(item.id)) }))
      .filter((pkg) => pkg.vulnerabilities.length),
  };
  return { ...derived, ...summary(derived) };
}

/**
 * Failles disparues, restantes et apparues. Chaque ligne s'apparie d'abord à version égale, puis par nom de paquet (une
 * montée qui n'a pas tout corrigé) : avant = disparues + restantes, après = restantes + apparues.
 */
export function diff(before: Scan, after: Scan) {
  const exact = (row: Row) => `${identity(row)}@${row.pkg.version}`;
  let left = flatten(before);
  let added = flatten(after);
  const remaining: Row[] = [];
  const kept = new Set<Row>();
  for (const key of [exact, identity]) {
    const pool = new Map<string, Row[]>();
    for (const row of left) pool.set(key(row), [...(pool.get(key(row)) ?? []), row]);
    added = added.filter((row) => {
      const match = pool.get(key(row))?.shift();
      if (!match) return true;
      kept.add(match);
      remaining.push(row);
      return false;
    });
    left = left.filter((row) => !kept.has(row));
  }
  const removedKeys = new Set(left.map(exact));
  return { removed: left, added, remaining, has: (row: Row) => !removedKeys.has(exact(row)) };
}

/** Versions d'un paquet dans un scan ; null si le scan n'a pas d'inventaire (fait avant la version 1.2). */
export function versionsIn(scan: Scan, pkg: Pick<Package, 'type' | 'name'>): string[] | null {
  if (!scan.inventory) return null;
  return [...new Set(scan.inventory.filter(([type, name]) => type === pkg.type && name === pkg.name).map(([, , version]) => version))];
}

/** Versions apparues (`after`) et versions qui existaient déjà et restent (`kept`) ; null : scan sans inventaire. */
export interface PackageChange { name: string; type: string; origin: Origin; before: string; after: string[] | null; kept: string[]; removed: Row[] }
/** Failles disparues, regroupées par paquet, avec la version d'après (liste vide : paquet retiré). */
export function fixedPackages(before: Scan, after: Scan): PackageChange[] {
  const groups = new Map<string, PackageChange>();
  for (const row of diff(before, after).removed) {
    const key = `${row.pkg.type} ${row.pkg.name} ${row.pkg.version}`;
    const old = versionsIn(before, row.pkg);
    const now = versionsIn(after, row.pkg);
    const group = groups.get(key) ?? {
      name: row.pkg.name, type: row.pkg.type, origin: row.pkg.origin, before: row.pkg.version, removed: [],
      // Un autre exemplaire déjà présent avant n'est pas la version d'après : celui-ci a été retiré.
      after: old && now ? now.filter((version) => !old.includes(version)) : null,
      kept: old && now ? now.filter((version) => old.includes(version) && version !== row.pkg.version) : [],
    };
    group.removed.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => rank(worst(a.removed)) - rank(worst(b.removed)) || b.removed.length - a.removed.length);
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

/** Version d'après d'un paquet corrigé, en un mot. */
export const afterText = (change: PackageChange | undefined): string | undefined => (!change || change.after === null ? undefined : change.after.length ? change.after.join(', ') : 'retiré');

export const formatCounts = (counts: Counts, { zero = true } = {}) => SEVERITIES
  .filter((severity) => zero ? severity !== 'UNSPECIFIED' || counts[severity] : counts[severity])
  .map((severity) => `${counts[severity]} ${SEVERITY_LETTER[severity]}`).join(' · ') || '0';

export const rank = (severity: Severity) => SEVERITIES.indexOf(severity);
export const worst = (vulnerabilities: Vulnerability[]): Severity => vulnerabilities.reduce<Severity>((found, item) => (rank(item.severity) < rank(found) ? item.severity : found), 'UNSPECIFIED');

// Comparaison de versions à points (semver, PEP 440, versions Go) : suffisante pour un minimum correctif.
export function compareVersions(a: string, b: string): number {
  const split = (version: string) => version.replace(/^v/, '').split(/[.+-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const left = split(a);
  const right = split(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const [x, y] = [left[i] ?? 0, right[i] ?? 0];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return typeof x === 'number' ? 1 : typeof y === 'number' ? -1 : x < y ? -1 : 1;
  }
  return 0;
}

// Ordre des versions de distribution (dpkg, proche pour apk et rpm) : époque, puis suites de chiffres comparées
// comme des nombres, « ~ » avant tout, lettres avant les autres signes.
export function compareDistroVersions(a: string, b: string): number {
  const epoch = (version: string): [number, string] => (/^\d+:/.test(version) ? [Number(version.split(':')[0]), version.slice(version.indexOf(':') + 1)] : [0, version]);
  const [epochA, left] = epoch(a);
  const [epochB, right] = epoch(b);
  if (epochA !== epochB) return epochA - epochB;
  const tokens = (version: string): string[] => version.match(/\d+|\D/g) ?? [];
  const weight = (token: string | undefined) => (token === undefined ? 0 : token === '~' ? -1 : /\d/.test(token) ? 0 : /[a-z]/i.test(token) ? token.charCodeAt(0) : token.charCodeAt(0) + 256);
  const x = tokens(left);
  const y = tokens(right);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const numeric = /\d/.test(x[i] ?? '') && /\d/.test(y[i] ?? '');
    const order = numeric ? Number(x[i]) - Number(y[i]) : weight(x[i]) - weight(y[i]);
    if (order) return order;
    if (!numeric && x[i] !== y[i]) return x[i] === undefined ? -1 : 1;
  }
  return 0;
}

// Version minimale qui corrige toutes les failles corrigeables d'un paquet.
export function fixVersion(pkg: Package): string | null {
  const versions = [...new Set(pkg.vulnerabilities.flatMap((item) => item.fix ?? []))];
  return versions.sort(OS_TYPES.has(pkg.type) ? compareDistroVersions : compareVersions).at(-1) ?? null;
}

export function formatSize(bytes?: number): string {
  return bytes ? `${Math.round(bytes / 1e6)} Mo` : '?';
}

// Commande de build de l'image de production, telle qu'elle se lance depuis la racine du projet.
export function buildCommand(config: Pick<Config, 'image' | 'build' | 'platform'>, tag: string, { pull = true, extra = [] }: { pull?: boolean; extra?: string[] } = {}): string {
  const { context = '.', dockerfile = 'Dockerfile', target, buildArgs = [], secrets = [] } = config.build ?? {};
  const quote = (value: string) => (/[^\w@%+=:,./${}-]/.test(value) ? `'${value}'` : value.includes('$') ? value.replace(/(src|source)=(.*\$.*)$/, '$1="$2"') : value);
  return [
    'docker build', ...(pull ? ['--pull'] : []), ...(config.platform ? [`--platform ${config.platform}`] : []),
    ...(dockerfile !== 'Dockerfile' ? [`--file ${dockerfile}`] : []), ...(target ? [`--target ${target}`] : []),
    ...buildArgs.map((value) => `--build-arg ${quote(value)}`), ...secrets.map((value) => `--secret ${quote(value)}`), ...extra,
    `--tag ${config.image}:${tag}`, context,
  ].join(' ');
}

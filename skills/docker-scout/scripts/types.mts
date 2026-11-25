/** Types partagés : sortie brute de Docker Scout, scan normalisé, configuration et analyse d'un audit. */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSPECIFIED';
export type Origin = 'base-os' | 'base-tools' | 'app-os' | 'app' | 'ci';
export type Counts = Record<Severity, number> & { total: number };

// ---------------------------------------------------------------------------
// Sortie de `docker scout cves --format sbom` (champs utilisés)
// ---------------------------------------------------------------------------

export interface RawLocation { path: string; diff_id?: string }
export interface RawArtifact {
  type: string; namespace?: string; name: string; version: string; purl: string;
  locations?: RawLocation[]; files?: RawLocation[];
}
export interface RawVulnerability {
  source_id: string; original_source_id?: string; description?: string; fixed_by?: string; url?: string; published_at?: string;
  cvss?: { score?: number; severity?: string }; epss?: { score?: number };
}
export interface RawImage {
  digest?: string; size?: number; platform?: { os?: string; architecture?: string; variant?: string }; distro?: { os_name?: string; os_version?: string };
  config?: { created?: string; config?: { User?: string; Env?: string[] }; rootfs?: { diff_ids?: string[] }; history?: { created_by?: string; empty_layer?: boolean }[] };
}
export interface RawScan {
  source?: { type?: string; image?: RawImage; base_image?: { name?: string; tag?: string; digest?: string } };
  attestations?: { payload?: string }[];
  /** Image portant un SBOM d'un autre outil, indexée de nouveau par Scout (lib.mts). */
  reindexed?: boolean;
  artifacts?: RawArtifact[];
  vulnerabilities?: { purl: string; vulnerabilities: RawVulnerability[] }[];
}

// ---------------------------------------------------------------------------
// Scan normalisé (<dir>/scans/<label>.json)
// ---------------------------------------------------------------------------

export interface Vulnerability {
  id: string; advisory?: string; severity: Severity; score: number | null; fix: string | null; epss: number | null; kev?: boolean;
  url?: string; published?: string; summary: string;
}
export interface Package {
  purl: string; type: string; name: string; version: string; origin: Origin; origins: Origin[];
  paths: string[]; pathCount: number; layer: number | null; vulnerabilities: Vulnerability[];
  /** Scan du code source : manifestes qui l'atteignent en production ([] : aucun ; absent : inconnu). */
  usedBy?: string[];
}
/** Une ligne par couple faille × paquet. */
export type Row = Vulnerability & { pkg: Package };
export interface Layer { index: number; diffId: string; instruction: string; fromBase?: boolean }
export interface Base { ref: string; digest?: string; source: 'option' | 'provenance' | 'scout'; counts?: Counts; packages?: number; size?: number }
export interface Policy { id: string; pass: boolean; violations: number; sample: unknown[] }
export interface Health { grade: string; percent: number }
export interface Summary { counts: Counts; fixable: Counts; byOrigin: Partial<Record<Origin, Counts>>; vulnerablePackages: number; kevCount: number }
export interface ScanImage { digest?: string; platform: string; size?: number; distro: string; user: string; created?: string; env?: string[] }
export interface Scan extends Summary {
  label: string; title?: string; ref: string; kind: 'image' | 'fs'; scannedAt: string; scout: string; vex?: string; blindSpot?: string;
  image: ScanImage | null; base: Base | null; packageCount: number; layers: Layer[]; health: Health | null; policies: Policy[] | null; packages: Package[];
  /** Tous les paquets, sains compris : [type, nom, version, origine]. Donne la version d'après d'un paquet corrigé. */
  inventory?: [string, string, string, Origin][];
}
/** Ce qu'une estimation retire d'un scan. */
export interface Exclusion { origins?: Origin[]; packages?: string[]; cves?: string[] }

// ---------------------------------------------------------------------------
// Configuration (scout.json), état des lieux (detect.json), candidates (bases.json)
// ---------------------------------------------------------------------------

export interface BuildConfig { context?: string; dockerfile?: string; target?: string; buildArgs?: string[]; secrets?: string[] }
export interface Config { image: string; root?: string; package?: string; build?: BuildConfig; platform?: string; vex?: { dir?: string; author?: string }; artifact?: string }
export type IssueLevel = 'error' | 'warning' | 'info';
export interface Issue { rule: string; level: IssueLevel; message: string; line?: number; file: string }
export interface Registry { host: string; sources: string[]; details: string[] }
export interface BaseCandidate { ref: string; digest: string; counts: Counts; fixable: Counts; size?: number; packages: number; distro: string; user: string; blindSpot?: string }

// ---------------------------------------------------------------------------
// Analyse rédigée (analysis.json)
// ---------------------------------------------------------------------------

export interface Code { title?: string; lang?: string; text: string }
export interface Table { head: string[]; rows: string[][] }
/** Un scan (mesuré), ou un scan privé d'une partie de ses failles (estimé). */
export interface Scenario { label: string; note?: string; scan?: string; from?: string; without?: Exclusion }
export interface Gain { from: string; to?: string; without?: Exclusion }
export interface ActionPackage { name: string; version?: string; by?: string; fix: string }
export interface Finding { title: string; level?: IssueLevel | 'ok'; body: string; table?: Table }
export interface Action { title: string; status?: 'todo' | 'done' | 'accepted'; body: string; gain?: Gain; packages?: ActionPackage[]; table?: Table; code?: Code[] }
/** Ce qui a été contrôlé sur les corrections, avant de les dire livrables. */
export interface Check { name: string; status: 'pass' | 'todo' | 'fail'; note?: string }
/** change.json, écrit par change.mts : la branche ou la PR qui porte les corrections. */
export interface ChangeFile { path: string; added: number; removed: number; patch?: string }
export interface PullRequest { number: number; title: string; url: string; state: 'OPEN' | 'CLOSED' | 'MERGED'; isDraft: boolean; checks: { name: string; status: string }[] }
export interface Change { base: string; head: string; headCommit: string; collectedAt: string; commits: { hash: string; subject: string }[]; files: ChangeFile[]; pr: PullRequest | null }
export interface Step { title: string; body?: string; code?: Code[] }
export interface SecretNote { name: string; kind: 'secret' | 'variable'; why: string }
export interface Analysis {
  title: string; pageTitle: string; lead: string; context?: [string, string][]; reference: string; target?: string; source?: string;
  scenarios?: Scenario[]; originNotes?: Partial<Record<Origin, string>>; findings?: Finding[]; actions?: Action[];
  /** Contrôles passés sur les corrections, et raisons de ce qui reste (nom de paquet → raison). */
  checks?: Check[]; remaining?: Record<string, string>;
  dockerfile?: { intro?: string; fixed?: string[]; notes?: Record<string, string> };
  build?: Step[]; ci?: { intro?: string; workflow?: string; steps?: Step[]; secrets?: SecretNote[] };
}

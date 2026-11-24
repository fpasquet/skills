#!/usr/bin/env node
/**
 * Analyse une image (ou un dossier) avec Docker Scout et garde un scan normalisé dans l'espace de travail.
 *
 *   node scan.mts <dir> <label> <ref> [options]
 *
 *   <dir>    espace de travail (.docker-scout) ; le scan est écrit dans <dir>/scans/<label>.json
 *   <label>  nom du scan : current, base-updated, final, source…
 *   <ref>    image du daemon local (api:scout), registry://…, archive://image.tar, ou fs://. pour le code source
 *
 *   --title <texte>      nom lisible dans le rapport
 *   --base <ref>         image de base (défaut : celle de l'attestation de provenance du build ; none : ne pas chercher)
 *   --platform <p>       plateforme à analyser (linux/amd64, linux/arm64)
 *   --vex <chemin>       dossier ou fichier de VEX (défaut : celui de scout.json) ; --vex none pour les ignorer
 *   --no-policies        ne pas évaluer les politiques
 *   --no-export          fs:// : analyser le dossier tel quel, dépendances installées comprises
 *
 * Un dossier suivi par git (fs://) est d'abord exporté sans ses fichiers ignorés : Scout lirait sinon node_modules,
 * .terraform… c'est-à-dire les outils du poste. Les lockfiles à plusieurs documents YAML (pnpm 11 et plus) sont
 * séparés, car Scout ne lit que le premier.
 *
 * Sortie : un résumé d'une page. Le détail se lit avec list.mts, jamais en ouvrant le JSON.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ORIGINS, fail, fixVersion, formatCounts, formatSize, isFileSystem, loadConfig, normalize, parseArgs, provenanceBases,
  rank, run, scoutCves, scoutPolicies, scoutVersion, withScheme, worst, writeJson,
} from './lib.mts';
import { productionOf } from './lockfile.mts';
import type { Base, Origin, RawScan } from './types.mts';

const options = parseArgs(process.argv.slice(2), { flags: ['no-policies', 'no-export'] });
const [dir, label, target] = options.positionals;
if (!dir || !label || !target) throw fail('usage : node scan.mts <dir> <label> <ref> [--base <ref|none>] [--platform <p>] [--vex <chemin|none>] [--title <texte>]');
if (!/^[a-z0-9][a-z0-9-]*$/.test(label)) fail(`label « ${label} » : minuscules, chiffres et tirets seulement.`);
const config = loadConfig(dir);
const ref = withScheme(target, 'local');
const platform = options.values.platform ?? config.platform;
const scout = scoutVersion();

// Les exceptions VEX se jugent à leur auteur : sans --vex-author, Scout n'accepte que celles de docker.com.
const vexSetting = options.values.vex ?? config.vex?.dir;
const vexDir = vexSetting && vexSetting !== 'none' ? resolve(dir, options.values.vex ? process.cwd() : config.root ?? '..', vexSetting) : null;
const vex = vexDir && existsSync(vexDir) && !isFileSystem(ref) ? ['--vex-location', vexDir, '--vex-author', config.vex?.author ?? '.*'] : [];

const notes: string[] = [];

// Copie des fichiers suivis (ou nouveaux et non ignorés) dans un dossier temporaire.
function exportSource(path: string): string | null {
  const listing = run('git', ['-C', path, 'ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (listing.status !== 0) return null;
  const folder = mkdtempSync(join(tmpdir(), 'docker-scout-source-'));
  for (const name of listing.stdout.split('\0').filter(Boolean)) {
    const file = join(path, name);
    const stat = existsSync(file) ? lstatSync(file) : null;
    if (!stat?.isFile() || stat.size > 50e6) continue;
    mkdirSync(dirname(join(folder, name)), { recursive: true });
    cpSync(file, join(folder, name));
    if (basename(name) !== 'pnpm-lock.yaml') continue;
    const documents = readFileSync(file, 'utf8').split(/^---\s*$/m).filter((text) => text.trim());
    documents.forEach((text, index) => {
      const part = index === documents.length - 1 ? name : join(dirname(name), `.pnpm-document-${index + 1}`, 'pnpm-lock.yaml');
      mkdirSync(dirname(join(folder, part)), { recursive: true });
      writeFileSync(join(folder, part), text.trimStart());
    });
  }
  return folder;
}

const sourcePath = isFileSystem(ref) && !options.flags['no-export'] ? resolve(ref.replace('fs://', '')) : null;
const exported = sourcePath && existsSync(sourcePath) && lstatSync(sourcePath).isDirectory() ? exportSource(sourcePath) : null;
if (sourcePath && !exported) notes.push('dossier hors de git : dépendances installées et fichiers locaux sont analysés avec le code.');
process.on('exit', () => { if (exported) rmSync(exported, { recursive: true, force: true }); });
const scanned = exported ? `fs://${exported}` : ref;

console.error(`Analyse de ${ref}${exported ? ' (fichiers suivis par git)' : ''}…`);
const raw = scoutCves(scanned, { platform, extra: vex });
const kevRaw = scoutCves(scanned, { platform, extra: ['--only-cisa-kev', ...vex] });
if (exported) {
  // Un lockfile que Scout ne sait pas lire donne zéro faille : le dire.
  const counts = new Map<string, number>();
  for (const artifact of raw.artifacts ?? []) for (const location of artifact.locations ?? []) counts.set(location.path, (counts.get(location.path) ?? 0) + 1);
  const tracked = run('git', ['-C', sourcePath ?? '.', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).stdout.split('\0');
  const unread = tracked.filter((name) => /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|bun\.lockb|poetry\.lock|uv\.lock|Pipfile\.lock|requirements\.txt|go\.mod|Cargo\.lock|composer\.lock|Gemfile\.lock|packages\.lock\.json|pom\.xml)$/.test(name) && existsSync(join(exported, name)) && lstatSync(join(exported, name)).size > 500 && !counts.has(`/${name}`));
  if (unread.length) notes.push(`lockfile(s) non lus par Scout : ${unread.slice(0, 6).join(', ')}${unread.length > 6 ? ` (+${unread.length - 6})` : ''}. Leurs dépendances ne sont pas comptées ; compléter avec l'audit du gestionnaire de paquets.`);
}
const kev = new Set((kevRaw.vulnerabilities ?? []).flatMap((entry) => entry.vulnerabilities.map((item) => item.source_id)));

let base: Base | null = null;
let rawBase: RawScan | null = null;
if (!isFileSystem(ref) && options.values.base !== 'none') {
  const found = provenanceBases(raw);
  if (options.values.base) base = { ref: options.values.base, source: 'option' };
  else if (found.length) {
    // Plusieurs images dans un build multi-étapes : celle de l'étape finale est la dernière dont les couches ouvrent l'image.
    const layers = raw.source?.image?.config?.rootfs?.diff_ids ?? [];
    for (const candidate of found) {
      const candidateRef = `${candidate.name}@${candidate.digest}`;
      const candidateRaw = found.length === 1 ? null : scoutCves(withScheme(candidateRef, 'image'), { platform });
      const ids = candidateRaw?.source?.image?.config?.rootfs?.diff_ids ?? [];
      if (found.length > 1 && !(ids.length && ids.every((id, index) => layers[index] === id))) continue;
      base = { ref: candidate.tag ? `${candidate.name}:${candidate.tag}` : candidate.name, digest: candidate.digest, source: 'provenance' };
      rawBase = candidateRaw;
    }
  }
  if (!base && raw.source?.base_image?.name) {
    const scoutBase = raw.source.base_image;
    base = { ref: scoutBase.tag ? `${scoutBase.name}:${scoutBase.tag}` : scoutBase.name ?? '', digest: scoutBase.digest, source: 'scout' };
  }
  if (base && !rawBase) {
    const baseRef = base.source === 'provenance' ? `${base.ref.replace(/:[^:/]+$/, '')}@${base.digest}` : base.ref;
    console.error(`Analyse de l'image de base ${baseRef}…`);
    rawBase = scoutCves(withScheme(baseRef, 'image'), { platform });
    base.digest ??= rawBase.source?.image?.digest;
  }
  if (!base) notes.push('image de base inconnue : origine des paquets déduite de leur type et de leur chemin. Passer --base <ref> pour une origine exacte.');
}

const policies = isFileSystem(ref) || options.flags['no-policies'] ? null : scoutPolicies(ref, { platform });
const scan = normalize(raw, { label, ref: target, title: options.values.title, scout, base, rawBase, kev, policies });
if (vex.length) scan.vex = vexSetting;
const production = exported ? productionOf(exported) : null;
if (production) for (const pkg of scan.packages) if (pkg.type === 'npm') pkg.usedBy = production.get(`${pkg.name}@${pkg.version}`) ?? [];
if (base && !scan.layers.some((layer) => layer.fromBase)) notes.push(`aucune couche de ${base.ref} dans l'image : mauvaise image de base, ou base mise à jour depuis le build. Reconstruire avec --pull, ou préciser --base.`);

const folder = join(resolve(dir), 'scans');
mkdirSync(folder, { recursive: true });
const path = join(folder, `${label}.json`);
writeJson(path, scan);

// ---------------------------------------------------------------------------
// Résumé
// ---------------------------------------------------------------------------
const line = (name: string, value: string) => console.log(`${name.padEnd(22)}${value}`);
line('Scan', `${label} (${target}) → ${path}`);
if (scan.image) line('Image', `${scan.image.digest?.slice(7, 19)} · ${scan.image.platform} · ${formatSize(scan.image.size)} · ${scan.image.distro} · utilisateur ${scan.image.user}`);
if (scan.base) line('Image de base', `${scan.base.ref} (${scan.base.digest?.slice(7, 19)}, ${scan.base.source})${scan.base.counts ? ` : ${formatCounts(scan.base.counts)} à elle seule` : ''}`);
line('Failles', `${scan.counts.total} (${formatCounts(scan.counts)}) sur ${scan.vulnerablePackages} des ${scan.packageCount} paquets`);
line('Corrigeables', `${scan.fixable.total} (${formatCounts(scan.fixable)})`);
if (scan.blindSpot) notes.push(`${scan.blindSpot}. Ne pas comparer ce total à celui d'une autre image.`);
if (scan.kevCount) line('Exploitées (CISA KEV)', `${scan.kevCount} : ${[...kev].slice(0, 6).join(', ')}`);
if (scan.health) line('Health score', `${scan.health.grade} (${scan.health.percent} %)`);
if (scan.policies) line('Politiques à traiter', scan.policies.filter((policy) => !policy.pass).map((policy) => `${policy.id} (${policy.violations})`).join(', ') || 'aucune');
for (const [origin, counts] of Object.entries(scan.byOrigin) as [Origin, NonNullable<(typeof scan.byOrigin)[Origin]>][]) line(`  ${origin}`, `${counts.total} (${formatCounts(counts)}) · ${ORIGINS[origin]}`);
if (production) {
  const used = scan.packages.filter((pkg) => pkg.usedBy?.length);
  line('En production', `${used.flatMap((pkg) => pkg.vulnerabilities).length} failles sur ${used.length} paquets, d'après le lockfile (le reste : développement, tests, CI)`);
}
if (scan.packages.length) console.log('\nPaquets à traiter en premier (list.mts pour la suite) :');
const top = [...scan.packages].map((pkg) => ({ pkg, severity: worst(pkg.vulnerabilities) }))
  .sort((a, b) => rank(a.severity) - rank(b.severity) || b.pkg.vulnerabilities.length - a.pkg.vulnerabilities.length).slice(0, 12);
for (const { pkg, severity } of top) {
  console.log(`  ${severity.padEnd(11)} ${String(pkg.vulnerabilities.length).padStart(3)} × ${pkg.name} ${pkg.version} [${pkg.origin}] → ${fixVersion(pkg) ?? 'pas de correctif'}`);
}
for (const note of notes) console.log(`\nAttention : ${note}`);

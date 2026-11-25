#!/usr/bin/env node
/**
 * Compare des images de base candidates : failles, taille, distribution. `docker scout recommendations` ne
 * propose souvent rien (miroir, image durcie, digest) : ici on mesure chaque candidate.
 *
 *   node bases.mts <ref> <ref>… [--platform linux/amd64] [--out <dir>/bases.json]
 *
 * Exemple : node bases.mts node:24-slim node:24-trixie-slim node:24-alpine gcr.io/distroless/nodejs24-debian13
 */
import { blindSpot, fail, flattenRaw, countBySeverity, formatCounts, formatSize, parseArgs, run, scoutVersion, tryScoutCves, withScheme, writeJson } from './lib.mts';
import type { BaseCandidate } from './types.mts';

const options = parseArgs(process.argv.slice(2));
if (!options.positionals.length) fail('usage : node bases.mts <ref> <ref>… [--platform linux/amd64] [--out <fichier>]');
scoutVersion();
const rows: BaseCandidate[] = [];
for (const ref of options.positionals) {
  // Une candidate inaccessible (registre privé, tag absent) n'arrête pas les autres.
  const reachable = run('docker', ['buildx', 'imagetools', 'inspect', ref, '--format', '{{.Manifest.Digest}}']);
  if (reachable.status !== 0) {
    console.error(`  ${ref} : inaccessible (${reachable.stderr.trim().split('\n').at(-1)})`);
    continue;
  }
  console.error(`Analyse de ${ref}…`);
  const raw = tryScoutCves(withScheme(ref, 'registry'), options.values.platform);
  if (!raw) {
    console.error(`  ${ref} : analyse impossible (connexion au registre, plateforme ?)`);
    continue;
  }
  const found = flattenRaw(raw);
  const image = raw.source?.image;
  rows.push({
    ref, digest: reachable.stdout.trim().replace(/^"|"$/g, ''), counts: countBySeverity(found), fixable: countBySeverity(found.filter((item) => item.fix)),
    size: image?.size, packages: raw.artifacts?.length ?? 0, distro: [image?.distro?.os_name, image?.distro?.os_version].filter(Boolean).join(' '), user: image?.config?.config?.User || 'root', blindSpot: blindSpot(raw),
  });
}
rows.sort((a, b) => Number(Boolean(a.blindSpot)) - Number(Boolean(b.blindSpot)) || a.counts.CRITICAL - b.counts.CRITICAL || a.counts.HIGH - b.counts.HIGH || a.counts.total - b.counts.total);
const width = Math.max(10, ...rows.map((row) => row.ref.length)) + 2;
console.log(`${'Image'.padEnd(width)}${'Failles'.padEnd(34)}${'Corrigeables'.padEnd(14)}${'Taille'.padEnd(9)}${'Paquets'.padEnd(9)}${'Système'.padEnd(14)}Utilisateur`);
for (const row of rows) {
  console.log(`${row.ref.padEnd(width)}${`${row.counts.total} (${formatCounts(row.counts)})`.padEnd(34)}${String(row.fixable.total).padEnd(14)}${formatSize(row.size).padEnd(9)}${String(row.packages).padEnd(9)}${row.distro.padEnd(14)}${row.user}${row.blindSpot ? '  (incomplet)' : ''}`);
}
for (const row of rows.filter((item) => item.blindSpot)) console.log(`\nAttention, ${row.ref} : ${row.blindSpot}.`);
for (const row of rows) console.log(`\n${row.ref}@${row.digest}`);
if (options.values.out) writeJson(options.values.out, { scannedAt: new Date().toISOString(), bases: rows });

#!/usr/bin/env node
/**
 * Compare deux scans : failles disparues, restantes et apparues. Mesure l'effet d'une correction.
 *
 *   node compare.mts <dir>:<avant> <dir>:<après> [--severity critical,high] [--remaining] [--strict]
 *
 *   --remaining           liste aussi les failles restantes (les nouvelles sont toujours listées)
 *   --strict              code de sortie 1 si une faille est apparue
 */
import { ORIGINS, countBySeverity, diff, fail, formatCounts, formatSize, loadScan, parseArgs, rank } from './lib.mts';
import type { Origin, Row } from './types.mts';

const options = parseArgs(process.argv.slice(2), { flags: ['remaining', 'strict'] });
const [from, to] = options.positionals;
if (!from || !to) throw fail('usage : node compare.mts <dir>:<avant> <dir>:<après>');
const before = loadScan(from);
const after = loadScan(to);
const severities = options.values.severity?.toUpperCase().split(',');
const keep = (rows: Row[]) => rows.filter((row) => !severities || severities.includes(row.severity))
  .sort((a, b) => rank(a.severity) - rank(b.severity) || a.pkg.name.localeCompare(b.pkg.name));
const result = diff(before, after);
const removed = keep(result.removed);
const added = keep(result.added);
const remaining = keep(result.remaining);

const row = (name: string, rows: Row[]) => console.log(`${name.padEnd(12)}${String(rows.length).padStart(4)}  (${formatCounts(countBySeverity(rows))})`);
console.log(`${before.label} → ${after.label}`);
console.log(`Total       ${before.counts.total} (${formatCounts(before.counts)}) → ${after.counts.total} (${formatCounts(after.counts)})`);
if (before.image && after.image) console.log(`Taille      ${formatSize(before.image.size)} → ${formatSize(after.image.size)}, paquets ${before.packageCount} → ${after.packageCount}`);
row('Disparues', removed);
row('Restantes', remaining);
row('Apparues', added);
for (const origin of Object.keys(ORIGINS) as Origin[]) {
  const [x, y] = [before.byOrigin[origin]?.total ?? 0, after.byOrigin[origin]?.total ?? 0];
  if (x || y) console.log(`  ${origin.padEnd(12)}${x} → ${y}`);
}
const print = (title: string, rows: Row[]) => {
  if (!rows.length) return;
  console.log(`\n${title}`);
  for (const item of rows.slice(0, 60)) console.log(`  ${item.severity.padEnd(11)} ${item.id} ${item.pkg.name} ${item.pkg.version} [${item.pkg.origin}] → ${item.fix ?? 'pas de correctif'}`);
  if (rows.length > 60) console.log(`  … ${rows.length - 60} de plus`);
};
print('Apparues', added);
if (options.flags.remaining) print('Restantes', remaining);
process.exit(options.flags.strict && added.length ? 1 : 0);

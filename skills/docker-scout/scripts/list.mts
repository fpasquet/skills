#!/usr/bin/env node
/**
 * Liste les paquets vulnérables d'un scan, filtrés. À utiliser à la place de la lecture du JSON.
 *
 *   node list.mts <dir>:<label> [--origin app] [--severity critical,high] [--type npm] [--package lodash] [--cve CVE-…]
 *                 [--fixable | --unfixed] [--kev] [--cves] [--limit 40] [--json]
 *
 *   --cves   une ligne par faille (identifiant, score, EPSS, correctif) sous chaque paquet
 */
import { fail, fixVersion, formatCounts, countBySeverity, loadScan, parseArgs, rank, worst } from './lib.mts';

const options = parseArgs(process.argv.slice(2), { flags: ['fixable', 'unfixed', 'kev', 'cves', 'json'] });
const [ref] = options.positionals;
if (!ref) throw fail('usage : node list.mts <dir>:<label> [filtres] (voir l’en-tête du script)');
const scan = loadScan(ref);
const severities = options.values.severity?.toUpperCase().split(',');
const packages = scan.packages
  .filter((pkg) => !options.values.origin || options.values.origin.split(',').includes(pkg.origin))
  .filter((pkg) => !options.values.type || pkg.type === options.values.type)
  .filter((pkg) => !options.values.package || pkg.name.includes(options.values.package))
  .map((pkg) => ({
    ...pkg,
    vulnerabilities: pkg.vulnerabilities
      .filter((item) => !severities || severities.includes(item.severity))
      .filter((item) => !options.values.cve || item.id === options.values.cve || item.advisory === options.values.cve)
      .filter((item) => !options.flags.fixable || item.fix).filter((item) => !options.flags.unfixed || !item.fix).filter((item) => !options.flags.kev || item.kev)
      .sort((a, b) => rank(a.severity) - rank(b.severity) || (b.score ?? 0) - (a.score ?? 0)),
  }))
  .filter((pkg) => pkg.vulnerabilities.length)
  .sort((a, b) => rank(worst(a.vulnerabilities)) - rank(worst(b.vulnerabilities)) || b.vulnerabilities.length - a.vulnerabilities.length || a.name.localeCompare(b.name));

if (options.flags.json) {
  console.log(JSON.stringify(packages, null, 1));
  process.exit(0);
}
const limit = Number(options.values.limit ?? 40) || Infinity;
const all = packages.flatMap((pkg) => pkg.vulnerabilities);
console.log(`${all.length} faille(s) (${formatCounts(countBySeverity(all))}) sur ${packages.length} paquet(s)`);
for (const pkg of packages.slice(0, limit)) {
  const origins = pkg.origins.length > 1 ? pkg.origins.join('+') : pkg.origin;
  console.log(`\n${pkg.name} ${pkg.version} [${pkg.type}, ${origins}] ${formatCounts(countBySeverity(pkg.vulnerabilities), { zero: false })} → ${fixVersion(pkg) ?? 'pas de correctif'}`);
  if (pkg.paths.length && !pkg.origin.endsWith('-os')) console.log(`  ${pkg.paths.slice(0, 2).join(', ')}${pkg.pathCount > 2 ? ` (+${pkg.pathCount - 2})` : ''}`);
  if (pkg.origin === 'app-os' && pkg.layer !== null) console.log(`  ${scan.layers[pkg.layer]?.instruction.slice(0, 140)}`);
  if (pkg.usedBy) console.log(`  production : ${pkg.usedBy.join(', ') || 'non (développement, tests ou CI)'}`);
  if (options.flags.cves || options.values.cve) {
    for (const item of pkg.vulnerabilities) {
      console.log(`  ${item.severity.padEnd(11)} ${item.id}${item.kev ? ' KEV' : ''} · CVSS ${item.score ?? '?'} · EPSS ${item.epss === null ? '?' : `${(item.epss * 100).toFixed(1)} %`} · ${item.fix ?? 'pas de correctif'} · ${item.summary}`);
    }
  }
}
if (packages.length > limit) console.log(`\n… ${packages.length - limit} paquet(s) de plus (--limit 0 pour tout voir)`);

#!/usr/bin/env node
/**
 * Exceptions VEX (OpenVEX) : failles jugées non exploitables, écartées des analyses avec leur justification.
 *
 *   node vex.mts <dir> list
 *   node vex.mts <dir> add --cve CVE-… --scan current --package lodash --justification vulnerable_code_not_in_execute_path
 *                          --reason "…" [--author securite@exemple.fr] [--registry-image ghcr.io/acme/api]
 *
 *   --scan, --package   paquet touché, lu dans un scan : l'exception vise sa version exacte et tombe à la montée de version
 *   --author            auteur de l'exception, noté dans scout.json ; Scout ne lit que les auteurs demandés (--vex-author)
 *   --registry-image    image publiée à viser aussi, en plus de l'image locale
 *
 * Justifications : component_not_present, vulnerable_code_not_present, vulnerable_code_not_in_execute_path,
 * vulnerable_code_cannot_be_controlled_by_adversary, inline_mitigations_already_exist.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG_FILE, fail, loadConfig, loadScan, parseArgs, readJson, writeJson } from './lib.mts';

interface Product { '@id': string; subcomponents?: { '@id': string }[] }
interface Statement { vulnerability: { name: string }; timestamp: string; products: Product[]; status: string; justification: string; impact_statement: string }
interface Document { '@context': string; '@id': string; author: string; timestamp: string; version: number; statements: Statement[] }

const JUSTIFICATIONS = ['component_not_present', 'vulnerable_code_not_present', 'vulnerable_code_not_in_execute_path', 'vulnerable_code_cannot_be_controlled_by_adversary', 'inline_mitigations_already_exist'];
const options = parseArgs(process.argv.slice(2));
const [dir, action] = options.positionals;
if (!dir || !['add', 'list'].includes(action)) throw fail('usage : node vex.mts <dir> add|list … (voir l’en-tête du script)');
const config = loadConfig(dir);
if (!config.image) throw fail(`${CONFIG_FILE} absent de ${dir} : lancer init.mts.`);
const folder = resolve(dir, config.root ?? '..', config.vex?.dir ?? '.vex');
const path = join(folder, `${config.image.replace(/[^\w.-]+/g, '-')}.openvex.json`);
const document = readJson<Document | null>(path, null);

if (action === 'list') {
  if (!document?.statements.length) console.log('Aucune exception.');
  for (const statement of document?.statements ?? []) {
    console.log(`${statement.timestamp.slice(0, 10)} ${statement.vulnerability.name} ${statement.products[0]?.subcomponents?.[0]?.['@id'] ?? ''}\n  ${statement.justification} : ${statement.impact_statement}`);
  }
  process.exit(0);
}

const { cve, justification = '', reason } = options.values;
const author = options.values.author ?? config.vex?.author;
if (!cve || !options.values.package || !reason) throw fail('--cve, --package et --reason sont obligatoires.');
if (!author) throw fail('--author obligatoire à la première exception (adresse de l’équipe, pas d’une personne).');
if (!JUSTIFICATIONS.includes(justification)) throw fail(`--justification : ${JUSTIFICATIONS.join(', ')}`);
const scan = loadScan(`${dir}:${options.values.scan ?? 'current'}`);
const packages = scan.packages.filter((pkg) => pkg.name === options.values.package && pkg.vulnerabilities.some((item) => item.id === cve));
if (!packages.length) throw fail(`${cve} n’est pas signalée sur ${options.values.package} dans le scan ${scan.label}.`);

// Une image d'un registre s'écrit avec repository_url ; sans étiquette, l'exception vaut pour toutes les versions.
const productId = (image: string) => {
  const [host, ...rest] = image.split('/');
  return rest.length && /[.:]/.test(host) ? `pkg:docker/${rest.join('/')}?repository_url=${host}` : `pkg:docker/${image}`;
};
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const subcomponents = packages.map((pkg) => ({ '@id': pkg.purl }));
const statement: Statement = {
  vulnerability: { name: cve }, timestamp: now,
  products: [config.image, options.values['registry-image']].flatMap((image) => (image ? { '@id': productId(image), subcomponents } : [])),
  status: 'not_affected', justification, impact_statement: reason,
};
const kept = (document?.statements ?? []).filter((item) => item.vulnerability.name !== cve || !item.products.some((product) => product.subcomponents?.some((sub) => subcomponents.some((own) => own['@id'] === sub['@id']))));
mkdirSync(folder, { recursive: true });
writeJson(path, {
  '@context': 'https://openvex.dev/ns/v0.2.0', '@id': document?.['@id'] ?? `https://openvex.dev/docs/${config.image}/${now.slice(0, 10)}`,
  author, timestamp: now, version: (document?.version ?? 0) + 1, statements: [...kept, statement],
} satisfies Document);
writeJson(join(resolve(dir), CONFIG_FILE), { ...config, vex: { dir: config.vex?.dir ?? '.vex', author } });
console.log(`${cve} écartée pour ${subcomponents.map((item) => item['@id']).join(', ')} → ${path}`);
console.log('Relancer scan.mts pour vérifier qu’elle disparaît.');

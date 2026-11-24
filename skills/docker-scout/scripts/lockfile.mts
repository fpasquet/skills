/**
 * Dépendances de production lues dans un lockfile (pnpm 9 et plus, npm 7 et plus), par manifeste du dépôt.
 *
 * Une image ne montre à Scout que les paquets présents dans node_modules : ce qu'un bundler a compilé (interface web,
 * API en un fichier) part en production sans y être vu. Le lockfile, lui, le connaît.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

/** `nom@version` → manifestes (`apps/web`, `.`) qui l'atteignent par leurs dépendances de production. */
export type Production = Map<string, string[]>;

// Clé de pnpm : '@scope/nom@1.2.3(pair@4.5.6)' → nom@version.
const bare = (key: string) => key.replace(/\(.*$/, '');

/** Lecture ligne à ligne du YAML très régulier de pnpm : sections, entrées à deux espaces, dépendances en dessous. */
function readPnpm(text: string) {
  const importers = new Map<string, Map<string, string>>();
  const snapshots = new Map<string, string[]>();
  let section = '';
  let entry = '';
  let group = '';
  let name = '';
  const unquote = (value: string) => value.trim().replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
  for (const line of text.split('\n')) {
    const match = line.match(/^( *)('[^']+'|"[^"]+"|[^\s:'"][^:]*|[^\s:'"].*?):(?: (.*))?$/);
    if (!match) continue;
    const [, indent, rawKey, rawValue] = match;
    const key = unquote(rawKey);
    const value = rawValue === undefined ? '' : unquote(rawValue);
    if (indent.length === 0) section = key;
    else if (indent.length === 2) {
      entry = key;
      group = '';
      if (section === 'importers') importers.set(entry, new Map());
      if (section === 'snapshots') snapshots.set(entry, []);
    } else if (indent.length === 4) group = key;
    else if (section === 'importers' && indent.length === 6) name = key;
    else if (section === 'importers' && indent.length === 8 && key === 'version' && (group === 'dependencies' || group === 'optionalDependencies')) importers.get(entry)?.set(name, value);
    else if (section === 'snapshots' && indent.length === 6 && (group === 'dependencies' || group === 'optionalDependencies')) snapshots.get(entry)?.push(`${key}@${value}`);
  }
  return { importers, snapshots };
}

function pnpmProduction(text: string): Production {
  const { importers, snapshots } = readPnpm(text);
  const result: Production = new Map();
  for (const importer of importers.keys()) {
    const seen = new Set<string>();
    const visited = new Set<string>();
    const queue: string[] = [];
    const visitImporter = (path: string) => {
      if (visited.has(path)) return;
      visited.add(path);
      for (const [name, version] of importers.get(path) ?? []) {
        // Paquet du monorepo : ses dépendances de production comptent aussi.
        if (version.startsWith('link:')) visitImporter(posix.normalize(posix.join(path, version.slice(5))));
        else queue.push(`${name}@${version}`);
      }
    };
    visitImporter(importer);
    for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
      // Un alias (npm:) porte déjà son nom réel dans la version.
      const real = snapshots.has(key) ? key : key.replace(/^(@?[^@]+)@((?:@[^/]+\/)?[^@]+@.+)$/, '$2');
      if (seen.has(real)) continue;
      seen.add(real);
      queue.push(...(snapshots.get(real) ?? []));
    }
    for (const key of seen) result.set(bare(key), [...(result.get(bare(key)) ?? []), importer]);
  }
  return result;
}

interface NpmLock { packages?: Record<string, { version?: string; dev?: boolean; link?: boolean; name?: string }> }
function npmProduction(text: string): Production {
  const result: Production = new Map();
  for (const [path, item] of Object.entries((JSON.parse(text) as NpmLock).packages ?? {})) {
    const name = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)$/)?.[1];
    if (name && item.version && !item.dev && !item.link) result.set(`${item.name ?? name}@${item.version}`, ['.']);
  }
  return result;
}

/** null : aucun lockfile lisible, l'usage en production est inconnu. */
export function productionOf(root: string): Production | null {
  const pnpm = join(root, 'pnpm-lock.yaml');
  if (existsSync(pnpm)) {
    const documents = readFileSync(pnpm, 'utf8').split(/^---\s*$/m).filter((text) => text.trim());
    return pnpmProduction(documents.at(-1) ?? '');
  }
  const npm = ['package-lock.json', 'npm-shrinkwrap.json'].map((name) => join(root, name)).find((path) => existsSync(path));
  return npm ? npmProduction(readFileSync(npm, 'utf8')) : null;
}

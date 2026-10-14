/**
 * Configuration du dossier du cahier des charges, partagée par les scripts du skill.
 *
 * requirements.json : { "title", "output", "specs", "prototype", "code", "artifacts": { "specs", "prototype", "requirements" } }
 * Un dossier créé avant la version 2.0 (cdc.json, artifacts.cdc) est lu tel quel.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const CONFIG_FILE = 'requirements.json';
const LEGACY_CONFIG_FILE = 'cdc.json';

export function configPath(root) {
  if (existsSync(join(root, CONFIG_FILE))) return join(root, CONFIG_FILE);
  if (existsSync(join(root, LEGACY_CONFIG_FILE))) return join(root, LEGACY_CONFIG_FILE);
  return null;
}

export function loadConfig(root) {
  const path = configPath(root);
  const config = path ? JSON.parse(readFileSync(path, 'utf8')) : {};
  config.artifacts ??= {};
  config.artifacts.requirements ??= config.artifacts.cdc ?? '';
  return config;
}

// Specs : chemin de la configuration, sinon ../ui (disposition specs/), sinon ../specs-ui (disposition 1.x)
export function specsDirOf(root, config) {
  if (config.specs) return resolve(root, config.specs);
  return [resolve(root, '../ui'), resolve(root, '../specs-ui')].find((dir) => existsSync(join(dir, 'sources', 'site.json'))) ?? resolve(root, '../ui');
}

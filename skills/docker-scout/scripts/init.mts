#!/usr/bin/env node
/**
 * Crée l'espace de travail d'un audit, sans écraser un fichier existant.
 *
 *   node init.mts <dir> --image <nom> [--root <app>] [--dockerfile Dockerfile] [--context .] [--target production]
 *                 [--platform linux/amd64] [--package apps/api] [--build-arg MIRROR=]… [--secret id=npmrc,src=$HOME/.npmrc]…
 *
 *   --package   dossier du manifeste de l'application dans un monorepo (ses dépendances de production)
 *   <dir>   .docker-scout, ou .docker-scout/<image> quand le dépôt construit plusieurs images
 *
 * Écrit scout.json (build, artifact, politique), SCOUT.md (mémoire), analysis.json (rapport à remplir) et
 * .gitignore (scans et rapport restent hors du dépôt : ils listent des failles ouvertes). Dans .docker-scout/<image>, il
 * écrit aussi .docker-scout/overview.json, pour la page commune (overview.mts).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE, buildCommand, fail, parseArgs, writeJson } from './lib.mts';
import type { Config } from './types.mts';

const options = parseArgs(process.argv.slice(2), { multi: ['build-arg', 'secret'] });
const [input] = options.positionals;
const image = options.values.image;
if (!input || !image) throw fail('usage : node init.mts <dir> --image <nom> [--target …] [--dockerfile …] (voir l’en-tête du script)');
const dir = resolve(input);
const root = resolve(options.values.root ?? '.');
const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
mkdirSync(join(dir, 'scans'), { recursive: true });

const build = {
  context: options.values.context ?? '.',
  dockerfile: options.values.dockerfile ?? 'Dockerfile',
  target: options.values.target ?? '',
  buildArgs: options.lists['build-arg'] ?? [],
  // Emplacement du secret sur le poste (id=…,src=… ou id=…,env=…), jamais sa valeur.
  secrets: options.lists.secret ?? [],
};
const config: Config = {
  image,
  root: relative(dir, root) || '.',
  package: options.values.package ?? '',
  build,
  platform: options.values.platform ?? '',
  vex: { dir: '.vex', author: '' },
  artifact: '',
};
for (const secret of build.secrets) {
  if (!/^id=[\w.-]+,(src|source|env)=/.test(secret)) fail(`--secret ${secret.split('=')[0]} : attendu id=<nom>,src=<fichier> ou id=<nom>,env=<variable>, jamais la valeur du secret.`);
}

const put = (name: string, write: (path: string) => void) => {
  const path = join(dir, name);
  if (existsSync(path)) {
    console.log(`gardé   ${relative(process.cwd(), path)}`);
    return;
  }
  write(path);
  console.log(`écrit   ${relative(process.cwd(), path)}`);
};
put(CONFIG_FILE, (path) => writeJson(path, config));
put('.gitignore', (path) => writeFileSync(path, 'scans/\nreport.html\ndetect.json\nbases.json\nchange.json\n'));
put('analysis.json', (path) => copyFileSync(join(templates, 'analysis.json'), path));
put('SCOUT.md', (path) => writeFileSync(path, readFileSync(join(templates, 'memory.md'), 'utf8')
  .replaceAll('{{IMAGE}}', image).replaceAll('{{BUILD}}', buildCommand(config, 'scout'))));

// Plusieurs images : la vue d'ensemble et l'analyse du code source, communes, vivent dans le dossier parent.
if (basename(dirname(dir)) === '.docker-scout') {
  put('../.gitignore', (path) => writeFileSync(path, 'scans/\nsite/\nchange.json\n'));
  put('../overview.json', (path) => copyFileSync(join(templates, 'overview.json'), path));
}

// Sans .dockerignore, l'espace de travail partirait dans l'image avec COPY . .
const ignore = join(root, build.context, '.dockerignore');
const entry = relative(resolve(root, build.context), dir).split('/')[0] ?? '';
// Espace de travail hors du contexte (image d'un autre dépôt) : il ne peut pas entrer dans l'image.
const outside = entry === '..';
if (outside) console.log('\nEspace de travail hors du contexte de build : rien à ajouter au .dockerignore.');
else if (!existsSync(ignore)) console.log(`\nAttention : pas de .dockerignore. Le créer, avec au moins : ${entry}, .git, node_modules, .env*`);
else if (!readFileSync(ignore, 'utf8').split('\n').some((line) => line.trim().replace(/^\/|\/$/g, '') === entry)) console.log(`\nÀ ajouter à ${basename(ignore)} : ${entry}`);
console.log(`\nBuild à analyser :\n  ${buildCommand(config, 'scout')}`);

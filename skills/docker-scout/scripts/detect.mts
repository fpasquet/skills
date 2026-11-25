#!/usr/bin/env node
/**
 * État des lieux d'un projet avant l'audit, en lecture seule : outils, Dockerfiles (étapes, cible, image de base,
 * secrets de build), écarts aux bonnes pratiques, registres privés, gestionnaires de paquets, CI. Propose la
 * commande de build et les questions à poser. Aucune valeur de secret n'est lue ni affichée.
 *
 *   node detect.mts <app> [--dockerfile <chemin>] [--target <étape>] [--out <dir>/detect.json] [--json]
 *
 *   --target   étape à examiner, quand un Dockerfile produit plusieurs images (une étape par service)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { buildCommand, fail, parseArgs, readJson, run, writeJson } from './lib.mts';
import type { Issue, IssueLevel, Registry } from './types.mts';

const options = parseArgs(process.argv.slice(2), { flags: ['json'] });
const root = resolve(options.positionals[0] ?? '.');
if (!existsSync(root)) fail(`dossier introuvable : ${root}`);
const IGNORED = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', '.next', '.venv', 'venv', 'target', '.docker-scout', '.claude', '.agents']);
const files: string[] = [];
// Dossiers que le compte ne peut pas lire (données d'une base montées par Compose) : ignorés, mais dits.
const unreadable: string[] = [];
const entriesOf = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (dir === root || !['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    unreadable.push(relative(root, dir));
    return [];
  }
};
(function walk(dir: string, depth: number) {
  if (depth > 5) return;
  for (const entry of entriesOf(dir)) {
    if (entry.isDirectory()) {
      if (!IGNORED.has(entry.name)) walk(join(dir, entry.name), depth + 1);
    } else files.push(relative(root, join(dir, entry.name)).split('\\').join('/'));
  }
})(root, 0);
const read = (path: string) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '');
const named = (...patterns: RegExp[]) => files.filter((path) => patterns.some((pattern) => pattern.test(basename(path))));

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
const version = (args: string[], pattern: RegExp) => {
  const { status, stdout } = run('docker', args);
  return status === 0 ? stdout.match(pattern)?.[1] ?? 'présent' : null;
};
const dockerConfig = readJson<{ auths?: Record<string, unknown>; credsStore?: string }>(join(process.env.DOCKER_CONFIG ?? join(homedir(), '.docker'), 'config.json'), {});
const tools = {
  docker: version(['version', '--format', '{{.Server.Version}}'], /([\d.]+)/),
  buildx: version(['buildx', 'version'], /v([\d.]+)/),
  scout: version(['scout', 'version'], /version:\s*v?([\w.-]+)/),
  // Un magasin d'identifiants ne liste pas toujours ses entrées : la connexion reste alors à vérifier par un premier scan.
  hub: Object.keys(dockerConfig.auths ?? {}).some((key) => key.includes('index.docker.io')) ? 'connecté' : dockerConfig.credsStore ? 'à vérifier (magasin d’identifiants)' : 'non connecté',
};

// ---------------------------------------------------------------------------
// Dockerfiles
// ---------------------------------------------------------------------------
const PRODUCTION = /^(production|prod|runner|runtime|release|final|deploy|app|server)$/i;
const PUBLIC_HOSTS = /^(docker\.io|index\.docker\.io|public\.ecr\.aws|gcr\.io\/distroless|mcr\.microsoft\.com|quay\.io|ghcr\.io|registry\.k8s\.io|cgr\.dev|registry\.access\.redhat\.com|dhi\.io)/;
const SECRET_NAME = /(^|_)(token|password|passwd|secret|api_?key|private_?key|credentials?|auth)($|_)/i;

interface Instruction { line: number; name: string; value: string }
interface Stage { name: string; from: string; image: string; line: number; instructions: Instruction[] }

function parseDockerfile(path: string) {
  const text = read(path).replace(/\r/g, '');
  const stages: Stage[] = [];
  const globals: Record<string, string> = {};
  const instructions: Instruction[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const start = i;
    if (/^\s*(#|$)/.test(lines[i])) continue;
    let content = lines[i];
    while (/\\\s*$/.test(content) && i + 1 < lines.length) {
      i++;
      if (!/^\s*#/.test(lines[i])) content = `${content.replace(/\\\s*$/, ' ')}${lines[i]}`;
      else content = content.replace(/\\\s*$/, ' \\');
    }
    const heredoc = content.match(/<<-?["']?(\w+)["']?/);
    if (heredoc && /^\s*(RUN|COPY)/i.test(content)) {
      while (i + 1 < lines.length && lines[i + 1].trim() !== heredoc[1]) content += `\n${lines[++i]}`;
      i++;
    }
    const match = content.trim().match(/^([A-Za-z]+)\s+([\s\S]*)$/);
    if (match) instructions.push({ line: start + 1, name: match[1].toUpperCase(), value: match[2].replace(/[ \t]+/g, ' ').trim() });
  }
  const expand = (value: string) => value.replace(/\$\{(\w+)(?::?[-+]([^}]*))?\}|\$(\w+)/g, (_, braced: string | undefined, fallback: string | undefined, plain: string | undefined) => globals[braced ?? plain ?? ''] || fallback || '');
  for (const instruction of instructions) {
    if (instruction.name === 'ARG' && !stages.length) {
      const declared = instruction.value.match(/^(\w+)(?:=(.*))?$/);
      if (declared) globals[declared[1]] = expand((declared[2] ?? '').replace(/^["']|["']$/g, ''));
    } else if (instruction.name === 'FROM') {
      const match = instruction.value.match(/^(?:--platform=\S+\s+)?(\S+)(?:\s+as\s+(\S+))?/i);
      stages.push({ name: match?.[2] ?? '', from: match?.[1] ?? '', image: expand(match?.[1] ?? ''), line: instruction.line, instructions: [] });
    } else stages.at(-1)?.instructions.push(instruction);
  }
  // Chaîne d'une étape jusqu'à son image externe, et étapes copiées.
  const byName = (name: string) => stages.find((stage) => stage.name && stage.name.toLowerCase() === name.toLowerCase());
  const chain = (stage: Stage): Stage[] => {
    const parent = byName(stage.image);
    return parent && parent !== stage ? [...chain(parent), stage] : [stage];
  };
  // Une image sort d'une étape finale : personne n'en part (FROM, COPY --from), ou elle a son propre démarrage.
  // Une étape « runtime » qui sert seulement de socle à d'autres n'en est pas une.
  const reused = new Set([...stages.map((stage) => stage.image), ...instructions.flatMap((item) => [...item.value.matchAll(/--from=([\w.-]+)|\bfrom=([\w.-]+)/g)].map((found) => found[1] ?? found[2]))].map((name) => name.toLowerCase()));
  const starts = (stage: Stage) => stage.instructions.some((item) => item.name === 'CMD' || item.name === 'ENTRYPOINT');
  const targets = stages.filter((stage) => !stage.name || !reused.has(stage.name.toLowerCase()) || starts(stage))
    .filter((stage) => !/^(dev|development|test|tests|e2e|debug|ci|lint|base|build|builder|deps|dependencies|install|installer|pruner)([-_.]|$)/i.test(stage.name));
  const wanted = options.values.target;
  if (wanted && !byName(wanted)) fail(`étape introuvable dans ${path} : ${wanted} (étapes : ${stages.map((stage) => stage.name).filter(Boolean).join(', ')})`);
  const target = wanted ? byName(wanted) : targets.filter((stage) => PRODUCTION.test(stage.name)).at(-1) ?? targets.at(-1) ?? stages.at(-1);
  const final = target ? chain(target) : [];
  return {
    path, args: globals, stages, target, targets, final, instructions,
    base: final[0]?.image ?? '', baseExpression: final[0]?.from ?? '',
    externalBases: [...new Set(stages.filter((stage) => !byName(stage.image)).map((stage) => stage.image))],
    secretIds: [...new Set(instructions.filter((item) => item.name === 'RUN').flatMap((item) => [...item.value.matchAll(/--mount=type=secret[^ ]*?(?:,|=secret,)id=([\w.-]+)/g)].map((found) => found[1])))],
    ssh: instructions.some((item) => /--mount=type=ssh/.test(item.value)),
  };
}

type Docker = ReturnType<typeof parseDockerfile>;

function checkDockerfile(docker: Docker): Issue[] {
  const issues: Issue[] = [];
  const add = (rule: string, level: IssueLevel, message: string, line?: number) => issues.push({ rule, level, message, line, file: docker.path });
  const finalInstructions = docker.final.flatMap((stage) => stage.instructions);
  const own = docker.target?.instructions ?? [];
  const context = dirname(docker.path) === '.' ? '' : dirname(docker.path);
  const ignore = read(`${docker.path}.dockerignore`) || read('.dockerignore') || read(join(context, '.dockerignore'));

  for (const stage of docker.stages.filter((item) => docker.externalBases.includes(item.image) && item.image && item.image !== 'scratch')) {
    const hasDigest = stage.image.includes('@sha256:');
    const tag = stage.image.split('@')[0].match(/:([^/:]+)$/)?.[1];
    if (!hasDigest && (!tag || tag === 'latest')) add('base-tag', 'error', `${stage.image} : étiquette absente ou latest, l'image change sans trace`, stage.line);
    else if (!hasDigest && stage === docker.final[0]) add('base-digest', 'info', `${stage.image} : pas de digest, Dependabot ou Renovate ne peut pas proposer une reconstruction de la même étiquette`, stage.line);
  }
  const composed = docker.stages.find((stage) => docker.externalBases.includes(stage.image) && /\$/.test(stage.from));
  if (composed) add('base-arg', 'info', `${composed.from} : image composée par ARG, que Dependabot ne sait pas mettre à jour (Renovate oui, avec une annotation)`, composed.line);
  const user = finalInstructions.filter((item) => item.name === 'USER').at(-1);
  const rootless = /nonroot|rootless|unprivileged/.test(docker.base);
  if (!rootless && (!user || /^(root|0)(:|$)/.test(user.value))) add('root-user', 'error', 'l’image finale tourne en root : ajouter USER avec un compte non privilégié', user?.line ?? docker.target?.line);
  if (docker.stages.length === 1 && /\b(npm|pnpm|yarn|pip|uv|poetry|composer|mvn|gradle|go build|cargo|dotnet)\b/.test(docker.instructions.map((item) => item.value).join(' '))) add('single-stage', 'warning', 'une seule étape : outils de build et dépendances de développement restent dans l’image finale', docker.target?.line);
  for (const { name, value, line } of docker.instructions) {
    if ((name === 'ARG' || name === 'ENV')) {
      const variable = value.match(/^(\w+)/)?.[1] ?? '';
      if (SECRET_NAME.test(variable)) add('secret-in-layer', 'error', `${name} ${variable} : lisible dans l’image ou son historique ; passer par RUN --mount=type=secret`, line);
    }
    if ((name === 'COPY' || name === 'ADD') && !/--from=/.test(value) && /(^|[\s/])(\.npmrc|\.yarnrc(\.yml)?|auth\.json|pip\.conf|\.netrc|\.env[\w.]*|id_rsa|[\w-]*credentials[\w.-]*)(\s|$)/.test(value)) add('secret-file', 'error', `${name} d’un fichier qui peut contenir un jeton : passer par RUN --mount=type=secret`, line);
    if (name === 'ADD' && /https?:\/\//.test(value) && !/--checksum=/.test(value)) add('add-remote', 'warning', 'ADD d’une URL sans --checksum', line);
    if (name !== 'RUN') continue;
    if (/(curl|wget)[^|;&]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(value)) add('pipe-to-shell', 'warning', 'script distant exécuté sans vérification : épingler une version et sa somme', line);
    if (/\bnpm (i|install)\b(?! (-g|--global))(?!.*(-g|--global))/.test(value)) add('lockfile', 'warning', 'npm install ne garantit pas les versions du lockfile : npm ci', line);
    if (/\b(pnpm|yarn)( install| i)?\b/.test(value) && /\b(pnpm (i|install)|yarn install)\b/.test(value) && !/--frozen-lockfile|--immutable|--offline|\bfetch\b/.test(value)) add('lockfile', 'warning', 'installation sans --frozen-lockfile (ou --immutable)', line);
    if (/apt-get install/.test(value) && !/--no-install-recommends/.test(value)) add('apt-recommends', 'warning', 'apt-get install sans --no-install-recommends : paquets inutiles, donc failles en plus', line);
    if (/apt-get install/.test(value) && !/rm -rf \/var\/lib\/apt\/lists|--mount=type=cache/.test(value)) add('apt-lists', 'info', 'listes apt gardées dans la couche', line);
    if (/\bapk add\b/.test(value) && !/--no-cache|--mount=type=cache/.test(value)) add('apk-cache', 'info', 'apk add sans --no-cache', line);
    if (/\bpip3? install\b/.test(value) && !/--no-cache-dir|--mount=type=cache/.test(value) && !/PIP_NO_CACHE_DIR/.test(docker.instructions.map((item) => item.value).join(' '))) add('pip-cache', 'info', 'pip install sans --no-cache-dir', line);
  }
  const wideCopy = own.find((item) => (item.name === 'COPY' || item.name === 'ADD') && !/--from=/.test(item.value) && /^(--\S+ )*\.\/? /.test(item.value));
  if (wideCopy) add('wide-copy', 'warning', 'COPY de tout le contexte dans l’étape finale : ne copier que ce qui s’exécute', wideCopy.line);
  if (!ignore) add('dockerignore', 'error', 'pas de .dockerignore : .git, .env et fichiers locaux peuvent entrer dans l’image');
  else if (docker.instructions.some((item) => /^(COPY|ADD)$/.test(item.name) && !/--from=/.test(item.value) && /^(--\S+ )*\.\/? /.test(item.value))) {
    const lines = ignore.split('\n').map((line) => line.trim().replace(/^\*\*\//, '').replace(/^\/|\/$/g, ''));
    if (!lines.some((line) => /^\.env/.test(line) || line === '*' || line === '.*')) add('dockerignore', 'warning', '.dockerignore n’exclut pas .env*');
    if (!lines.some((line) => line === '.git' || line === '*' || line === '.*')) add('dockerignore', 'info', '.dockerignore n’exclut pas .git');
  }
  const cmd = own.filter((item) => item.name === 'CMD' || item.name === 'ENTRYPOINT').at(-1);
  if (cmd && /["\s](npm|pnpm|yarn|npx)["\s]/.test(` ${cmd.value} `)) add('package-manager-cmd', 'warning', 'le conteneur démarre par un gestionnaire de paquets : lancer node directement permet de le retirer de l’image', cmd.line);
  const runsPackageManager = cmd && /["\s](npm|pnpm|yarn|npx|corepack)["\s]/.test(` ${cmd.value} `);
  const shipsNpm = /(^|\/)node[:@]/.test(docker.base) && !/distroless/.test(docker.base);
  if (shipsNpm && !runsPackageManager && !finalInstructions.some((item) => /rm -rf?[^&;]*node_modules\/npm/.test(item.value))) add('bundled-npm', 'warning', 'npm de l’image Node reste dans l’image finale sans être utilisé au démarrage : ses dépendances ajoutent des failles', docker.final[0]?.line);
  const order: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level] || (a.line ?? 0) - (b.line ?? 0));
}

const dockerfiles = files.filter((path) => /(^|\/)(Dockerfile|Containerfile)(\.[\w-]+)*$|\.Dockerfile$/i.test(path) && !/\.dockerignore$/.test(path) && /^\s*FROM\s/im.test(read(path)))
  .sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
// Fichiers qui construisent une image (CI, scripts, Makefile) : ils disent quel Dockerfile part en production, même
// désigné par un motif (`infra/dockerfiles/${app}.Dockerfile`). Compose, qui sert au développement, n'en fait pas partie.
const BUILD_COMMAND = /docker\s+(buildx\s+)?(build|bake)\b|docker\/(build-push|bake)-action|kaniko|buildah\s+(build|bud)/;
const builders = files.filter((path) => /\.(sh|bash|ya?ml|mk|toml)$|(^|\/)(Makefile|justfile|Jenkinsfile|package\.json)$/.test(path) && !/compose[\w.-]*\.ya?ml$|-lock\.ya?ml$/.test(path))
  .flatMap((path) => {
    const lines = read(path).split('\n');
    const index = lines.findIndex((text) => BUILD_COMMAND.test(text) && !/^\s*(#|\/\/|echo)/.test(text));
    return index === -1 ? [] : [{ path, line: index + 1, text: lines.join('\n') }];
  });
const referenced = builders.flatMap(({ text }) => [...text.matchAll(/[\w./${}() -]*[Dd]ockerfile[\w.${}-]*/g)].map((match) => match[0].trim().split(/\s+(?![^{]*\}\})/).at(-1) ?? ''))
  .filter((token) => /[./]/.test(token) || token === 'Dockerfile')
  .map((token) => new RegExp(`(^|/)${token.replace(/^\.\//, '').split(/\$\{\{[^}]*\}\}|\$\{[^}]*\}|\$\w+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\w.-]+')}$`));
const isDevelopment = (path: string) => /(^|[./-])(dev|development|test|tests|e2e|ci|local|debug)([./-]|$)/i.test(path);
const isBuilt = (path: string) => referenced.some((pattern) => pattern.test(path));
const production = dockerfiles.filter((path) => !isDevelopment(path));
const built = production.filter(isBuilt);
// Les images à auditer : celles qu'un script ou la CI construit, sinon tout ce qui n'est pas réservé au développement.
const imageFiles = built.length ? built : production.length ? production : dockerfiles;
const chosen = options.values.dockerfile ? relative(root, resolve(root, options.values.dockerfile)) : imageFiles.find((path) => /(^|\/)Dockerfile$/.test(path)) ?? imageFiles[0];
if (options.values.dockerfile && !existsSync(join(root, chosen))) fail(`Dockerfile introuvable : ${options.values.dockerfile}`);
const docker = chosen ? parseDockerfile(chosen) : null;
const issues = docker ? checkDockerfile(docker) : [];

// ---------------------------------------------------------------------------
// Gestionnaires de paquets et registres privés
// ---------------------------------------------------------------------------
const ECOSYSTEMS: [string, RegExp][] = [
  ['npm', /^(package-lock\.json|npm-shrinkwrap\.json)$/], ['pnpm', /^pnpm-lock\.yaml$/], ['yarn', /^yarn\.lock$/], ['bun', /^bun\.lockb?$/],
  ['pip', /^requirements[\w.-]*\.txt$/], ['poetry', /^poetry\.lock$/], ['uv', /^uv\.lock$/], ['pipenv', /^Pipfile\.lock$/],
  ['go', /^go\.sum$/], ['cargo', /^Cargo\.lock$/], ['composer', /^composer\.lock$/], ['bundler', /^Gemfile\.lock$/],
  ['maven', /^pom\.xml$/], ['gradle', /^build\.gradle(\.kts)?$/], ['nuget', /^(packages\.lock\.json|[\w.]+\.csproj)$/],
];
const ecosystems = ECOSYSTEMS.map(([id, pattern]) => ({ id, files: named(pattern).slice(0, 5) })).filter((item) => item.files.length);

const registries = new Map<string, { host: string; sources: Set<string>; details: Set<string> }>();
const PUBLIC_REGISTRIES = /(^|\.)(registry\.npmjs\.org|registry\.yarnpkg\.com|registry\.npmmirror\.com|pypi\.org|files\.pythonhosted\.org|repo\.packagist\.org|packagist\.org|api\.github\.com|codeload\.github\.com|github\.com|rubygems\.org|crates\.io|index\.crates\.io|repo\.maven\.apache\.org|repo1\.maven\.org|plugins\.gradle\.org|maven\.google\.com|dl\.google\.com|api\.nuget\.org|proxy\.golang\.org|sum\.golang\.org)$/;
const addRegistry = (url: string | undefined, source: string, detail = '') => {
  const host = (url ?? '').replace(/^\w+:\/\//, '').replace(/^[^/@]*@/, '').split(/[/:?#"'\s]/)[0]?.toLowerCase() ?? '';
  if (!host || !host.includes('.') || PUBLIC_REGISTRIES.test(host)) return;
  const entry = registries.get(host) ?? { host, sources: new Set<string>(), details: new Set<string>() };
  entry.sources.add(source);
  if (detail) entry.details.add(detail);
  registries.set(host, entry);
};
const literalTokens: string[] = [];
for (const path of named(/^\.npmrc$/)) {
  for (const line of read(path).split('\n')) {
    const registry = line.match(/^\s*(@[\w.-]+:)?registry\s*=\s*(\S+)/);
    if (registry) addRegistry(registry[2], path, registry[1]?.slice(0, -1));
    if (/(_authToken|_auth|_password)\s*=\s*(?!\s*"?\$\{)\S/.test(line)) literalTokens.push(path);
  }
}
for (const path of named(/^\.yarnrc\.yml$/)) for (const match of read(path).matchAll(/npmRegistryServer:\s*["']?(\S+?)["']?\s*$/gm)) addRegistry(match[1], path);
for (const path of named(/^pip\.conf$/, /^requirements[\w.-]*\.txt$/, /^pyproject\.toml$/, /^uv\.toml$/, /^Pipfile$/)) {
  for (const match of read(path).matchAll(/(?:index-url|extra-index-url|^url|index)\s*[=\s]\s*["']?(https?:\/\/\S+?)["']?\s*$/gm)) addRegistry(match[1], path);
}
for (const path of named(/^composer\.json$/)) for (const repo of Object.values(readJson<{ repositories?: Record<string, { url?: string }> }>(join(root, path), {}).repositories ?? {})) if (repo?.url) addRegistry(repo.url, path);
for (const path of named(/^nuget\.config$/i)) for (const match of read(path).matchAll(/<add\s+key="[^"]+"\s+value="(https?:[^"]+)"/g)) addRegistry(match[1], path);
for (const path of named(/^pom\.xml$/, /^settings\.xml$/, /^(build|settings)\.gradle(\.kts)?$/)) for (const match of read(path).matchAll(/(?:<url>|url\s*[=(]\s*(?:uri\()?["'])(https?:\/\/[^<"']+)/g)) if (/repositor|maven|artifact|nexus|packages/i.test(match[1])) addRegistry(match[1], path);
for (const path of named(/^Gemfile$/)) for (const match of read(path).matchAll(/source\s*\(?["'](https?:[^"']+)/g)) addRegistry(match[1], path);
for (const path of files.filter((item) => /(^|\/)\.cargo\/config(\.toml)?$/.test(item))) for (const match of read(path).matchAll(/index\s*=\s*"(?:sparse\+)?(https?:[^"]+)"/g)) addRegistry(match[1], path);
// Le lockfile dit d'où viennent réellement les paquets, même quand la configuration vit sur le poste.
for (const path of named(/^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$/)) {
  for (const match of read(path).matchAll(/(?:"resolved": "|resolved "|tarball: ["']?)(https?:\/\/[^/"'\s,}]+)/g)) addRegistry(match[1], path);
}
if (/GOPRIVATE|GONOSUMDB/.test(docker?.instructions.map((item) => item.value).join(' ') ?? '')) addRegistry('go.private.module', docker?.path ?? '', 'GOPRIVATE');
const gitDependencies = named(/^package\.json$/).filter((path) => /"(git\+ssh|ssh):\/\/|"git@/.test(read(path)));

const hostOf = (image: string) => (image.split('/').length > 1 && /[.:]|^localhost/.test(image.split('/')[0] ?? '') ? image : `docker.io/${image}`);
const privateBases = (docker?.externalBases ?? []).filter((image) => image && image !== 'scratch' && !PUBLIC_HOSTS.test(hostOf(image)));
const mirrorArgs = Object.keys(docker?.args ?? {}).filter((name) => /mirror|registry|repo/i.test(name));

// ---------------------------------------------------------------------------
// CI, mises à jour automatiques, compose
// ---------------------------------------------------------------------------
const workflows = files.filter((path) => /^\.github\/workflows\/.+\.ya?ml$/.test(path));
const workflowUses = (pattern: RegExp) => workflows.filter((path) => pattern.test(read(path)));
const remote = run('git', ['-C', root, 'remote', 'get-url', 'origin']).stdout.trim().replace(/\/\/[^@/]+@/, '//');
const ci = {
  github: /github\.com/.test(remote) || workflows.length > 0,
  workflows: workflows.length,
  builds: builders.map(({ path, line }) => `${path}:${line}`),
  scanners: workflowUses(/scout-action|docker scout|trivy|grype|snyk/i),
  pushes: [...new Set(workflows.flatMap((path) => [...read(path).matchAll(/(ghcr\.io|[\w.-]+\.pkg\.dev|[\w.-]+\.dkr\.ecr\.[\w.-]+|[\w.-]+\.azurecr\.io|docker\.io)/g)].map((match) => match[1])))],
  other: files.filter((path) => /^(\.gitlab-ci\.yml|bitbucket-pipelines\.yml|Jenkinsfile|azure-pipelines\.yml|\.circleci\/config\.yml)$/.test(path) || /cloudbuild[\w./-]*\.ya?ml$/.test(path)),
  dependabot: ['.github/dependabot.yml', '.github/dependabot.yaml'].find((path) => files.includes(path)) ?? null,
  renovate: files.find((path) => /(^|\/)(\.renovaterc(\.json)?|renovate\.json5?)$/.test(path)) ?? null,
};
const dependabotEcosystems = ci.dependabot ? [...read(ci.dependabot).matchAll(/package-ecosystem:\s*["']?([\w-]+)/g)].map((match) => match[1]) : [];
const compose = files.filter((path) => /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(path)).map((path) => {
  const text = read(path);
  return { path, targets: [...new Set([...text.matchAll(/^\s+target:\s*["']?([\w.-]+)/gm)].map((match) => match[1]))], secrets: /^secrets:/m.test(text) };
});

// ---------------------------------------------------------------------------
// Commande de build et questions
// ---------------------------------------------------------------------------
const packageName = readJson<{ name?: string }>(join(root, 'package.json'), {}).name?.replace(/^@[^/]+\//, '');
// Plusieurs images dans le dépôt : le nom reprend celui du Dockerfile (api.Dockerfile) ou de son dossier (apps/api/Dockerfile).
// Un suffixe d'environnement ne nomme pas l'image : Dockerfile.nestjs.prod → nestjs.
const imageSuffix = (path: string) => {
  const parts = basename(path).split('.').filter((part) => !/^(dockerfile|containerfile|prod|production)$/i.test(part));
  return parts.length ? parts.join('-') : basename(dirname(path));
};
const imageName = (path: string | undefined) => [packageName ?? basename(root), ...(path && imageFiles.length > 1 && imageSuffix(path) !== '.' ? [imageSuffix(path)] : [])].join('-').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
const image = imageName(chosen);
// Manifeste de l'application dans un monorepo : à côté du Dockerfile, ou dans un dossier du même nom que l'image.
const manifests = named(/^package\.json$/).map((path) => dirname(path)).filter((path) => path !== '.');
const manifestOf = (path: string) => (manifests.includes(dirname(path)) ? dirname(path) : manifests.find((item) => basename(item) === imageSuffix(path)) ?? '');
const SECRET_SOURCES: Record<string, string> = { npmrc: '$HOME/.npmrc', npm: '$HOME/.npmrc', pip: '$HOME/.config/pip/pip.conf', pipconf: '$HOME/.config/pip/pip.conf', netrc: '$HOME/.netrc', composer: '$HOME/.composer/auth.json', composer_auth: '$HOME/.composer/auth.json', auth: '$HOME/.composer/auth.json', maven: '$HOME/.m2/settings.xml', settings: '$HOME/.m2/settings.xml', nuget: '$HOME/.nuget/NuGet/NuGet.Config' };
// Contexte : celui que Compose déclare pour ce Dockerfile, sinon le dossier (racine ou celui du Dockerfile) où
// existent le plus de fichiers copiés.
function contextOf({ path, instructions }: Docker): string {
  for (const file of compose) {
    for (const match of read(file.path).matchAll(/context:\s*["']?([^\s"']+)["']?\s*\n(?:\s+[\w-]+:.*\n)*?\s+dockerfile:\s*["']?([^\s"']+)/g)) {
      const context = join(dirname(file.path), match[1]);
      if (join(context, match[2]) === path || join(match[2]) === path) return context.replace(/\/$/, '') || '.';
    }
  }
  const sources = instructions.filter((item) => /^(COPY|ADD)$/.test(item.name) && !/--from=/.test(item.value) && !item.value.includes('<<'))
    .flatMap((item) => item.value.replace(/^(--\S+ )+/, '').split(/\s+/).slice(0, -1)).filter((item) => !/[*?[$]|^\.\/?$|^https?:/.test(item));
  const score = (context: string) => sources.filter((item) => existsSync(join(root, context, item))).length;
  return dirname(path) !== '.' && score(dirname(path)) > score('.') ? dirname(path) : '.';
}

const command = docker ? buildCommand({
  image,
  build: {
    context: contextOf(docker), dockerfile: docker.path, target: docker.stages.length > 1 ? docker.target?.name : '',
    secrets: docker.secretIds.map((id) => (SECRET_SOURCES[id.toLowerCase()] ? `id=${id},src=${SECRET_SOURCES[id.toLowerCase()]}` : /token|key|password/i.test(id) ? `id=${id},env=${id.toUpperCase()}` : `id=${id},src=<fichier>`)),
  },
}, 'scout', { extra: docker.ssh ? ['--ssh default'] : [] }) : null;

const questions: string[] = [];
if (!docker) questions.push('Aucun Dockerfile : en écrire un (multi-étapes, non root), ou auditer une image déjà publiée (laquelle ?) ?');
if (imageFiles.length > 1 && !options.values.dockerfile) {
  questions.push(built.length
    ? `${built.length} images construites (${built.map((path) => `${imageName(path)} ← ${path}`).join(', ')}) : les auditer toutes ? Un espace de travail par image, un rapport commun ; relancer avec --dockerfile pour chacune.`
    : `${imageFiles.length} Dockerfiles (${imageFiles.slice(0, 6).join(', ')}) : lesquels construisent une image de production ?`);
}
const targetNames = (docker?.targets ?? []).map((stage) => stage.name).filter(Boolean);
if (targetNames.length > 1 && !options.values.target) questions.push(`${docker?.path} produit ${targetNames.length} images (${targetNames.join(', ')}) : lesquelles partent en production ? Un espace de travail par image ; relancer avec --target pour chacune.`);
// Une dernière étape sans nom est l'étape finale par convention : rien à demander.
else if (docker?.target?.name && !options.values.target && !PRODUCTION.test(docker.target.name)) questions.push(`Étape de production : « ${docker.target.name} » ?`);
if (registries.size && !docker?.secretIds.length) questions.push(`Paquets pris sur ${[...registries.keys()].join(', ')} sans secret de build dans le Dockerfile : le registre demande-t-il un jeton ? Si oui, quel fichier le contient sur le poste (.npmrc, pip.conf…), et quel secret en CI ?`);
if (docker?.secretIds.length) questions.push(`Le build attend le(s) secret(s) ${docker.secretIds.join(', ')} : quel fichier ou quelle variable sur le poste, et quel secret GitHub en CI ?`);
if (docker?.ssh || gitDependencies.length) questions.push('Dépendances git privées (SSH) : quelle clé sur le poste, et quelle clé de déploiement en CI ?');
if (privateBases.length) questions.push(`Image de base sur un registre non public (${privateBases.join(', ')}) : comment s’y connecter sur le poste et en CI ? Est-ce un miroir d’une image officielle (laquelle) ?`);
if (ci.builds.some((path) => !path.startsWith('.github/workflows/'))) questions.push(`L’image est construite hors des workflows GitHub (${ci.builds.filter((path) => !path.startsWith('.github/workflows/')).slice(0, 3).join(', ')}) : lire ces fichiers, et demander où placer le contrôle (CI de la PR, avant publication, ou les deux).`);
if (docker && mirrorArgs.length) questions.push(`Argument(s) ${mirrorArgs.join(', ')} : quelle valeur en production ? Une valeur différente donne-t-elle l’image officielle, pour comparer ?`);
if (literalTokens.length) questions.push(`Jeton écrit en clair dans ${[...new Set(literalTokens)].join(', ')} : est-il suivi par git ? À révoquer s’il a été commité.`);
if (tools.scout === null) questions.push('Docker Scout n’est pas installé : d’accord pour installer le plugin CLI ?');
if (tools.hub === 'non connecté') questions.push('Pas de connexion à Docker Hub, nécessaire à Docker Scout : lancer docker login (compte gratuit).');

const report = {
  root, tools, dockerfiles, images: imageFiles.map((path) => ({ name: imageName(path), dockerfile: path, package: manifestOf(path) })), image, command, questions, issues, ecosystems, gitDependencies, literalTokens: [...new Set(literalTokens)],
  docker: docker && {
    path: docker.path, target: docker.target?.name ?? '', targets: targetNames, base: docker.base, baseExpression: docker.baseExpression, args: docker.args, secretIds: docker.secretIds, ssh: docker.ssh, externalBases: docker.externalBases,
    stages: docker.stages.map(({ name, image: from, line }) => ({ name, from, line })),
  },
  registries: [...registries.values()].map(({ host, sources, details }): Registry => ({ host, sources: [...sources], details: [...details] })),
  privateBases, mirrorArgs, ci: { ...ci, dependabotEcosystems }, compose,
};
if (options.values.out) writeJson(resolve(options.values.out), report);
if (options.flags.json) {
  console.log(JSON.stringify(report, null, 1));
  process.exit(0);
}

const line = (name: string, value: string) => console.log(`${name.padEnd(18)}${value}`);
if (unreadable.length) line('Illisibles', `${unreadable.slice(0, 5).join(', ')} (dossiers ignorés)`);
line('Outils', `docker ${tools.docker ?? 'absent'} · buildx ${tools.buildx ?? 'absent'} · scout ${tools.scout ?? 'absent'} · Docker Hub ${tools.hub}`);
if (docker) {
  line('Dockerfile', `${docker.path}${dockerfiles.length > 1 ? ` (aussi : ${dockerfiles.filter((path) => path !== docker.path).slice(0, 5).join(', ')})` : ''}`);
  line('Étapes', docker.stages.map((stage) => `${stage.name || '(sans nom)'} ← ${stage.image}${stage === docker.target ? ' [cible]' : ''}`).join(' ; '));
  line('Image de base', `${docker.base}${docker.baseExpression !== docker.base ? ` (${docker.baseExpression})` : ''}`);
  if (manifestOf(docker.path)) line('Paquet', `${manifestOf(docker.path)} (init.mts --package)`);
  if (docker.secretIds.length || docker.ssh) line('Secrets de build', [...docker.secretIds, ...(docker.ssh ? ['ssh'] : [])].join(', '));
} else line('Dockerfile', 'aucun');
line('Paquets', ecosystems.map((item) => `${item.id} (${item.files[0]}${item.files.length > 1 ? `, +${item.files.length - 1}` : ''})`).join(', ') || 'aucun lockfile');
line('Registres', report.registries.map((item) => `${item.host} (${item.sources.slice(0, 2).join(', ')})`).join(', ') || 'publics seulement');
if (privateBases.length) line('Bases privées', privateBases.join(', '));
if (ci.builds.length) line('Builds d’image', ci.builds.slice(0, 6).join(', '));
line('CI', `${workflows.length} workflow(s) GitHub${ci.scanners.length ? `, analyse : ${ci.scanners.map((path) => basename(path)).join(', ')}` : ', pas d’analyse d’image'}${ci.other.length ? ` ; ${ci.other.join(', ')}` : ''}`);
if (ci.pushes.length) line('Registre cible', ci.pushes.join(', '));
line('Mises à jour', ci.renovate ? `Renovate (${ci.renovate})` : ci.dependabot ? `Dependabot (${dependabotEcosystems.join(', ')})` : 'ni Dependabot ni Renovate');
if (compose.length) line('Compose', compose.map((item) => `${item.path}${item.targets.length ? ` [${item.targets.join(', ')}]` : ''}`).join(', '));
if (issues.length) {
  console.log(`\nÉcarts du Dockerfile (${issues.length})`);
  for (const issue of issues) console.log(`  ${issue.level.padEnd(8)}${issue.rule.padEnd(20)}${issue.line ? `l.${issue.line}`.padEnd(7) : ''.padEnd(7)}${issue.message}`);
}
if (command) console.log(`\nBuild proposé\n  ${command}`);
if (questions.length) console.log(`\nQuestions à poser\n${questions.map((question) => `  - ${question}`).join('\n')}`);

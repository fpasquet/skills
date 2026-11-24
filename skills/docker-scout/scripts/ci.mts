#!/usr/bin/env node
/**
 * Génère le workflow GitHub Actions qui construit l'image, l'analyse avec Docker Scout et bloque selon une politique,
 * et les mises à jour automatiques (Dependabot). N'écrase aucun fichier sans --force.
 *
 *   node ci.mts <dir> [options]        (<dir> : espace de travail, dont scout.json donne le build)
 *
 *   --gate fixable|app|new|report
 *                               fixable : échoue sur une faille critique ou haute corrigeable (défaut)
 *                               app     : comme fixable, sans les failles de l'image de base (--ignore-base)
 *                               new     : en PR, échoue si la PR ajoute une telle faille ; ailleurs, rapport seul
 *                               report  : n'échoue jamais
 *   --severity critical,high    sévérités surveillées
 *   --sarif                     envoi à l'onglet Security (dépôt public, ou Code Security sur un dépôt privé)
 *   --source                    analyse aussi les lockfiles et les actions du dépôt (fs://.)
 *   --issue                     ouvre une issue quand l'analyse planifiée échoue (dépôt privé de préférence)
 *   --secret npmrc=NPMRC        secret de build → secret GitHub (répétable)
 *   --build-arg MIRROR=         argument de build (répétable ; défaut : ceux de scout.json)
 *   --login <registre>          connexion supplémentaire : ghcr, dhi, ecr:<hôte>, gar:<hôte>, other:<hôte> (répétable)
 *   --push <image>              publie l'image après l'analyse, sur la branche principale, avec SBOM et provenance
 *   --branch main --cron "17 5 * * 1" --runner ubuntu-24.04 --workflow .github/workflows/docker-scout.yml
 *   --no-dependabot             ne pas proposer Dependabot
 *   --stdout                    affiche le workflow sans rien écrire
 *   --steps                     affiche les seules étapes Scout, à ajouter après le build d'un job existant
 *   --image-ref <ref>           avec --steps : image construite par ce job (ex. '${{ matrix.app }}:ci')
 *   --force                     remplace un workflow existant
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, loadConfig, parseArgs, readJson, writeJson } from './lib.mts';
import type { Analysis, SecretNote } from './types.mts';

const options = parseArgs(process.argv.slice(2), {
  flags: ['sarif', 'source', 'issue', 'stdout', 'steps', 'force', 'no-dependabot'], multi: ['secret', 'build-arg', 'login'],
});
const [dir] = options.positionals;
const config = dir ? loadConfig(dir) : {};
if (!dir || !config.image) throw fail('usage : node ci.mts <dir> [options] ; <dir> contient scout.json (init.mts).');
const { values, lists, flags } = options;
const root = resolve(dir, config.root ?? '..');
const gate = values.gate ?? 'fixable';
if (!['fixable', 'app', 'new', 'report'].includes(gate)) fail('--gate : fixable, app, new ou report.');
const branch = values.branch ?? 'main';
const workflow = values.workflow ?? '.github/workflows/docker-scout.yml';
const severities = values.severity ?? 'critical,high';
const push = values.push;

const versions = readJson<Record<string, [string, string]>>(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'workflows', 'versions.json'), {});
const uses = (action: string) => `${action}@${versions[action][1]} # ${versions[action][0]}`;
const notes: SecretNote[] = [
  { name: 'DOCKERHUB_USERNAME', kind: 'variable', why: 'Compte Docker Hub utilisé par Docker Scout.' },
  { name: 'DOCKERHUB_TOKEN', kind: 'secret', why: 'Jeton d’accès personnel Docker Hub (hub.docker.com → Account settings → Personal access tokens), droits de lecture.' },
];
const permissions = new Map<string, string>([['contents', 'read'], ['pull-requests', 'write']]);
if (flags.sarif) permissions.set('security-events', 'write');
if (flags.issue) permissions.set('issues', 'write');

// ---------------------------------------------------------------------------
// Connexions aux registres
// ---------------------------------------------------------------------------
const pushHost = push?.split('/').length && /[.:]/.test(push.split('/')[0]) ? push.split('/')[0] : 'docker.io';
const logins = [...(lists.login ?? [])];
if (push) {
  const kind = pushHost === 'ghcr.io' ? 'ghcr' : /\.dkr\.ecr\./.test(pushHost) ? `ecr:${pushHost}` : /\.pkg\.dev$/.test(pushHost) ? `gar:${pushHost}` : pushHost === 'docker.io' ? '' : `other:${pushHost}`;
  if (kind && !logins.includes(kind)) logins.push(kind);
}
const step = (name: string, action: string, inputs: Record<string, string | string[]> = {}, extra: string[] = []) => [
  `- name: ${name}`, ...extra.map((line) => `  ${line}`), `  uses: ${uses(action)}`,
  ...(Object.keys(inputs).length ? ['  with:', ...Object.entries(inputs).flatMap(([key, value]) => (Array.isArray(value) ? [`    ${key}: |`, ...value.map((line) => `      ${line}`)] : [`    ${key}: ${value}`]))] : []),
];
const hubLogin = step('Log in to Docker Hub (Docker Scout)', 'docker/login-action', { username: '${{ vars.DOCKERHUB_USERNAME }}', password: '${{ secrets.DOCKERHUB_TOKEN }}' });
const loginSteps = logins.flatMap((login) => {
  const [kind, host = ''] = [login.split(':')[0], login.split(':').slice(1).join(':')];
  if (kind === 'ghcr') {
    permissions.set('packages', 'read');
    return step('Log in to GitHub Container Registry', 'docker/login-action', { registry: 'ghcr.io', username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' });
  }
  if (kind === 'dhi') return step('Log in to Docker Hardened Images', 'docker/login-action', { registry: 'dhi.io', username: '${{ vars.DOCKERHUB_USERNAME }}', password: '${{ secrets.DOCKERHUB_TOKEN }}' });
  if (!host) return fail(`--login ${kind} : préciser l’hôte (${kind}:<hôte>).`);
  if (kind === 'ecr') {
    permissions.set('id-token', 'write');
    notes.push({ name: 'AWS_ROLE_ARN', kind: 'variable', why: 'Rôle IAM que GitHub endosse par OIDC, avec accès en lecture (et en écriture pour publier) au registre ECR.' }, { name: 'AWS_REGION', kind: 'variable', why: 'Région du registre ECR.' });
    return [...step('Configure AWS credentials', 'aws-actions/configure-aws-credentials', { 'role-to-assume': '${{ vars.AWS_ROLE_ARN }}', 'aws-region': '${{ vars.AWS_REGION }}' }), ...step('Log in to Amazon ECR', 'docker/login-action', { registry: host })];
  }
  if (kind === 'gar') {
    permissions.set('id-token', 'write');
    notes.push({ name: 'GCP_WORKLOAD_IDENTITY_PROVIDER', kind: 'variable', why: 'Fournisseur Workload Identity Federation du projet Google Cloud.' }, { name: 'GCP_SERVICE_ACCOUNT', kind: 'variable', why: 'Compte de service avec accès à Artifact Registry.' });
    return [...step('Authenticate to Google Cloud', 'google-github-actions/auth', { workload_identity_provider: '${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}', service_account: '${{ vars.GCP_SERVICE_ACCOUNT }}', token_format: 'access_token', create_credentials_file: 'false' }, ['id: gcp']), ...step('Log in to Artifact Registry', 'docker/login-action', { registry: host, username: 'oauth2accesstoken', password: '${{ steps.gcp.outputs.access_token }}' })];
  }
  if (kind !== 'other') return fail(`--login ${login} : ghcr, dhi, ecr:<hôte>, gar:<hôte> ou other:<hôte>.`);
  notes.push({ name: 'REGISTRY_USERNAME', kind: 'variable', why: `Compte du registre ${host}.` }, { name: 'REGISTRY_PASSWORD', kind: 'secret', why: `Jeton du registre ${host}.` });
  return step(`Log in to ${host}`, 'docker/login-action', { registry: host, username: '${{ vars.REGISTRY_USERNAME }}', password: '${{ secrets.REGISTRY_PASSWORD }}' });
});

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const build = config.build ?? {};
const secrets = (lists.secret ?? []).map((item) => {
  const match = item.match(/^([\w.-]+)=([A-Z][A-Z0-9_]*)$/);
  if (!match) return fail(`--secret ${item.split('=')[0]} : attendu <id du Dockerfile>=<NOM_DU_SECRET_GITHUB>, jamais la valeur.`);
  notes.push({ name: match[2], kind: 'secret', why: `Contenu du secret de build \`${match[1]}\` (monté pendant le build, absent de l’image).` });
  return { id: match[1], name: match[2] };
});
for (const item of build.secrets ?? []) {
  const id = item.match(/^id=([\w.-]+)/)?.[1];
  if (id && !secrets.some((secret) => secret.id === id)) fail(`le build attend le secret « ${id} » : passer --secret ${id}=<NOM_DU_SECRET_GITHUB>.`);
}
const prefixed = (path: string, prefix: string) => (prefix ? (path === '.' ? prefix : `${prefix}/${path}`) : path);
const buildArgs = lists['build-arg'] ?? build.buildArgs ?? [];
const buildStep = (name: string, { prefix = '', tags, publish = false, extra = [] }: { prefix?: string; tags: string | string[]; publish?: boolean; extra?: string[] }) => step(name, 'docker/build-push-action', {
  context: prefixed(build.context ?? '.', prefix),
  file: prefixed(build.dockerfile ?? 'Dockerfile', prefix),
  ...(build.target ? { target: build.target } : {}),
  ...(config.platform ? { platforms: config.platform } : {}),
  ...(buildArgs.length ? { 'build-args': buildArgs } : {}),
  ...(secrets.length ? { 'secret-envs': secrets.map(({ id, name }) => `${id}=${name}`) } : {}),
  ...(publish ? { push: 'true', sbom: 'true', provenance: 'mode=max' } : { load: 'true', pull: 'true', 'no-cache': "${{ github.event_name == 'schedule' }}" }),
  tags,
  'cache-from': 'type=gha',
  ...(prefix ? {} : { 'cache-to': 'type=gha,mode=max' }),
}, [...extra, ...(secrets.length ? ['env:', ...secrets.map(({ name }) => `  ${name}: \${{ secrets.${name} }}`)] : [])]);

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------
const image = (flags.steps && values['image-ref']) || `${config.image}:ci`;
const vexDir = config.vex?.dir ?? '.vex';
const vex: Record<string, string> = config.vex?.author && existsSync(join(root, vexDir)) ? { 'vex-location': vexDir, 'vex-author': config.vex.author } : {};
// Les seuls fichiers suivis, et les lockfiles pnpm à plusieurs documents réduits au dernier : Scout ne lit que le premier.
const sourceExport = `- name: Export tracked files
  run: |
    mkdir -p "$RUNNER_TEMP/scout-source"
    git archive HEAD | tar -x -C "$RUNNER_TEMP/scout-source"
    find "$RUNNER_TEMP/scout-source" -name pnpm-lock.yaml | while read -r lock; do
      awk '/^---[[:space:]]*$/ { text = ""; next } { text = text $0 "\\n" } END { printf "%s", text }' "$lock" > "$lock.tmp" && mv "$lock.tmp" "$lock"
    done`.split('\n');
const isPullRequest = "github.event_name == 'pull_request'";
if (flags.steps && gate === 'new') fail('--steps ne construit rien : avec --gate new, générer le workflow complet (--stdout) et y reprendre le build de la branche de base.');
const steps: string[][] = [
  step('Check out', 'actions/checkout', { 'persist-credentials': 'false' }),
  step('Set up Buildx', 'docker/setup-buildx-action'),
  hubLogin, loginSteps,
  buildStep('Build the production image', { tags: image }),
  step('Overview', 'docker/scout-action', { command: 'quickview', image: `local://${image}`, 'github-token': '${{ github.token }}', 'write-comment': `\${{ ${isPullRequest} }}` }),
  step('List fixable vulnerabilities', 'docker/scout-action', {
    command: 'cves', image: `local://${image}`, 'only-severities': severities, 'only-fixed': 'true', ...vex, 'write-comment': 'false',
  }),
];
if (flags.sarif) {
  steps.push(
    step('Export all vulnerabilities (SARIF)', 'docker/scout-action', { command: 'cves', image: `local://${image}`, 'sarif-file': 'scout.sarif.json', ...vex, summary: 'false', 'write-comment': 'false' }),
    step('Upload to the Security tab', 'github/codeql-action/upload-sarif', { sarif_file: 'scout.sarif.json', category: 'docker-scout' }),
  );
}
if (flags.source) steps.push(sourceExport, step('Check lockfiles and actions', 'docker/scout-action', { command: 'cves', image: 'fs://${{ runner.temp }}/scout-source', 'only-severities': severities, 'only-fixed': 'true', 'write-comment': 'false' }));
if (gate === 'new') {
  steps.push(
    step('Check out the base branch', 'actions/checkout', { ref: '${{ github.event.pull_request.base.sha }}', path: 'scout-base', 'persist-credentials': 'false' }, [`if: ${isPullRequest}`]),
    buildStep('Build the base branch image', { prefix: 'scout-base', tags: `${config.image}:base`, extra: [`if: ${isPullRequest}`] }),
    step('Block new fixable vulnerabilities', 'docker/scout-action', {
      command: 'compare', image: `local://${image}`, to: `local://${config.image}:base`, 'only-severities': severities, 'only-fixed': 'true', 'ignore-unchanged': 'true', 'hide-policies': 'true', 'exit-on': 'vulnerability', ...vex, 'write-comment': 'false',
    }, [`if: ${isPullRequest}`]),
  );
}
if (gate === 'fixable' || gate === 'app') {
  steps.push(step('Block fixable vulnerabilities', 'docker/scout-action', {
    command: 'cves', image: `local://${image}`, ...(gate === 'app' ? { 'ignore-base': 'true' } : {}), 'only-severities': severities, 'only-fixed': 'true', 'exit-code': 'true', ...vex, summary: 'false', 'write-comment': 'false',
  }));
}
if (flags.issue) {
  steps.push(`- name: Open an issue
  if: failure() && github.event_name == 'schedule'
  env:
    GH_TOKEN: \${{ github.token }}
    GH_REPO: \${{ github.repository }}
    RUN_URL: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}
  run: |
    gh label create docker-scout --color B42318 --force
    if [ -z "$(gh issue list --label docker-scout --state open --json number --jq '.[].number')" ]; then
      gh issue create --label docker-scout --title "Docker Scout: fixable vulnerabilities in ${config.image}" --body "Scheduled scan failed: $RUN_URL"
    fi`.split('\n'));
}

const publishPermissions = new Map(permissions);
publishPermissions.delete('pull-requests');
publishPermissions.delete('security-events');
publishPermissions.delete('issues');
if (pushHost === 'ghcr.io') publishPermissions.set('packages', 'write');
const indent = (lines: string[], width: number) => lines.map((line) => (line ? ' '.repeat(width) + line : '')).join('\n');
const permissionLines = (entries: Map<string, string>) => [...entries].map(([name, level]) => `${name}: ${level}`);
const text = `# Build de l'image de production et analyse Docker Scout.
# Généré par le skill docker-scout ; à modifier ensuite librement.
name: Docker Scout

on:
  pull_request:
  push:
    branches: [${branch}]
  schedule:
    - cron: "${values.cron ?? '17 5 * * 1'}"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: docker-scout-\${{ github.ref }}
  cancel-in-progress: \${{ ${isPullRequest} }}

jobs:
  scan:
    name: Scan
    # Une PR venue d'un fork n'a pas accès aux secrets.
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ${values.runner ?? 'ubuntu-24.04'}
    timeout-minutes: 30
    permissions:
${indent(permissionLines(permissions), 6)}
    steps:
${steps.filter((lines) => lines.length).map((lines) => indent(lines, 6)).join('\n\n')}
${push ? `
  publish:
    name: Publish
    needs: scan
    if: github.event_name == 'push'
    runs-on: ${values.runner ?? 'ubuntu-24.04'}
    timeout-minutes: 30
    permissions:
${indent(permissionLines(publishPermissions), 6)}
    steps:
${[step('Check out', 'actions/checkout', { 'persist-credentials': 'false' }), step('Set up Buildx', 'docker/setup-buildx-action'), hubLogin, loginSteps, buildStep('Build and push with SBOM and provenance', { tags: [`${push}:\${{ github.sha }}`, `${push}:latest`], publish: true })].filter((lines) => lines.length).map((lines) => indent(lines, 6)).join('\n\n')}
` : ''}`;

// ---------------------------------------------------------------------------
// Dependabot
// ---------------------------------------------------------------------------
interface Detect { ecosystems?: { id: string; files: string[] }[]; ci?: { dependabot?: string | null; renovate?: string | null; dependabotEcosystems?: string[] } }
const detect = readJson<Detect>(join(resolve(dir), 'detect.json'), {});
const DEPENDABOT: Record<string, string> = { npm: 'npm', pnpm: 'npm', yarn: 'npm', bun: 'bun', pip: 'pip', poetry: 'pip', pipenv: 'pip', uv: 'uv', go: 'gomod', cargo: 'cargo', composer: 'composer', bundler: 'bundler', maven: 'maven', gradle: 'gradle', nuget: 'nuget' };
const directory = (path: string) => `/${dirname(path) === '.' ? '' : dirname(path)}`;
const updates = new Map<string, Set<string>>([['docker', new Set([directory(build.dockerfile ?? 'Dockerfile')])], ['github-actions', new Set(['/'])]]);
for (const { id, files } of detect.ecosystems ?? []) {
  const ecosystem = DEPENDABOT[id];
  if (!ecosystem) continue;
  const directories = updates.get(ecosystem) ?? new Set<string>();
  for (const file of files) directories.add(directory(file));
  updates.set(ecosystem, directories);
}
const present = detect.ci?.dependabotEcosystems ?? [];
const missing = [...updates].filter(([ecosystem]) => !present.includes(ecosystem));
const dependabotEntries = missing.map(([ecosystem, directories]) => `  - package-ecosystem: ${ecosystem}
${directories.size > 1 ? `    directories:\n${[...directories].map((item) => `      - "${item}"`).join('\n')}` : `    directory: "${[...directories][0]}"`}
    schedule:
      interval: weekly${['docker', 'github-actions'].includes(ecosystem) ? '' : `
    groups:
      minor-and-patch:
        update-types: [minor, patch]`}`).join('\n');

if (flags.steps) {
  // Sans le checkout, Buildx, les connexions de build ni le build : le job existant les a déjà.
  const scoutSteps = [hubLogin, ...steps.slice(5)];
  console.log(`# permissions du job : ${permissionLines(permissions).join(', ')}\n${scoutSteps.map((lines) => lines.join('\n')).join('\n\n')}`);
  process.exit(0);
}
if (flags.stdout) {
  console.log(text);
  process.exit(0);
}
const write = (name: string, content: string, force = false) => {
  const path = join(root, name);
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return console.log(`inchangé ${name}`);
  if (existsSync(path) && !force) return console.log(`gardé    ${name} (existe déjà : --force pour le remplacer, --stdout pour comparer)`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return console.log(`écrit    ${name}`);
};
write(workflow, text, flags.force);
if (!flags['no-dependabot']) {
  if (detect.ci?.renovate) console.log(`Renovate en place (${detect.ci.renovate}) : vérifier qu’il couvre docker et github-actions, et pinDigests pour docker.`);
  else if (detect.ci?.dependabot && missing.length) console.log(`\nÀ ajouter dans ${detect.ci.dependabot} → updates :\n${dependabotEntries}`);
  else if (!detect.ci?.dependabot) write('.github/dependabot.yml', `version: 2\nupdates:\n${dependabotEntries}\n`);
}

// Le rapport reprend le workflow et la liste des secrets.
const analysisPath = join(resolve(dir), 'analysis.json');
const unique = notes.filter((note, index) => notes.findIndex((other) => other.name === note.name) === index);
if (existsSync(analysisPath)) {
  const analysis = JSON.parse(readFileSync(analysisPath, 'utf8')) as Analysis;
  analysis.ci = { ...analysis.ci, workflow, secrets: unique };
  writeJson(analysisPath, analysis);
}
console.log('\nÀ créer dans le dépôt GitHub (demander à la personne, ne jamais saisir une valeur à sa place) :');
for (const note of unique) console.log(`  ${note.kind === 'secret' ? 'secret  ' : 'variable'} ${note.name} : ${note.why}`);
console.log(`  Les PR de Dependabot lisent d’autres secrets : gh secret set <NOM> --app dependabot pour ${unique.filter((note) => note.kind === 'secret').map((note) => note.name).join(', ')}.`);
console.log(`Vérifier le workflow : docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest ${relative(root, join(root, workflow))}`);

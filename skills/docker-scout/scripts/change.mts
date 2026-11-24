#!/usr/bin/env node
/**
 * Relève la branche ou la PR qui porte les corrections, pour la partie « Avant et après » du rapport : commits, fichiers,
 * diff des Dockerfiles et des manifestes, état de la PR et de ses contrôles.
 *
 *   node change.mts <dir> --base origin/main --head <branche> [--pr 154] [--repo proprietaire/nom]
 *
 *   <dir>   espace de travail d'une image, ou .docker-scout quand la PR corrige plusieurs images
 *
 * Écrit <dir>/change.json. Lecture seule : ni push, ni commentaire. Les lockfiles sont comptés sans leur diff, et les
 * fichiers d'environnement sont ignorés. À relancer quand la PR avance.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fail, loadConfig, parseArgs, run, writeJson } from './lib.mts';
import type { Change, ChangeFile, PullRequest } from './types.mts';

const options = parseArgs(process.argv.slice(2));
const [dir] = options.positionals;
const { base = 'origin/main', head, pr, repo } = options.values;
if (!dir || !head) throw fail('usage : node change.mts <dir> --base origin/main --head <branche> [--pr <numéro>] [--repo <proprietaire/nom>]');
if (!existsSync(dir)) throw fail(`dossier introuvable : ${dir}`);
const root = resolve(dir, loadConfig(dir).root ?? '..');
const git = (...args: string[]) => {
  const { status, stdout, stderr } = run('git', ['-C', root, ...args]);
  if (status !== 0) throw fail(`git ${args[0]} : ${stderr.trim().split('\n')[0]}`, 1);
  return stdout;
};
const headCommit = git('rev-parse', '--short', head).trim();
const range = `${base}...${head}`;

const RELEVANT = /(^|\/)((Dockerfile|Containerfile)(\.[\w-]+)?|[\w-]+\.Dockerfile|\.dockerignore|package\.json|pnpm-workspace\.yaml|\.npmrc|\.yarnrc\.yml|requirements[\w.-]*\.txt|constraints[\w.-]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|composer\.json|Gemfile|pom\.xml|build\.gradle(\.kts)?|[\w.]+\.csproj|dependabot\.ya?ml)$|^\.github\/(workflows|actions)\/|^\.vex\//i;
const MAX_LINES = 160;
const files = git('diff', '--numstat', range).split('\n').filter(Boolean).flatMap((line): ChangeFile[] => {
  const [added, removed, path] = line.split('\t');
  if (/(^|\/)\.env(\.|$)/.test(path)) return [];
  const file: ChangeFile = { path, added: Number(added) || 0, removed: Number(removed) || 0 };
  if (RELEVANT.test(path)) {
    const lines = git('diff', '--unified=2', range, '--', path).split('\n').filter((text) => !/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity)/.test(text)).filter((text, index, all) => text || index < all.length - 1);
    file.patch = lines.slice(0, MAX_LINES).join('\n') + (lines.length > MAX_LINES ? `\n… ${lines.length - MAX_LINES} lignes de plus` : '');
  }
  return [file];
});

let pullRequest: PullRequest | null = null;
if (pr) {
  const { status, stdout, stderr } = run('gh', ['pr', 'view', pr, ...(repo ? ['--repo', repo] : []), '--json', 'number,title,url,state,isDraft,statusCheckRollup']);
  if (status !== 0) console.error(`Attention : PR illisible par gh (${stderr.trim().split('\n')[0]}). Vérifier le compte (gh auth status) ou --repo.`);
  else {
    const raw = JSON.parse(stdout) as Omit<PullRequest, 'checks'> & { statusCheckRollup?: { name?: string; context?: string; conclusion?: string; state?: string; status?: string }[] };
    const checks = (raw.statusCheckRollup ?? []).map((item) => ({ name: item.name ?? item.context ?? '', status: (item.conclusion || item.state || item.status || 'PENDING').toUpperCase() }));
    pullRequest = { number: raw.number, title: raw.title, url: raw.url, state: raw.state, isDraft: raw.isDraft, checks };
  }
}

const change: Change = {
  base, head, headCommit, collectedAt: new Date().toISOString(), files, pr: pullRequest,
  commits: git('log', '--reverse', '--format=%h%x09%s', `${base}..${head}`).split('\n').filter(Boolean).map((line) => ({ hash: line.split('\t')[0], subject: line.split('\t').slice(1).join(' ') })),
};
writeJson(join(resolve(dir), 'change.json'), change);
console.log(`${base} → ${head} (${headCommit}) : ${change.commits.length} commit(s), ${files.length} fichier(s), ${files.filter((file) => file.patch).length} diff(s) gardé(s)`);
if (pullRequest) {
  const passed = pullRequest.checks.filter((item) => item.status === 'SUCCESS').length;
  console.log(`PR #${pullRequest.number} : ${pullRequest.state}${pullRequest.isDraft ? ' (brouillon)' : ''}, contrôles ${passed} réussis sur ${pullRequest.checks.length} (${pullRequest.checks.filter((item) => item.status === 'SKIPPED').length} ignorés)`);
}

#!/usr/bin/env node
/**
 * Valide la structure du catalogue de skills.
 * Boucle sur les SKILL.md découverts : aucun nom de skill n'est codé en dur ici.
 * Aucune dépendance : Node 18+ suffit, comme pour les scripts des skills.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = 'skills';

// Les six seuls champs définis par la spec Agent Skills (https://agentskills.io/specification).
// Tout le reste (version, author…) n'a de place légale que sous `metadata`.
const ALLOWED_FIELDS = ['name', 'description', 'allowed-tools', 'license', 'compatibility', 'metadata'];
const REQUIRED_FILES = ['SKILL.md', 'README.md', 'CHANGELOG.md'];
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_LINES = 500;
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.agents', '.claude', '.idea']);

const colors = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', reset: '\x1b[0m' };
const counts = { ok: 0, warn: 0, err: 0 };
const ok = (msg) => (counts.ok++, console.log(`${colors.green}✓${colors.reset} ${msg}`));
const warn = (msg) => (counts.warn++, console.log(`${colors.yellow}!${colors.reset} ${msg}`));
const err = (msg) => (counts.err++, console.log(`${colors.red}✗${colors.reset} ${msg}`));
const title = (msg) => console.log(`\n${colors.blue}${msg}${colors.reset}`);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

// Extrait le bloc entre le `---` de la ligne 1 et le `---` suivant, ou null.
function frontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return null;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  return end === -1 ? null : lines.slice(1, end);
}

// Lit les champs de premier niveau, en repliant les blocs pliés (>, >-) et littéraux (|)
// et en gardant les sous-clés d'une map (metadata).
function parseFields(lines) {
  const fields = {};
  let current = null;
  for (const line of lines) {
    const top = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (top) {
      current = top[1];
      fields[current] = { raw: top[2], block: [], map: {} };
      continue;
    }
    if (!current || !/^\s+\S/.test(line)) continue;
    const field = fields[current];
    const sub = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (field.raw === '' && sub) field.map[sub[1]] = unquote(sub[2]);
    else field.block.push(line.trim());
  }
  return fields;
}

const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/, '$2');

function scalar(field) {
  if (!field) return '';
  if (/^[>|]/.test(field.raw)) return field.block.join(' ').trim();
  return unquote(field.raw);
}

// Le CLI `skills` ignore SANS message un SKILL.md dont le YAML ne parse pas.
// Le piège le plus courant : `: ` dans un scalaire simple non quoté.
function yamlHazard(field) {
  if (!field) return false;
  const raw = field.raw.trim();
  if (raw === '' || /^[>|'"]/.test(raw)) return false;
  return raw.includes(': ');
}

// Première version listée dans le CHANGELOG (`## 1.2.0 · …`).
function changelogVersion(path) {
  const match = readFileSync(path, 'utf8').match(/^##\s+v?(\d+\.\d+\.\d+)/m);
  return match?.[1] ?? null;
}

console.log(`${colors.blue}🔍 Validation du catalogue de skills${colors.reset}`);
console.log('======================================');

// ---------------------------------------------------------------------------
// 1. Emplacement des SKILL.md
// ---------------------------------------------------------------------------
title('📁 Emplacement des SKILL.md');

const allSkillFiles = walk(ROOT)
  .filter((path) => path.endsWith('/SKILL.md'))
  .map((path) => relative(ROOT, path))
  .sort();

const skillFiles = [];
for (const file of allSkillFiles) {
  const parts = file.split('/');
  if (parts[0] !== SKILLS_DIR) err(`${file} est hors de ${SKILLS_DIR}/ : non découvert par le CLI`);
  else if (parts.length !== 3) err(`${file} : attendu ${SKILLS_DIR}/<skill>/SKILL.md`);
  else skillFiles.push(file);
}

if (skillFiles.length === 0) warn(`aucun skill trouvé dans ${SKILLS_DIR}/`);
else ok(`${skillFiles.length} skill(s) à la bonne profondeur`);

// ---------------------------------------------------------------------------
// 2. Frontmatter, nommage, documentation et versions
// ---------------------------------------------------------------------------
title('📋 Frontmatter, nommage, documentation et versions');

const seen = new Map();
for (const file of skillFiles) {
  const dir = file.split('/')[1];
  const skillDir = join(ROOT, SKILLS_DIR, dir);
  const content = readFileSync(join(ROOT, file), 'utf8');
  const fm = frontmatter(content);
  if (!fm) {
    err(`${dir} : frontmatter absent ou non fermé (le fichier doit commencer par ---)`);
    continue;
  }
  const fields = parseFields(fm);
  const name = scalar(fields.name);
  const description = scalar(fields.description);

  for (const key of Object.keys(fields)) {
    if (!ALLOWED_FIELDS.includes(key)) {
      err(`${dir} : champ '${key}' hors spec — seuls [${ALLOWED_FIELDS.join(', ')}] sont admis ; le reste va sous 'metadata'`);
    }
  }
  for (const key of ['name', 'description', 'license', 'compatibility']) {
    if (yamlHazard(fields[key])) {
      err(`${dir} : '${key}' contient ': ' sans être quoté — YAML invalide, le CLI ignorerait ce skill en silence. Utiliser un bloc plié '>-'.`);
    }
  }

  if (!name) err(`${dir} : champ 'name' absent ou vide`);
  else if (name !== dir) err(`${dir} : name '${name}' ≠ nom du dossier '${dir}'`);
  else if (name.length > MAX_NAME_LENGTH) err(`${dir} : name de ${name.length} caractères, ${MAX_NAME_LENGTH} maximum`);
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) err(`${dir} : name '${name}' — [a-z0-9-] uniquement, ni tiret en début ou fin, ni tirets consécutifs`);
  else ok(`${dir} : name valide`);

  if (seen.has(name)) err(`name '${name}' dupliqué : ${file} et ${seen.get(name)}`);
  else seen.set(name, file);

  if (!description) err(`${dir} : champ 'description' absent ou vide`);
  else if (description.length > MAX_DESCRIPTION_LENGTH) {
    err(`${dir} : description de ${description.length} caractères, ${MAX_DESCRIPTION_LENGTH} maximum`);
  }

  // La spec attend une chaîne séparée par des espaces, pas une liste YAML.
  if (fields['allowed-tools'] && !scalar(fields['allowed-tools'])) {
    err(`${dir} : 'allowed-tools' doit être une chaîne séparée par des espaces (ex. 'Bash(node:*) Read'), pas une liste YAML`);
  }

  for (const required of REQUIRED_FILES) {
    if (!existsSync(join(skillDir, required))) err(`${dir} : ${required} absent`);
  }

  // La version vit dans metadata.version et doit suivre l'entrée la plus récente du CHANGELOG.
  const version = fields.metadata?.map.version;
  const changelog = join(skillDir, 'CHANGELOG.md');
  if (!version) err(`${dir} : metadata.version absent`);
  else if (existsSync(changelog)) {
    const latest = changelogVersion(changelog);
    if (latest !== version) err(`${dir} : metadata.version ${version} ≠ dernière version du CHANGELOG (${latest ?? 'aucune'})`);
    else ok(`${dir} : version ${version} cohérente avec le CHANGELOG`);
  }

  const lines = content.split('\n').length;
  if (lines > MAX_SKILL_LINES) warn(`${dir} : SKILL.md fait ${lines} lignes, viser moins de ${MAX_SKILL_LINES} (déplacer le détail dans references/)`);
}

// ---------------------------------------------------------------------------
// 3. Syntaxe des scripts livrés par les skills
// ---------------------------------------------------------------------------
title('🧪 Syntaxe des scripts JavaScript');

const scripts = existsSync(join(ROOT, SKILLS_DIR))
  ? walk(join(ROOT, SKILLS_DIR)).filter((path) => /\.(mjs|cjs|js)$/.test(path) && statSync(path).isFile())
  : [];
let broken = 0;
for (const script of scripts) {
  const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
  if (result.status !== 0) {
    broken++;
    err(`${relative(ROOT, script)} : ${result.stderr.trim().split('\n').slice(0, 5).join(' | ')}`);
  }
}
if (broken === 0) ok(`${scripts.length} script(s) sans erreur de syntaxe`);

// ---------------------------------------------------------------------------
// 4. Résumé
// ---------------------------------------------------------------------------
console.log('\n======================================');
console.log(`${colors.green}✓ Succès         : ${counts.ok}${colors.reset}`);
console.log(`${colors.yellow}! Avertissements : ${counts.warn}${colors.reset}`);
console.log(`${colors.red}✗ Erreurs        : ${counts.err}${colors.reset}`);

if (counts.err > 0) {
  console.log(`\n${colors.red}❌ Structure invalide : corrigez les erreurs ci-dessus.${colors.reset}`);
  process.exit(1);
}
console.log(`\n${colors.green}✅ Structure valide.${colors.reset}`);

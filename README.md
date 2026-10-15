# skills

> Skills d'agents pour concevoir une application **avant les développements** : specs UI maquettées, prototype cliquable, puis cahier des charges pour l'équipe de développement.

Un _skill_ est un ensemble d'instructions réutilisables qui étend les capacités d'un agent : un dossier, un fichier `SKILL.md`, et au besoin des références, des gabarits et des scripts. Ce dépôt s'installe avec le CLI [`skills`](https://github.com/vercel-labs/skills), qui suit la [spécification Agent Skills](https://agentskills.io) et sait installer vers la plupart des agents de code (Claude Code, Cursor, Codex, opencode…).

## ⚡ Démarrage rapide

```bash
# Lister les skills disponibles sans rien installer
npx skills add <source> --list

# Installer toute la chaîne dans le projet courant (choix de l'agent en interactif)
npx skills add <source> --skill specs-ui prototype-ui requirements-doc

# Installer pour un agent précis, ou globalement pour tous vos projets
npx skills add <source> --skill specs-ui -a claude-code
npx skills add <source> --skill specs-ui -g

# Mettre à jour les skills installés
npx skills update
```

`<source>` vaut `<compte>/skills` depuis GitHub, ou le chemin d'une copie locale du dépôt (`~/www/skills`).

| Portée | Option     | Emplacement                                                      |
| ------ | ---------- | ---------------------------------------------------------------- |
| Projet | _(défaut)_ | `./<agent>/skills/`, à ignorer dans git : réinstallé depuis `skills-lock.json` |
| Global | `-g`       | `~/<agent>/skills/`, disponible dans tous vos projets             |

Une installation en portée projet écrit un `skills-lock.json` à la racine du projet. C'est lui qu'on commite, et non les copies : toute l'équipe et la CI réinstallent les mêmes versions. Pour figer une version, épingler un commit ou un tag dans la source ; le lock garde alors une `ref` par skill :

```bash
npx skills add <compte>/skills#<commit> --skill specs-ui prototype-ui requirements-doc -a claude-code -y --copy
```

Pour réinstaller depuis le lock (clone neuf, CI), `npx skills experimental_install` ne remplit que `.agents/skills/`. Un agent qui lit son propre dossier, comme Claude Code (`.claude/skills/`), passe par un petit script du projet qui relance `add` pour chaque source épinglée :

```js
// scripts/install-skills.mjs : skills de skills-lock.json, aux versions épinglées, dans .claude/skills/
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { skills } = JSON.parse(readFileSync('skills-lock.json', 'utf8'));
const groups = new Map();
for (const [name, { source, ref }] of Object.entries(skills)) {
  if (!ref) throw new Error(`${name} : pas de ref dans skills-lock.json, épingler un commit`);
  const key = `${source}#${ref}`;
  groups.set(key, [...(groups.get(key) ?? []), name]);
}
for (const [source, names] of groups) {
  const args = ['-y', 'skills', 'add', source, '--skill', ...names, '-a', 'claude-code', '-y', '--copy'];
  execFileSync('npx', args, { stdio: 'inherit' });
}
```

Le lancer avant toute commande qui appelle un script de skill (par exemple en tête de `npm run specs:build`), et ignorer `.claude/skills/` et `.agents/` dans git. Pour ne pas recloner à chaque appel, noter l'empreinte (`computedHash`) des skills installés et ne réinstaller que lorsqu'elle diffère du lock.

## 📦 Skills disponibles

| Skill                                                      | Version | Description                                                                                     |
| ---------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| [`specs-ui`](skills/specs-ui/README.md)                     | 3.3.0   | Specs UI maquettées en HTML + Tailwind : propositions d'identité, écrans desktop et mobile annotés, parcours, règles |
| [`prototype-ui`](skills/prototype-ui/README.md)             | 2.3.0   | Prototype cliquable en HTML + Tailwind + Alpine.js, avec scénarios de test guidés et mode démo  |
| [`requirements-doc`](skills/requirements-doc/README.md) | 2.2.0   | Cahier des charges en Markdown et en page HTML : fonctionnel, architecture, stack, lots chiffrés |

Chaque skill publie son résultat comme un artifact claude.ai partageable, et garde une copie locale.

## 🔗 La chaîne de travail

```text
specs-ui ──────────► prototype-ui ──────────► requirements-doc
 maquettes,           parcours câblés,          architecture, stack,
 règles, parcours     scénarios de test         lots et estimations
```

Les skills rangent leurs livrables dans un seul dossier `specs/`, à la racine du projet, qui est en général le dépôt de code de l'application :

```text
mon-projet/
├── apps/, packages/…         # le code de l'application
└── specs/
    ├── ui/                   # specs : sources par écran, site construit, CONTEXTE.md (mémoire)
    ├── prototype/            # prototype : sources, site construit, PROTOTYPE.md (mémoire)
    ├── requirements/         # cahier des charges : sources par partie, document construit, REQUIREMENTS.md (mémoire)
    └── design-system-package/  # (option) paquet de tokens pour Claude Design
```

`prototype-ui` et `requirements-doc` lisent `specs/ui/` ; le cahier des charges reprend aussi le prototype s'il existe. Chaque dossier garde une mémoire courte (`CONTEXTE.md`, `PROTOTYPE.md`, `REQUIREMENTS.md`) avec les URL des artifacts publiés : une nouvelle session reprend là où la précédente s'est arrêtée, et met à jour les mêmes artifacts. Un projet à l'ancienne disposition (`specs-ui/`, `prototype-ui/`, `cdc/` côte à côte) se range avec `migrate-layout.mjs` du skill `specs-ui`.

### Pendant les développements

Les trois livrables vivent dans le dépôt de l'application et suivent l'implémentation :

- **sources commitées, HTML reconstruit** : les builds sont déterministes et prennent quelques secondes ; on versionne les sources, le Markdown du cahier des charges et les `.published.json`, et on lit le HTML dans les artifacts publiés. Le `.gitignore` du projet :

  ```gitignore
  specs/ui/site/*
  !specs/ui/site/.published.json
  specs/prototype/site/*
  !specs/prototype/site/.published.json
  specs/requirements/requirements.html
  specs/requirements/publish/
  ```

- **statut par écran** dans les specs (À développer, En cours, Livré, Écart), repris dans le cahier des charges ;
- **fraîcheur** : rebuild puis `git diff` pour le Markdown du cahier des charges, `prepare-publish.mjs --check` pour les artifacts, `drift.mjs` pour le prototype ;
- **traçabilité** : les tests citent les critères d'acceptation (`CA-CONN-27`), et `trace.mjs` donne la couverture par lot ;
- **un écart** se reporte dans les specs, puis dans le prototype et le cahier des charges, dans le même changement que le code.

## 📂 Architecture du dépôt

```text
skills/
├── .github/workflows/ci.yml   # validation, découverte par le CLI, lint
├── scripts/
│   └── validate-skills.mjs    # validation locale, sans dépendance
├── package.json               # outillage de lint uniquement
└── skills/
    └── specs-ui/
        ├── SKILL.md           # instructions lues par l'agent
        ├── README.md          # documentation lue par les humains
        ├── CHANGELOG.md       # historique des versions
        ├── references/        # détails lus à la demande par l'agent
        ├── templates/         # gabarits copiés dans le projet
        └── scripts/           # scripts Node lancés par l'agent (aucune dépendance)
```

Chaque skill porte trois documents, chacun pour un public :

| Fichier        | Public      | Contenu                                                  |
| -------------- | ----------- | -------------------------------------------------------- |
| `SKILL.md`     | l'agent     | La méthode à suivre quand le skill est activé            |
| `README.md`    | les humains | Ce que fait le skill, installation, exemples, contenu    |
| `CHANGELOG.md` | les humains | Ce qui a changé à chaque version                         |

Le CLI découvre les skills dans `skills/<skill>/`, sans configuration ni manifeste. Il les sélectionne par leur `name`, dans un espace de noms plat partagé avec les autres dépôts installés.

## ➕ Ajouter ou modifier un skill

```bash
mkdir -p skills/mon-skill
$EDITOR skills/mon-skill/SKILL.md      # instructions pour l'agent
$EDITOR skills/mon-skill/README.md     # documentation pour les humains
$EDITOR skills/mon-skill/CHANGELOG.md  # première entrée : ## 1.0.0 · date
npm run validate
```

Un `SKILL.md` minimal :

```markdown
---
name: mon-skill
description: >
  Ce que fait le skill et quand l'utiliser, avec les formulations qui doivent le déclencher.
metadata:
  author: fpasquet
  version: "1.0.0"
---

# Mon skill

Méthode à suivre par l'agent quand le skill est activé.
```

Règles vérifiées par la validation :

- `name` identique au nom du dossier : `[a-z0-9-]`, 64 caractères au plus ;
- frontmatter limité aux champs de la spec : `name`, `description`, `allowed-tools`, `license`, `compatibility`, `metadata` ;
- `description` en bloc plié (`>`) : un `:` suivi d'un espace dans une valeur non quotée rend le YAML invalide, et le CLI ignore alors le skill **sans message d'erreur** ;
- `metadata.version` égale à la dernière entrée du `CHANGELOG.md` : toute modification d'un skill ajoute une entrée et monte la version ([SemVer](https://semver.org/lang/fr/)) ;
- `README.md` et `CHANGELOG.md` présents, scripts sans erreur de syntaxe.

C'est la `description`, et elle seule, qui décide quand l'agent active le skill : elle décrit le _quand_ autant que le _quoi_.

Documentation, instructions et textes produits sont en français. Le code des scripts est en anglais, ses commentaires en français.

## ✅ Validation

```bash
npm run validate           # structure, frontmatter, nommage, versions, syntaxe des scripts
npx skills add . --list    # découverte réelle par le CLI
npm ci && npm run lint:md  # lint Markdown (npm run lint:md:fix corrige)
```

La CI rejoue les trois sur chaque push et chaque PR. `--list` est le contrôle qui compte : lui seul prouve qu'un agent verra le skill.

## 🤝 Contribution

- **Branches** : `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`
- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/), en anglais, avec le skill en portée : `feat(specs-ui): …`
- **Versions** : une entrée de `CHANGELOG.md` et `metadata.version` mis à jour dans le même commit

Les instructions destinées aux agents qui modifient ce dépôt sont dans [`AGENTS.md`](AGENTS.md).

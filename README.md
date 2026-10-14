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
| Projet | _(défaut)_ | `./<agent>/skills/`, commité avec le projet, partagé avec l'équipe |
| Global | `-g`       | `~/<agent>/skills/`, disponible dans tous vos projets             |

Une installation en portée projet écrit un `skills-lock.json` à la racine du projet : le committer pour que toute l'équipe ait les mêmes skills. Pour figer une version, ajouter une ref git à la source : `npx skills add <compte>/skills#<tag> --skill specs-ui`.

## 📦 Skills disponibles

| Skill                                                      | Version | Description                                                                                     |
| ---------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| [`specs-ui`](skills/specs-ui/README.md)                     | 2.6.0   | Specs UI maquettées en HTML + Tailwind : propositions d'identité, écrans desktop et mobile annotés, parcours, règles |
| [`prototype-ui`](skills/prototype-ui/README.md)             | 1.4.0   | Prototype cliquable en HTML + Tailwind + Alpine.js, avec scénarios de test guidés et mode démo  |
| [`requirements-doc`](skills/requirements-doc/README.md) | 1.1.0   | Cahier des charges en Markdown et en page HTML : fonctionnel, architecture, stack, lots chiffrés |

Chaque skill publie son résultat comme un artifact claude.ai partageable, et garde une copie locale.

## 🔗 La chaîne de travail

```text
specs-ui ──────────► prototype-ui ──────────► requirements-doc
 maquettes,           parcours câblés,          architecture, stack,
 règles, parcours     scénarios de test         lots et estimations
```

Les skills travaillent dans le dossier du projet de la personne, côte à côte :

```text
mon-projet/
├── specs-ui/                 # specs : sources par écran, site construit, CONTEXTE.md (mémoire)
├── design-system-package/    # (option) paquet de tokens pour Claude Design
├── prototype-ui/             # prototype : sources, site construit, PROTOTYPE.md (mémoire)
└── cdc/                      # cahier des charges : sources par partie, CDC.md (mémoire)
```

`prototype-ui` et `requirements-doc` lisent `specs-ui/` ; le cahier des charges reprend aussi le prototype s'il existe. Chaque dossier garde une mémoire courte (`CONTEXTE.md`, `PROTOTYPE.md`, `CDC.md`) avec les URL des artifacts publiés : une nouvelle session reprend là où la précédente s'est arrêtée, et met à jour les mêmes artifacts.

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

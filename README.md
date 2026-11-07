# skills

> Skills d'agents pour concevoir une application **avant les développements** : specs UI maquettées, prototype cliquable, puis cahier des charges pour l'équipe de développement. **Pendant les développements**, un design system React (tokens, classes sémantiques, shadcn/ui, Storybook) reprend l'identité des specs dans le code.

Un _skill_ est un ensemble d'instructions réutilisables qui étend les capacités d'un agent : un dossier, un fichier `SKILL.md`, et au besoin des références, des gabarits et des scripts. Ce dépôt s'installe avec le CLI [`skills`](https://github.com/vercel-labs/skills), qui suit la [spécification Agent Skills](https://agentskills.io) et sait installer vers la plupart des agents de code (Claude Code, Cursor, Codex, opencode…).

## ⚡ Démarrage rapide

```bash
# Lister les skills disponibles sans rien installer
npx skills add <source> --list

# Installer toute la chaîne dans le dépôt de specs (choix de l'agent en interactif)
npx skills add <source> --skill specs-ui prototype-ui requirements-doc

# Dans le dépôt de l'application : design system, et traçabilité des critères en CI
npx skills add <source> --skill design-system requirements-doc

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

### Dans le chat claude.ai

Les skills s'utilisent aussi depuis le chat claude.ai, sans Claude Code. Chaque skill s'importe en ZIP : Paramètres → Personnaliser → Skills → Ajouter → Importer un Skill. L'exécution de code doit être activée (Paramètres → Capacités).

```bash
cd skills && for s in specs-ui prototype-ui requirements-doc; do zip -rq "../$s.zip" "$s"; done
```

Importer les trois : dans ce mode, `prototype-ui` et `requirements-doc` reprennent les scripts et les consignes de `specs-ui`. Ce qui change dans le chat (détail dans [`claude-ai.md`](skills/specs-ui/references/claude-ai.md)) :

- le projet se garde dans une archive `specs.zip`, à télécharger en fin de conversation et à joindre à la suivante ;
- chaque livrable est un fichier HTML autonome, à ouvrir, télécharger ou partager, au lieu d'un artifact multi-pages mis à jour page par page ;
- sans Chrome, les captures se limitent à des contrôles statiques. Ajouter `storage.googleapis.com` aux domaines autorisés permet d'en installer un.

Une nouvelle version d'un skill se réimporte de la même façon. Claude Code sur le web (claude.ai/code) garde le fonctionnement complet : dépôt git, artifacts multi-pages, réseau réglable.

## 📦 Skills disponibles

| Skill                                                      | Version | Description                                                                                     |
| ---------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| [`specs-ui`](skills/specs-ui/README.md)                     | 3.7.2   | Specs UI maquettées en HTML + Tailwind : propositions d'identité, écrans desktop et mobile annotés, parcours, règles |
| [`prototype-ui`](skills/prototype-ui/README.md)             | 2.5.0   | Prototype cliquable en HTML + Tailwind + Alpine.js, avec scénarios de test guidés et mode démo  |
| [`requirements-doc`](skills/requirements-doc/README.md) | 2.4.1   | Cahier des charges en Markdown et en page HTML : fonctionnel, architecture, stack, lots chiffrés ; export vers l'application |
| [`design-system`](skills/design-system/README.md)       | 1.1.0   | Design system React : tokens, classes sémantiques, shadcn/ui sur Radix, Storybook ; création, maintenance, migration |

Les trois skills de conception publient leur résultat comme un artifact claude.ai partageable (dans le chat claude.ai, un fichier HTML autonome), et gardent une copie locale. `design-system` travaille dans le code de l'application : il s'utilise depuis Claude Code ou un autre agent de code, pas depuis le chat.

## 🔗 La chaîne de travail

```text
specs-ui ──────────► prototype-ui ──────────► requirements-doc
 maquettes,           parcours câblés,          architecture, stack,
 règles, parcours     scénarios de test         lots et estimations
```

Les livrables vivent dans un **dépôt de specs**, séparé du code de l'application. Leurs sources (du HTML par écran) ne viennent plus noyer les PR de l'application, et le chiffrage du cahier des charges reste hors du code. Le dépôt est dédié à un projet, ou partagé entre plusieurs avec un dossier par projet : c'est votre choix, les skills fonctionnent de la même façon. `<projet>` désigne le dossier des livrables d'un projet (`.` dans un dépôt dédié, `orbe/` dans un dépôt partagé) :

```text
orbe-specs/                   # dépôt de specs dédié (ou specs/orbe/ dans un dépôt partagé)
├── ui/                       # specs : sources par écran, CONTEXTE.md (mémoire)
├── prototype/                # prototype : sources, PROTOTYPE.md (mémoire)
└── requirements/             # cahier des charges : sources par partie, REQUIREMENTS.md (mémoire)

orbe-app/                     # dépôt de l'application
├── docs/requirements/        # export du cahier des charges : critères par lot, exigences, architecture
└── src/styles/tokens.css     # copie des tokens des specs, avec sa provenance
```

`prototype-ui` et `requirements-doc` lisent `<projet>/ui/` ; le cahier des charges reprend aussi le prototype s'il existe. Chaque dossier garde une mémoire courte (`CONTEXTE.md`, `PROTOTYPE.md`, `REQUIREMENTS.md`) avec les URL des artifacts publiés : une nouvelle session reprend là où la précédente s'est arrêtée, et met à jour les mêmes artifacts. Le client et l'équipe lisent les livrables dans les artifacts.

Le détail est dans [`depot-specs.md`](skills/specs-ui/references/depot-specs.md) : structure et `.gitignore`, deux clones côte à côte, partage, migration d'un projet dont `specs/` est encore dans l'application (avec son historique). Un tel dossier fonctionne toujours, et un projet à l'ancienne disposition (`specs-ui/`, `prototype-ui/`, `cdc/` côte à côte) se range avec `migrate-layout.mjs` du skill `specs-ui`.

### Le design system de l'application

`design-system` copie dans l'application les tokens des specs (`<projet>/ui/tokens.css`), avec un commentaire de provenance, puis pose un thème shadcn/ui pointé sur ces tokens, des classes sémantiques et Storybook. Une couleur se change dans les specs, puis `tokens.mjs` recopie le fichier ; l'audit signale une copie modifiée à la main. Le skill marche aussi sans specs : il tire alors les tokens et les classes du code existant, ou migre un design system en place.

### Pendant les développements

L'application reçoit seulement ce dont le code a besoin, en fichiers générés qui ne se modifient jamais sur place :

- **l'export du cahier des charges** (`export.mjs`) : règles et critères d'acceptation par lot, exigences non fonctionnelles, architecture, stack et infrastructure, en Markdown, un fichier par lot. Les lots chiffrés, le planning et les risques restent dans le dépôt de specs ;
- **la copie des tokens** (`tokens.mjs`).

Les specs suivent l'implémentation :

- **statut par écran** dans les specs (À développer, En cours, Livré, Écart), repris dans le cahier des charges et dans l'export ;
- **traçabilité** : les tests citent les critères d'acceptation (`CA-CONN-27`), et `trace.mjs docs/requirements --strict` mesure la couverture dans la CI de l'application, sans le dépôt de specs ;
- **un écart** se tranche, puis se reporte dans les specs, le prototype et le cahier des charges, dans un commit du dépôt de specs qui cite la PR de code ; l'export et les tokens se régénèrent dans cette PR ;
- **fraîcheur** : `export.mjs --check` pour l'application, `tokens.mjs --check` pour les tokens, `prepare-publish.mjs --check` pour les artifacts, `drift.mjs` pour le prototype.

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

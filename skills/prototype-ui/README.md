# prototype-ui

Skill qui transforme des specs UI maquettées (skill `specs-ui`) en **prototype cliquable** en HTML + Tailwind + Alpine.js :

- parcours principaux câblés ;
- données simulées gardées dans le navigateur, avec réinitialisation ;
- scénarios de test guidés ;
- mode démo.

Il est publié comme un artifact claude.ai multi-pages.

## Installation

```bash
# Dans le projet courant (choix de l'agent en interactif)
npx skills add <source> --skill prototype-ui

# Globalement, pour tous vos projets
npx skills add <source> --skill prototype-ui -g
```

`<source>` vaut `<compte>/skills` depuis GitHub, ou le chemin d'une copie locale du dépôt (`~/www/skills`).

À installer avec `specs-ui`, dont il lit le projet : `npx skills add <source> --skill specs-ui prototype-ui`.

## Exemples de demandes

- « Fais-moi un prototype cliquable des specs pour les tests utilisateurs. »
- « Câble le parcours de premier usage, avec un scénario guidé pour la démo de jeudi. »
- « Sur le prototype, la création de projet doit aussi marcher depuis le mobile. »
- « Les specs ont bougé : remets le prototype à jour. »

## Contenu

| Chemin | Rôle |
|---|---|
| `SKILL.md` | Méthode : cadrage, scaffold, données et actions, câblage, scénarios, contrôle, publication |
| `references/alpine.md` | Conventions de câblage d'une page (états, listes, formulaires, navigation, actions, pièges) |
| `references/scenarios.md` | Écrire les scénarios, préparer un test utilisateur ou une démo |
| `references/redacteur.md` | Consigne courte des sous-agents rédacteurs (lire peu, câbler, contrôler une fois) |
| `templates/fiche.md` | Fiche de câblage d'une page (`specs/prototype/fiches/eN.md`) |
| `templates/store.js` | État simulé partagé (store Alpine `app`), presets, déroulé des scénarios, observations |
| `templates/assemble.js` | Assemblage des coquilles et blocs repris des specs (`data-use`, `data-slot`…) |
| `templates/chrome.html` | Panneau « Scénarios » et message de confirmation (habillage du prototype) |
| `templates/check-hook.js` | Contrôles lus par `check.mjs`, actifs avec `?check` |
| `templates/prototype.md` | Mémoire du prototype (`PROTOTYPE.md`) |
| `scripts/scaffold.mjs` | Crée `specs/prototype/src/` depuis `specs/ui/sources/` (une page par écran) |
| `scripts/build.mjs` | Construit `specs/prototype/site/` : accueil, une page par écran (CSS compilé), socle `proto.js`, données `data.js` |
| `scripts/check.mjs` | Liens, presets, erreurs JS et Alpine, icônes, débordement, étapes de scénario ; planches des scénarios et des pages |
| `scripts/outline.mjs` | Résumé des états d'une page avec leurs lignes, ou des coquilles (`--shells`), pour lire peu |
| `scripts/prepare-publish.mjs` | Prépare la publication incrémentale avec l'outil Artifact ; `--check` : artifact en retard sur le site local |
| `scripts/drift.mjs` | Écrans modifiés dans les specs depuis leur reprise dans le prototype (`--mark` après la reprise) |

## Démarrage rapide

```sh
node prototype-ui/scripts/scaffold.mjs --specs specs/ui --out specs/prototype
(cd specs/prototype && npm install)
node prototype-ui/scripts/build.mjs specs/prototype
node prototype-ui/scripts/check.mjs specs/prototype --scenarios
```

Prérequis : Node 18+ et Chrome ou Chromium pour les contrôles. Dans le dossier du prototype, lancer `npm install` une fois. Il installe la CLI Tailwind (CSS compilé au build), Alpine.js et Lucide, qui sont alors servis depuis le site. Sans cette installation, le build passe par les CDN, en versions figées.

# Dépôt de specs

Consignes communes aux skills de la chaîne (`specs-ui`, `prototype-ui`, `requirements-doc`) et à `design-system` sur l'endroit où vivent les livrables. Les specs, le prototype et le cahier des charges vivent dans un **dépôt git dédié**, séparé du code de l'application :

- leurs sources (du HTML par écran, des centaines de Ko par lot) noient les PR de l'application et ne se relisent pas dans un diff : on les relit dans l'artifact, avec le bouton « Retours » ;
- le cahier des charges complet porte des lots chiffrés, un planning et des coûts, qui n'ont rien à faire dans le code ;
- les specs avancent à leur rythme, avant et pendant les développements.

L'application en reçoit seulement ce dont le code a besoin (§3).

## 1. Structure

Deux organisations, au choix de la personne, et les skills fonctionnent de la même façon dans les deux :

- un **dépôt dédié** à un projet, avec les livrables à sa racine ;
- un **dépôt partagé** entre plusieurs projets, avec un dossier par projet.

`<projet>` désigne, dans les consignes des skills, le dossier qui contient les livrables d'un projet : la racine d'un dépôt dédié (`.`), ou son dossier dans un dépôt partagé (`orbe/`). Il remplace l'ancien dossier `specs/` à la racine de l'application, avec la même disposition.

```text
orbe-specs/                   dépôt dédié : <projet> vaut .
├── README.md                 projet, artifacts, dépôt de l'application
├── .gitignore
├── ui/                       specs (skill specs-ui) : sources, CONTEXTE.md, site/.published.json
├── prototype/                prototype (skill prototype-ui), facultatif
└── requirements/             cahier des charges (skill requirements-doc), facultatif

specs/                        dépôt partagé : <projet> vaut orbe, atlas…
├── README.md                 index : projets, artifacts, dépôts des applications
├── .gitignore
├── orbe/                     ui/, prototype/, requirements/
└── atlas/…
```

- **Choisir** : le dépôt partagé regroupe tous les projets au même endroit. Le dépôt dédié s'ouvre à d'autres personnes (client, autre équipe) sans leur montrer les autres projets, car les droits se règlent par dépôt. Un dépôt partagé par client est un entre-deux. Ne pas trancher à la place de la personne : la question se pose avec une option recommandée, le dépôt de specs déjà connu (nommé par la personne, ou cloné à côté de l'application) s'il y en a un, sinon un dépôt dédié au projet.
- **Les scripts se lancent depuis la racine du dépôt**, avec le dossier du livrable : `node <skill>/scripts/build.mjs ui` dans un dépôt dédié, `build.mjs orbe/ui` dans un dépôt partagé. Les chemins entre livrables d'un même projet (`../ui`) ne changent pas, et un dépôt dédié peut devenir un dossier d'un dépôt partagé tel quel.
- **Les skills** s'installent dans ce dépôt (portée projet, avec `skills-lock.json`) ou globalement (`-g`).

Le `.gitignore` du dépôt écarte ce qui se reconstruit :

```gitignore
**/ui/site/*
!**/ui/site/.published.json
**/prototype/site/*
!**/prototype/site/.published.json
**/prototype/node_modules/
**/requirements/requirements.html
**/requirements/publish/
```

## 2. Travailler avec les deux dépôts

- **Clones côte à côte** (`~/www/orbe-specs` ou `~/www/specs`, et `~/www/orbe-app`) : les chemins relatifs le supposent. C'est le cas de `requirements.json` → `export.to`, de `sources/site.json` → `assets` quand il pointe vers les images de l'application, et du chemin noté dans la mémoire du design system. Ailleurs, passer les chemins en option.
- **Claude Code sur le web** : une session peut ouvrir les deux dépôts. Les ouvrir ensemble quand le travail touche les deux (export, tokens, écart pendant les développements).
- **Depuis l'application**, un agent trouve les specs par `docs/requirements/README.md` (dépôt, dossier, artifacts) et par la mémoire du design system. L'`AGENTS.md` (ou `CLAUDE.md`) de l'application y renvoie en une ligne, ajoutée au fichier existant ou dans un nouveau : « Specs, prototype et cahier des charges : dépôt de specs `<dépôt>`, dossier `<projet>` ; exigences exportées dans `docs/requirements/` (voir son README), à ne pas modifier ici. »
- **Images du produit** : `site.json` → `assets` peut pointer vers le clone de l'application (`../../orbe-app/apps/web/public/assets` depuis un dépôt dédié, un `../` de plus depuis un dépôt partagé) pour reprendre ses vraies images sans copie, mais le build dépend alors de ce clone et signale les images manquantes. Pour un dépôt de specs qui se construit seul, copier les images citées dans `<projet>/ui/assets/`.

## 3. Ce que reçoit l'application

| Dans l'application | D'où | Commande |
|---|---|---|
| `docs/requirements/` : règles et critères par lot, exigences non fonctionnelles, architecture, stack | cahier des charges | `export.mjs` du skill `requirements-doc` (étape 6) |
| `<styles>/tokens.css` : copie des tokens, avec sa provenance | `<projet>/ui/tokens.css` | `tokens.mjs` du skill `design-system` |

Des specs qui déclarent daisyUI (`sources/site.json` → `daisyui`) ne donnent rien de plus à copier : `scaffold.mjs --specs` du skill `design-system` en déduit les classes de daisyUI et installe la même version, et le thème daisyUI de l'application pointe sur la copie des tokens.

Rien d'autre : ni maquettes, ni prototype, ni chiffrage. Ces fichiers sont générés et ne se modifient jamais dans l'application. `trace.mjs --strict` (sur l'export) et l'audit du design system (sur les tokens) signalent un fichier modifié à la main.

Les ADR que l'équipe écrit pendant les développements restent dans l'application, hors du dossier de l'export. Un ADR qui remplace une décision DT du cahier des charges s'y reporte (`requirements-doc`, « Maintenir pendant les développements »).

## 4. Pendant les développements

- **Le code ne modifie pas les specs.** Un écart se tranche comme à l'étape 7 de `specs-ui`, puis se reporte dans le dépôt de specs, dans un commit qui cite la PR de code (« aligné sur l'implémentation, orbe-app#123 »).
- **L'export et les tokens suivent**, sur la branche de la PR de code si elle est encore ouverte (la demander si elle n'est pas connue), sinon dans une PR suivante : `export.mjs` et `tokens.mjs`, puis un commit dans l'application.
- **Les statuts d'écran** (À développer, En cours, Livré, Écart) se tiennent dans le dépôt de specs, et changent dès qu'on apprend qu'un écran avance ; l'export les reprend pour `trace.mjs`.
- **Ordre** : specs, prototype, cahier des charges, publication des artifacts, puis export et tokens.

## 5. Partager

- Le client et l'équipe lisent les **artifacts** ; le dépôt reste privé. Le dépôt fait foi : un artifact perdu se republie (`prepare-publish.mjs … --all`).
- **Version figée** : le bouton de partage d'un artifact permet de partager une version précise plutôt que la dernière. À chaque validation, poser un tag (`git tag cdc-1.0`, ou `orbe/cdc-1.0` dans un dépôt partagé) et, pour un livrable contractuel, joindre la version autonome (`bundle.mjs`) et `requirements.md`.
- **Hors de l'organisation claude.ai** (plans Team et Enterprise), un lien public n'existe que si un Owner l'autorise : ouvrir le lien dans une fenêtre privée avant de l'envoyer.
- Les relecteurs extérieurs ne voient pas les commentaires d'un artifact : leurs retours passent par le bouton « Retours » des pages, dont ils renvoient l'export.

## 6. Migrer un projet dont `specs/` est dans l'application

**Avant de commencer**, repérer les branches de l'application qui modifient `specs/` sans être fusionnées : `git log --oneline origin/main..<branche> -- specs` pour chaque branche distante, ou les PR ouvertes. Les fusionner d'abord, ou les reporter après l'import (ci-dessous) : ce qui reste dans `specs/` d'une branche de l'application après la migration est perdu pour les specs.

L'historique de `specs/` suit le projet. Il se découpe depuis la branche principale à jour, nommée explicitement : sans elle, `git subtree split` découpe la branche checkoutée, avec son travail non fusionné.

```sh
# Dans le dépôt de l'application : l'historique de specs/ (de origin/main) sur une branche locale
git fetch && git subtree split --prefix=specs origin/main -b specs-history
# Dépôt dédié, neuf et vide : les livrables à sa racine, avec leur historique
git pull ../<app> specs-history
# Ou dépôt partagé, qui a déjà au moins un commit : le projet dans son dossier
git subtree add --prefix=<projet> ../<app> specs-history
```

Dans un dépôt partagé, `git log -- <projet>` s'arrête au commit d'import : l'historique d'avant se lit avec `git log <commit d'import>^2` ou `git blame`.

Une branche non fusionnée se reporte depuis le dépôt de specs, en fusion à trois (les fichiers d'origine sont dans l'historique importé), puis se commite en citant la branche ou la PR :

```sh
git -C ../<app> diff --full-index origin/main...<branche> -- specs | git apply -3 -p2 --directory=<projet>
```

Sans `--directory` dans un dépôt dédié. La branche de l'application ne touche plus `specs/` ensuite.

Puis, dans cet ordre :

1. **Dans le dépôt de specs** :
   - reconstruire chaque livrable (`build.mjs`) et contrôler les artifacts (`prepare-publish.mjs … --check`). Ils gardent leur URL, puisque les `.published.json` et les URL des mémoires suivent. Contrôler avec la version des skills épinglée par l'application (son `skills-lock.json`) : le même build donne les mêmes pages, et un artifact signalé en retard l'était déjà avant le déplacement. Une version plus récente change le gabarit et signale toutes les pages : la monter ensuite, dans un commit à part, et republier avec l'accord de la personne ;
   - corriger les chemins qui sortaient de `specs/` : `site.json` → `assets` (vers le clone de l'application à côté, ou copier les images citées dans `<projet>/ui/assets/`, §2), `requirements.json` → `code` ;
   - réécrire le README du projet (`specs/README.md` de l'application, devenu `<projet>/README.md`), qui décrit souvent les commandes de l'application (`npm run specs:*`, skills installés dans `.claude/skills/`) : les commandes se lancent désormais depuis la racine du dépôt de specs ;
   - relire les chemins cités dans les mémoires (`specs/ui` devient `<projet>/ui`) et ajouter le projet à l'index du dépôt, commiter, puis **pousser**, avec l'accord de la personne.
2. **Dans l'application, sur une branche, une seule PR** :
   - l'export (`export.mjs <projet>/requirements --to ../<app>/docs/requirements`, depuis le dépôt de specs), qui note la destination dans `requirements.json` → `export.to` : commiter ce changement dans le dépôt de specs. Tant que `export.to` manque, `trace.mjs` n'analyse aucun code depuis le dépôt de specs ;
   - la copie des tokens (`tokens.mjs <app> --from <projet>/ui`), qui fait aussi importer la copie par la feuille d'entrée à la place de `specs/ui/tokens.css` ;
   - le renvoi dans `AGENTS.md` (§2), et `trace.mjs docs/requirements --strict` dans la CI s'il y était ;
   - retirer ce qui ne servait qu'aux specs : les scripts `specs:*` (`package.json`, `Makefile`), les étapes de CI qui construisaient les specs, et les skills de la chaîne dans `skills-lock.json` (garder `requirements-doc` si la CI trace l'export, et `design-system`) ;
   - `git rm -r specs` et les lignes `specs/…` retirées du `.gitignore` : seulement une fois le dépôt de specs poussé, et avec l'accord de la personne. Sinon, ouvrir la PR sans eux et dire ce qui reste.
3. Après la fusion, supprimer la branche locale `specs-history`.

## 7. Ancienne disposition et chat

- Un dossier `specs/` à la racine de l'application fonctionne toujours : `<projet>` vaut alors `specs`. Proposer la migration (§6) quand on y travaille.
- Dans le chat claude.ai, le projet voyage dans une archive (`claude-ai.md`) : `pack.mjs <projet> specs.zip` depuis le dépôt de specs, et `pack.mjs --extract` le restaure sous le même nom.

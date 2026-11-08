---
name: requirements-doc
description: >
  Rédige un cahier des charges complet, publié comme artifact HTML lisible (sommaire, recherche par
  identifiant, diagrammes, copie du Markdown complet ou par partie) et livré aussi en Markdown, à partir de specs UI et
  fonctionnelles (projet du skill specs-ui) : présentation et périmètre, utilisateurs et rôles,
  spécifications fonctionnelles et UI par lot avec critères d'acceptation, identité visuelle,
  exigences non fonctionnelles, architecture, stack technique détaillée, infrastructure et
  exploitation, découpage en lots avec estimations en fourchettes, planning, risques et points
  ouverts. L'architecture est déduite des specs, proposée en options puis validée. Utiliser dès que la
  personne parle de cahier des charges, CDC, spécifications techniques, dossier de conception,
  document pour l'équipe de dev, architecture ou stack à partir des specs, chiffrage ou découpage en
  lots, export des exigences vers le dépôt de l'application ou couverture des critères par tests,
  même sans prononcer le mot « cahier des charges ».
metadata:
  author: fpasquet
  version: "2.4.2"
---

# Cahier des charges à partir des specs

Ce skill part d'un projet de specs (skill `specs-ui`, et le prototype du skill `prototype-ui` s'il existe) et produit le **cahier des charges** de l'équipe de développement. Les sources sont en Markdown, une par partie. Le build les assemble en deux formats :

- un document **Markdown**, pour un outil de documentation, et dont la partie utile au code s'**exporte** vers le dépôt de l'application (étape 6) ;
- une **page HTML** publiée comme artifact : sommaire qui suit la lecture, recherche par identifiant, pastilles RF / CA / NF / DT / RQ, diagrammes, thème clair et sombre, boutons « Copier le Markdown », pour le document entier ou une partie. La partie fonctionnelle et UI vient des specs **par extraction** (aucune réécriture), la partie technique (architecture, stack, infrastructure) est **proposée puis validée** avec la personne, et le découpage en lots porte des **estimations en fourchettes** avec leurs hypothèses.

Document et échanges en français. Code des scripts en anglais ; commentaires en français. `<skill>` désigne le dossier de ce skill. `<projet>` désigne le dossier du projet dans le **dépôt de specs**, séparé du code de l'application (`references/depot-specs.md` du skill `specs-ui`) ; les scripts se lancent depuis la racine de ce dépôt. Aucune dépendance : Node suffit.

**Dans le chat claude.ai** (pas d'outil Artifact multi-fichiers, bac à sable `/mnt/user-data/`) : lire d'abord `references/claude-ai.md` du skill `specs-ui`. Il remplace la reprise d'un projet et la publication décrites ici ; tout le reste s'applique.

## Économiser les tokens (à lire en premier)

Les specs d'un produit pèsent souvent plus d'1 Mo de HTML ; le cahier des charges, 150 à 300 Ko de Markdown. Règles :

1. **`<projet>/requirements/REQUIREMENTS.md` est la mémoire** : à lire en premier en reprise, et à s'en contenter tant que possible. Elle contient l'avancement par source, les contraintes, les **décisions techniques DT**, les hypothèses d'estimation et ce qui reste à valider. La tenir à jour à la fin de chaque étape, sous 150 lignes.
2. **Ne jamais lire le HTML des specs** : `extract.mjs` en tire la matière en Markdown dans `<projet>/requirements/sources/generated/` (environ 7 fois plus court). Le modèle principal lit `generated/inventaire.md` et `<projet>/ui/CONTEXTE.md`, puis seulement les extraits utiles des lots (par morceaux).
3. **Ne jamais lire les documents assemblés** (`<projet>/requirements/requirements.md` et `.html`, nommés par `requirements.json` → `output`), ni `<projet>/requirements/publish/`, ni l'export de l'application (`export.mjs --check` dit s'il est à jour). On travaille dans `<projet>/requirements/sources/` (une source par partie), puis `build.mjs` et `check.mjs`.
4. **Un fichier par partie** : modifier une partie, c'est modifier sa source, pas relire le document.
5. **Déléguer au bon modèle** :

| Rôle | Modèle | Tâches |
|---|---|---|
| Conception | modèle principal | Cadrage, questions, architecture, stack, infrastructure, lots et estimations, exigences non fonctionnelles, présentation, relecture, publication |
| Rédaction | `sonnet` | Critères d'acceptation d'un lot depuis `generated/lot-<lot>.md` (consigne : `references/redacteur.md`) ; un rédacteur par lot, en parallèle |
| Exécution mécanique | `haiku` | Lancer `extract`, `build`, `check`, `export`, `trace` et rapporter |

| Tâche | À lire |
|---|---|
| Toute étape | `REQUIREMENTS.md` |
| Plan, identifiants, style | `references/plan.md` |
| Architecture, stack, infrastructure | `references/architecture.md` |
| Lots et estimations | `references/estimations.md` |
| Dépôt de specs, export vers l'application | `depot-specs.md` du skill `specs-ui`, puis l'étape 6 |
| Chat claude.ai | `claude-ai.md` du skill `specs-ui` |

## Étape 0 · Prérequis et préparation

Les livrables de la chaîne vivent dans le dossier du projet, dans le dépôt de specs : `<projet>/ui` (specs), `<projet>/prototype` (prototype), `<projet>/requirements` (ce cahier des charges). Un dossier `specs/` encore dans le dépôt de l'application se déplace vers le dépôt de specs (`depot-specs.md` du skill `specs-ui`, « Migrer ») ; d'ici là, `<projet>` vaut `specs`. Un projet à l'ancienne disposition (`specs-ui/`, `cdc/` à la racine, `cdc.json`, `CDC.md`) se range d'abord avec `migrate-layout.mjs` du skill `specs-ui` ; d'ici là, les scripts lisent encore `cdc.json`.

Il faut un projet `specs-ui` (avec `sources/site.json`). Sinon, proposer d'abord les specs (skill `specs-ui`). D'autres documents fonctionnels donnés par la personne (brief, notes) se lisent au cadrage et se citent en documents de référence.

```sh
node <skill>/scripts/init.mjs --specs <projet>/ui --out <projet>/requirements [--prototype <projet>/prototype]
```

Le script crée `<projet>/requirements/` (`requirements.json`, `REQUIREMENTS.md`, une source par partie avec les valeurs connues déjà remplies), un chapitre par lot dans `30-specs.md`, et lance l'extraction. Un dossier existant n'est pas écrasé : c'est une reprise.

## Étape 1 · Cadrage

Lire `<projet>/ui/CONTEXTE.md` et `<projet>/requirements/sources/generated/inventaire.md`. Puis demander avec **AskUserQuestion** les **contraintes** qui pèsent sur la technique : hébergement imposé ou souhaité, compétences de l'équipe (langages, frameworks), sécurité et conformité (SSO, données en UE, audit), volumes attendus, budget d'infrastructure, échéance. Toujours une option « pas de contrainte ». Noter les réponses dans `REQUIREMENTS.md`.

## Étape 2 · Architecture, stack et infrastructure

Suivre `references/architecture.md` :

1. lire les **besoins techniques** dans les règles RF et les écrans (temps réel, événements externes, traitements longs, exécution isolée, secrets, multi-tenant…), chacun rattaché à sa règle ;
2. proposer **2 ou 3 options** par décision structurante, avec une recommandation, par AskUserQuestion (4 questions par série, 2 séries au plus) ;
3. noter chaque décision **DT-xx** dans `REQUIREMENTS.md`, puis rédiger `60-architecture.md`, `70-stack.md` et `80-infrastructure.md` (hébergement, environnements, réseau, conteneurs, CI/CD, IaC et secrets, observabilité, sauvegardes, sécurité, coûts).

Rien de technique ne s'écrit comme décidé sans validation : une recommandation non tranchée est notée « à valider ».

## Étape 3 · Partie fonctionnelle

- **Critères d'acceptation** : un rédacteur `sonnet` par lot, en parallèle, avec `references/redacteur.md`, son fichier `generated/lot-<lot>.md` et la source `lots/<lot>-criteres.md` à remplir. Lire leurs comptes rendus : une règle floue devient un point « À valider » ou une question à la personne.
- **Le modèle principal rédige** :
  - `10-presentation.md` ;
  - `20-utilisateurs.md` (matrice des rôles depuis les RF) ;
  - `40-interface.md` (principes, composants, mobile, accessibilité ; les tokens sont générés) ;
  - `50-exigences-non-fonctionnelles.md` (chiffrées, en reprenant d'abord les valeurs des specs).

## Étape 4 · Lots, estimations, risques

Suivre `references/estimations.md` :

- **lots** : lot 0 « Socle », puis les lots des specs ;
- **estimations** : par lot, objectif, périmètre, dépendances, livrables, critères de fin et fourchette en jours ; puis synthèse, hypothèses et planning (`gantt`) ;
- **risques et décisions** : les risques **RQ-xx** vont dans `95-risques.md` (les points ouverts des specs y sont inclus automatiquement), les décisions produit datées dans `99-annexes.md`.

## Étape 5 · Construire, contrôler, publier

```sh
node <skill>/scripts/build.mjs <projet>/requirements
node <skill>/scripts/check.mjs <projet>/requirements
```

`check.mjs` signale :

- les parties manquantes ;
- les gabarits `{{…}}` non remplis ;
- les liens internes cassés (ancres en ASCII) ;
- les identifiants cités sans définition ;
- les lots des specs absents du découpage ou sans fourchette ;
- les écrans de l'inventaire absents ;
- les diagrammes non refermés ;
- les identifiants en double.

Corriger jusqu'à zéro problème.

Le build écrit trois fichiers :

- `<projet>/requirements/requirements.md` : le document Markdown ;
- `<projet>/requirements/requirements.html` : la page complète, ouvrable en local, avec les diagrammes rendus ;
- `<projet>/requirements/publish/requirements.html` : la même page sans enveloppe, pour l'outil Artifact (hors du dépôt git : elle se régénère).

Le dépôt de specs versionne les sources, `requirements.md`, `sources/generated/` et `.published.json` ; `requirements.html` et `publish/` restent hors du dépôt (`.gitignore` donné dans `depot-specs.md`).

Dans le chat claude.ai, publier la version autonome de `requirements.html` et livrer `requirements.md` (`claude-ai.md` §3 du skill `specs-ui`) au lieu de ce qui suit.

**Publier `<projet>/requirements/publish/requirements.html` avec l'outil Artifact** (`prepare-publish.mjs <projet>/requirements` dit s'il y a quelque chose à publier et vers quelle URL). Le titre vient de la balise `<title>`, et l'outil rend les diagrammes `mermaid` lui-même. Republier ce même fichier garde l'URL ; la noter dans `requirements.json` → `artifacts.requirements` et dans `REQUIREMENTS.md`, puis lancer `prepare-publish.mjs <projet>/requirements --confirm` (empreinte dans `.published.json`, à commiter). `--check` dit si l'artifact est en retard sur la page locale. La page ne peut pas faire télécharger de fichier (le lecteur l'interdit) : le Markdown se récupère par les boutons « Copier », ou dans le fichier `.md` local. Passer la version et le statut dans `00-titre.md` à chaque publication notable.

## Étape 6 · Exporter vers le dépôt de l'application

Le cahier des charges complet reste dans le dépôt de specs : ses lots chiffrés, son planning et ses risques n'ont rien à faire dans le code. L'application reçoit ce dont le code et ses tests ont besoin, en Markdown généré, un fichier par partie et par lot :

```sh
node <skill>/scripts/export.mjs <projet>/requirements --to ../<app>/docs/requirements   # la première fois
node <skill>/scripts/export.mjs <projet>/requirements                                   # ensuite (requirements.json → export.to)
node <skill>/scripts/export.mjs <projet>/requirements --check                           # l'application est-elle à jour ?
```

- **Parties exportées** : `requirements.json` → `export.parts`, par défaut 10 à 80 (présentation, rôles, specs par lot, interface, exigences non fonctionnelles, architecture, stack, infrastructure). Le titre, les lots et estimations, les risques et les annexes restent internes.
- **Rester interne dans une partie exportée** : encadrer le passage de `<!-- export:skip -->` et `<!-- /export:skip -->` (les coûts de 8.10, déjà encadrés dans le gabarit). Le script signale ce qui ressemble encore à un coût ou à une charge : lire ses notes avant le premier export (`--check` les affiche sans rien écrire), et quand une partie exportée change.
- **Produit** : `README.md` (version, liens des artifacts, contenu, écrans, règles des identifiants), un fichier par partie, `lots/<lot>.md` par lot (règles RF, écrans, statut, critères CA), et `export.json` (source, version, statut des écrans, empreinte de chaque fichier). Les liens internes sont réécrits vers le bon fichier ; ceux qui visent une partie non exportée restent en texte. Rien n'est réécrit quand rien n'a changé.
- **Dans l'application**, ces fichiers se commitent dans le même changement que le code qu'ils concernent, et ne s'y modifient jamais : `trace.mjs --strict` signale un fichier modifié à la main.
- **Chemins** : `--to` se lit depuis le dossier courant, et `export.to` depuis le dossier du cahier des charges ; le script fait la conversion. Ce chemin relatif suppose le clone de l'application à côté du dépôt de specs : sinon, passer `--to`. Sont refusés, sauf `--force` : une destination hors d'un dépôt git de l'application (clone absent), ou un dossier existant qui ne vient pas d'un export.

## Specs modifiées

Relancer `extract.mjs <projet>/requirements` (la partie fonctionnelle suit seule), puis `check.mjs` : il signale les nouveaux écrans absents et les liens cassés. Mettre à jour les critères des lots touchés (rédacteur), les lots et estimations, les risques ; noter la nouvelle version. Puis `export.mjs`, si l'application a un export.

## Maintenir pendant les développements

Le cahier des charges vit dans le dépôt de specs (`<projet>/requirements/`), et l'application en a l'export (étape 6), que l'équipe et ses agents lisent sans rien construire. Il suit les specs, qui suivent l'implémentation (skill `specs-ui`, étape 7). Les développeurs et le client lisent le document complet dans l'artifact.

**Identifiants stables.** Le code et les tests citent les identifiants **CA-…**, **RF-…** et **NF-…** : un identifiant ne change jamais de sens et n'est jamais réutilisé.

- Un nouveau critère prend le numéro suivant du lot, même s'il s'insère au milieu de la liste.
- Un critère abandonné reste, barré et marqué « Retiré (date, raison) ».
- Un critère modifié garde son numéro si la vérification reste la même ; sinon il est retiré et remplacé.

**Décisions techniques et ADR de l'équipe.** Les décisions **DT-…** se prennent dans le cahier des charges (`60-architecture.md`, 6.7) et arrivent toutes dans un seul fichier de l'export, `architecture.md`. Une décision prise pendant les développements peut s'écrire en ADR dans l'application (par exemple `docs/adr/`, un fichier par décision, écrit à la main), jamais dans le dossier de l'export. Un ADR qui remplace une DT se reporte dans le cahier des charges : la DT reste, marquée « Remplacée par ADR-… (date) », et l'export suivant le montre. Sans cela, l'export contredit le code.

**Traçabilité avec le code.** Un test cite le critère qu'il vérifie dans son nom (« CA-CONN-27 · refuse une clé d'API »).

```sh
node <skill>/scripts/trace.mjs <projet>/requirements [--code ../<app>/apps] [--write] [--strict]   # depuis le dépôt de specs
node <skill>/scripts/trace.mjs docs/requirements [--strict]                                        # depuis l'application, sur l'export
```

`trace.mjs` donne, par lot, les critères **testés**, seulement **référencés** dans le code, ou **non couverts**. Il signale les identifiants cités dans le code mais définis nulle part (critère retiré, faute de frappe) et les écrans « Livré » dans les specs dont des critères ne sont pas testés.

- **Code analysé** : `--code`, sinon `requirements.json` → `code`, sinon tout le dépôt git de l'export (`export.to`, même avant le premier export), dossier de l'export exclu. Sans `export.to`, rien n'est analysé depuis un dépôt de specs, et le script le dit ; seule l'ancienne disposition (`specs/requirements` dans l'application) analyse le dépôt qui la contient.
- **Sur l'export**, il lit les définitions et les statuts des écrans dans l'export lui-même : la CI de l'application n'a pas besoin du dépôt de specs, seulement de ce skill installé. Il signale aussi un fichier de l'export modifié à la main ; `--strict` sert à la CI.
- `--write` (dépôt de specs seulement) produit `sources/generated/couverture.md`, à inclure dans une annexe (`<!-- include: generated/couverture.md -->`) quand on veut publier l'avancement.

**À chaque évolution** : réextraire, mettre à jour les critères touchés, `build`, `check`, `trace`, monter la version dans `00-titre.md`, publier, commiter dans le dépôt de specs (sources, Markdown construit, `.published.json`), puis `export.mjs` et commiter l'export dans l'application, avec le code concerné quand il y en a.

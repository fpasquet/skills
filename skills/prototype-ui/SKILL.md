---
name: prototype-ui
description: >
  Transforme des specs UI maquettées (projet du skill specs-ui) en prototype cliquable purement UI, en
  HTML + Tailwind + Alpine.js : les parcours principaux sont câblés (navigation, formulaires, états,
  données simulées gardées dans le navigateur, réinitialisation), avec des scénarios de test guidés pour
  les tests utilisateurs et les démos, publié comme un artifact multi-pages. Utiliser dès que la personne
  veut un prototype, une maquette cliquable, une démo interactive, un parcours à faire tester, un test
  utilisateur ou une version « qu'on peut cliquer » à partir de specs ou de maquettes existantes, même
  sans prononcer le mot « prototype ».
metadata:
  author: fpasquet
  version: "2.2.0"
---

# Prototype UI à partir des specs

Ce skill part d'un projet de specs (skill `specs-ui`) et en fait un **prototype cliquable** : mêmes écrans, même identité, et des parcours principaux qui fonctionnent. On navigue, on remplit les formulaires, les listes changent, les états s'enchaînent. Tout est simulé dans le navigateur. Il sert aux **tests utilisateurs** (scénarios guidés, données de départ maîtrisées, observations) et aux **démos**. Ce n'est pas l'application : les specs restent la référence.

Textes de l'interface, scénarios et échanges sont en français. Le code (scripts, attributs, variables, actions, identifiants) est en anglais ; ses commentaires peuvent être en français.

`<skill>` désigne le dossier de ce skill : les scripts se lancent avec `node <skill>/scripts/…` depuis la racine du projet, qui contient `specs/` (`specs/ui` pour les specs, `specs/prototype` pour le prototype). Un projet à l'ancienne disposition (`specs-ui/`, `prototype-ui/` à la racine) se range d'abord avec `migrate-layout.mjs` du skill `specs-ui`.

## Économiser les tokens (à lire en premier)

Une page de prototype pèse 35 à 70 Ko (10 000 à 20 000 tokens) et `shells.html` plus de 150 Ko. Lire un fichier entier « pour voir » est la première source de gaspillage. Règles :

1. **`specs/prototype/PROTOTYPE.md` est la mémoire** : à lire en premier en reprise, et à s'en contenter tant que possible. Le tenir à jour à la fin de chaque étape, sous 150 lignes. `specs/ui/CONTEXTE.md` ne se lit qu'au cadrage (étape 1) : ensuite, `data.js` porte les faits du fil rouge.
2. **Résumer avant de lire** : `outline.mjs specs/prototype e3 e4` résume chaque état d'une page avec ses lignes (environ douze fois plus court que le HTML), et `outline.mjs specs/prototype --shells` fait de même pour les coquilles. Lire ensuite **seulement les lignes utiles** (offset / limit). Jamais `site/`, jamais `shells.html` en entier.
3. **Fiches de câblage enregistrées** dans `specs/prototype/fiches/eN.md` (modèle `templates/fiche.md`). Elles sont écrites une fois, puis mises à jour à chaque itération. Le rédacteur reçoit le chemin de sa fiche, pas un long message.
4. **Rédacteurs sobres** : ils lisent `references/redacteur.md` (la consigne courte), pas `alpine.md` en entier. Ils lisent leur page par morceaux, font des modifications ciblées sans relire, lancent `build` et `check` une fois à la fin, n'écrivent aucun script de test et ne lisent aucune capture.
5. **Contrôler avant de regarder** : le texte de `check.mjs` d'abord, puis la planche du scénario (`--scenarios`, une image par étape), et les planches de pages seulement en cas de doute. Desktop d'abord ; la planche mobile seulement pour les écrans dont la portée mobile est complète.
6. **Ne câbler que les parcours choisis.** Une page non câblée ne coûte rien : elle montre les maquettes, et chaque état par `?state=`.
7. **Publier seulement ce qui a changé** : le socle (`proto.js`) et les données (`data.js`) sont hors des pages, donc une correction du panneau ou des données envoie un seul fichier. Regrouper les retouches avant de publier.

| Rôle | Modèle | Tâches |
|---|---|---|
| Conception | modèle principal | Cadrage, modèle de données, presets, `actions.js`, câblage partagé (`shells.html`, `nav`), **fiches**, scénarios, relecture des planches, `PROTOTYPE.md`, publication |
| Rédaction | `sonnet` | Câbler les pages d'un parcours à partir de leurs fiches |
| Exécution mécanique | `haiku` | Lancer les scripts et rapporter ; corriger un lien ou une icône signalés |

Câbler une page demande de comprendre la maquette et de la rendre vivante sans l'abîmer : c'est de la rédaction (Sonnet). Deux rédacteurs ne touchent jamais les mêmes pages, et **seul le modèle principal modifie `data.js`, `actions.js`, `prototype.json` et `shells.html`**.

| Tâche | À lire |
|---|---|
| Écrire les fiches, câbler le partagé | `PROTOTYPE.md`, sorties d'`outline.mjs`, `references/alpine.md` (sections utiles) |
| Câbler une page (rédacteur) | sa fiche, `references/redacteur.md` |
| Scénarios, séance de test, démo | `references/scenarios.md` |

## Étape 0 · Prérequis

Il faut un projet `specs-ui` à jour (`sources/site.json`, au moins un lot, `CONTEXTE.md`). Sinon, proposer d'abord les specs avec le skill `specs-ui`. Si `specs/prototype/PROTOTYPE.md` existe, c'est une reprise : lire la mémoire et passer à l'étape utile.

## Étape 1 · Cadrage

Lire `specs/ui/CONTEXTE.md` (parcours, personas, faits du fil rouge, inventaire). Demander avec **AskUserQuestion**, choix tirés des specs :

- **les parcours à câbler**, en général 2 à 4 : premier usage, tâche principale, cas d'erreur important ;
- **l'usage** : tests utilisateurs, démo, ou les deux ;
- **les situations de départ** : premier usage, compte rempli, cas d'erreur.

Une question en suspens va aussi dans `PROTOTYPE.md` (« À valider »), jamais seulement dans le fil.

## Étape 2 · Préparer le prototype

```sh
node <skill>/scripts/scaffold.mjs --specs specs/ui --out specs/prototype
(cd specs/prototype && npm install)          # une fois : Tailwind compilé, Alpine et Lucide servis localement
node <skill>/scripts/build.mjs specs/prototype
node <skill>/scripts/drift.mjs specs/prototype --mark   # point de départ du suivi des specs
```

Le scaffold écrit :

- `src/pages/eN.html` : chaque état de l'écran en desktop et en mobile, sans l'habillage des specs ; **chaque état s'affiche par `?state=<id>`**, et la racine est marquée `data-proto-static` tant que la page n'est pas câblée ;
- `src/shells.html` : coquilles et blocs partagés des specs ;
- `src/data.js`, `src/actions.js`, `src/prototype.json` (avec une table **`nav`** proposée : à relire, `references/alpine.md` §10), `PROTOTYPE.md`, `package.json`.

Sans `npm install`, le build se replie sur les CDN (Tailwind navigateur), ce qui donne un léger délai à chaque écran. Relancer le scaffold plus tard ne touche ni aux pages câblées ni à `shells.html` : leur version des specs va dans `src/_from-specs/`.

## Étape 3 · Données et actions

Le modèle principal les écrit avant tout câblage : c'est le contrat commun des pages.

- `src/data.js` → `window.PROTO_DATA` : les objets métier des parcours, avec les **valeurs exactes du fil rouge** et des identifiants stables (`s-1042`). Seulement ce que les parcours affichent ou modifient.
- `window.PROTO_PRESETS` : situations de départ des scénarios, et états garantis des étapes (ils **complètent** sans écraser).
- `src/actions.js` → `window.PROTO_ACTIONS` : une action par geste (`this.data`, `this.notify()`, `this.later(ms, fn)`), sauvegardée automatiquement ; elle renvoie l'objet créé si la page doit y naviguer.

Les noter dans `PROTOTYPE.md`.

## Étape 4 · Câbler

1. **Le partagé, par le modèle principal** : relire `nav`, puis câbler dans `shells.html` ce qui doit suivre les données (barre latérale, en-têtes), en lisant seulement les lignes des templates concernés (`outline.mjs --shells`).
2. **Une fiche par page** dans `fiches/eN.md`, préparée avec `outline.mjs` : états et conditions, données, gestes, paramètres, ce qui reste statique, textes autorisés.
3. **Les rédacteurs** (`sonnet`, pages disjointes) reçoivent : leurs fiches, `references/redacteur.md`, `PROTOTYPE.md`.

Règles :

- **garder la maquette**, on n'y ajoute que du comportement ;
- **câbler desktop et mobile** ;
- **ne rien inventer hors des specs**, sauf les **états dérivés** qu'un parcours rend inévitables : ils se composent avec les maquettes voisines et se notent dans `PROTOTYPE.md`, conformément à `alpine.md` §2 ;
- **marquer les objets créés dans le prototype** (`fresh`).

Au retour, intégrer les comptes rendus : actions demandées, textes nouveaux et écarts vont dans `PROTOTYPE.md` et dans les fiches.

## Étape 5 · Scénarios

Dans `prototype.json` → `scenarios` : `id`, `title`, `persona`, `goal`, `start`, `preset`, et des `steps` qui **déroulent le scénario type**. Une étape s'écrit `{ "text", "page", "preset" }` : Suivant et Précédent ouvrent son écran avec ses données. Format, panneau, observations, séance de test et démo : `references/scenarios.md`.

## Étape 6 · Construire, contrôler, relire

```sh
node <skill>/scripts/build.mjs specs/prototype
node <skill>/scripts/check.mjs specs/prototype --scenarios   # --sheet pour les planches de pages
```

`check.mjs` signale ce qui bloque :

- liens absents, presets ou étapes inconnus ;
- restes de l'habillage des specs ;
- erreurs JS ou Alpine, icônes inconnues, blocs non assemblés ;
- débordement horizontal en desktop et en mobile.

Chaque étape de chaque scénario est contrôlée sur son écran, avec son état reconstitué (`?scenario=<id>&scenario-step=<n>`). `--pages e2,e13` limite le contrôle (`--pages scenarios` pour les étapes seules). Relire la planche du scénario : bon écran, bon état, histoire qui se suit.

## Étape 7 · Publier

```sh
node <skill>/scripts/prepare-publish.mjs specs/prototype <scratchpad>/prototype-publish
```

Publier avec l'outil Artifact :

- `file_path` : la page principale ;
- `files` : la liste fournie, limitée aux fichiers modifiés (`--all` pour un nouvel artifact : première publication, ou artifact d'un autre compte) ;
- `url` : celle de l'artifact, pour une mise à jour.

Puis lancer `prepare-publish.mjs specs/prototype --confirm` et noter l'URL dans `PROTOTYPE.md` et dans `prototype.json` → `artifact`. Chaque visiteur a ses propres données, gardées dans son navigateur. `prepare-publish.mjs specs/prototype --check` dit, sans rien préparer, si l'artifact est en retard sur le site local.

Dans un dépôt git, commiter `src/`, `fiches/`, `PROTOTYPE.md`, le site construit, `site/.published.json` et `src/specs-sync.json` ; `node_modules/`, `.check/` et `.build-tmp/` restent hors du dépôt.

## Suivre les specs

`drift.mjs specs/prototype` dit quels écrans ont changé dans les specs depuis la dernière reprise (empreintes dans `src/specs-sync.json`), ainsi que l'identité et les coquilles partagées. Specs modifiées après le câblage : relancer `scaffold.mjs`, qui dépose la version des specs dans `src/_from-specs/`. Comparer avec `outline.mjs specs/prototype eN --specs` plutôt qu'en lisant les deux pages, reporter les changements dans la page câblée et dans sa fiche, puis supprimer `src/_from-specs/` et lancer `drift.mjs specs/prototype --mark eN`. `--pages e7,e8 --force` régénère seulement des pages pas encore câblées (puis `--mark` sur ces écrans).

## Maintenir pendant les développements

Quand l'application se construit, le prototype garde son rôle de **support de tests utilisateurs et de démos** ; il ne suit pas le code, il suit les specs.

- **Pages câblées** : à chaque évolution des specs qui les touche (`drift.mjs`), reporter le changement comme ci-dessus, dans le même changement que les specs quand c'est possible.
- **Pages non câblées** : les régénérer (`scaffold.mjs --pages eN --force`), puis `--mark`.
- **Parcours dépassé** : quand l'application livrée couvre un parcours (statut « Livré » dans les specs), les tests utilisateurs se font sur l'application. Noter le parcours « figé » dans `PROTOTYPE.md` plutôt que de continuer à le maintenir.
- Reconstruire, contrôler, republier les fichiers modifiés, et commiter avec les specs.

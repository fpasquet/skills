# Journal des versions

## 2.3.1 · 16/10/2026

- Les messages de confirmation (`$store.app.notify`) s'affichent : l'élément du message, ajouté hors de toute page Alpine, n'était pas initialisé et restait vide.

## 2.3.0 · 15/10/2026

- **Site construit hors du dépôt par défaut** : on versionne les sources, les fiches et `site/.published.json`, plus le site construit, qui se reconstruit avec `build.mjs`. Le `.gitignore` créé par `scaffold.mjs` ignore `site/*` sauf `site/.published.json` ; un projet existant ajoute ces deux lignes.

## 2.2.0 · 14/10/2026

- `scaffold.mjs` réécrit les liens des maquettes vers un écran ou un état (`#e19c`, `projets.html#e6d`) en liens vers la page du prototype qui le montre (`e19.html?state=e19c`, `e6.html?state=e6d`), dans les pages comme dans `shells.html`. Ces liens menaient à des pages des specs absentes du prototype, et `check.mjs` les signalait.
- `drift.mjs --mark` oublie les écrans retirés des specs : ils n'apparaissent plus dans « screens removed from the specs » après la reprise.

## 2.1.0 · 14/10/2026

- `prepare-publish.mjs --all` liste tous les fichiers, socle compris (`data.js`, `proto.js`, Alpine, Lucide), pour publier un nouvel artifact : sans cette option, les fichiers inchangés depuis la publication précédente manquaient.

## 2.0.0 · 14/10/2026

- **Disposition `specs/`** (rupture) : le prototype vit dans `specs/prototype`, les specs dans `specs/ui` (chemin par défaut `../ui`, repli sur `../specs-ui`). Migration avec `migrate-layout.mjs` du skill `specs-ui`.
- **`drift.mjs`** : écrans modifiés dans les specs depuis leur reprise dans le prototype, ainsi que l'identité et les coquilles partagées. Les empreintes sont dans `src/specs-sync.json` ; `--mark` les met à jour après la reprise, `--strict` sert à la CI.
- `prepare-publish.mjs --check` dit si l'artifact est en retard sur le site local.
- Section « Maintenir pendant les développements » : le prototype suit les specs, pas le code ; un parcours livré dans l'application est noté « figé ». Fichiers à commiter et à ignorer dans un dépôt git.

## 1.4.0 · 14/10/2026

Économie de tokens, dans l'esprit de specs-ui 2.1 (retours du câblage d'Agentic Studio : 115 000 et 145 000 tokens pour deux rédacteurs sur 5 pages).

- **SKILL.md allégé** (16 → 10 Ko) avec une section « Économiser les tokens » en tête. Les détails des scénarios, du panneau et de la navigation vivent dans les références.
- **`outline.mjs`** :
  - donne les lignes de chaque état, pour lire par morceaux ;
  - `--shells` résume `shells.html` (templates, lignes, taille, navigation, slots, zones, déjà vivant ou non) sans l'ouvrir.
- **Fiches de câblage enregistrées** (`prototype-ui/fiches/eN.md`, modèle `templates/fiche.md`), réutilisées à chaque itération.
- **`references/redacteur.md`** : consigne courte des rédacteurs, à la place de `alpine.md` en entier. Elle impose de lire par morceaux, de modifier sans relire, de contrôler une fois, de n'écrire aucun script de test et de ne lire aucune capture.
- **Socle hors des pages** : `site/proto.js` (panneau « Scénarios » inséré avant Alpine, store, scénarios, assemblage) et `site/data.js` (configuration, données, actions). Une correction du socle, du panneau ou des données ne republie qu'un fichier, et les pages s'allègent (jusqu'à 25 Ko de moins). Les classes du panneau restent dans le CSS compilé de chaque page.
- **Alpine.js et Lucide servis depuis le site** quand ils sont installés (`npm install`). Il n'y a plus de faux échec de `check.mjs` dû au CDN sous charge, et le prototype marche hors ligne.
- `prepare-publish.mjs` publie aussi les fichiers `.js` et `.css` du site.

## 1.3.0 · 14/10/2026

- **Tailwind compilé au build** : CSS propre à chaque page, intégré dans son `<head>`.
  - Affichage immédiat (40 à 70 ms sur Agentic Studio), aucun fondu ni page brute.
  - CLI cherchée dans `prototype-ui/node_modules` (créé par `npm install`, `package.json` fourni par le scaffold), dans `TAILWIND_CLI` ou dans le PATH ; sinon repli sur Tailwind navigateur ; `--cdn` force le repli.
- **États par l'adresse** : le scaffold génère une racine `x-data` pilotée par `?state=<id>` et marquée `data-proto-static` tant que la page n'est pas câblée.
- **Étapes par l'adresse** : `?scenario=<id>&scenario-step=<n>` reconstitue l'état d'une étape (presets) et place le panneau dessus.
- `check.mjs` contrôle chaque étape de chaque scénario. `--scenarios` produit une planche par scénario, une image par étape légendée par son texte.
- **`outline.mjs`** : résumé des états d'une page (texte, actions, champs, blocs, version mobile), environ douze fois plus court que le HTML, pour écrire les fiches de câblage.
- **Navigation générée** : `prototype.json` → `nav`, proposée par le scaffold et appliquée par le build aux liens des coquilles. `{param}` reprend un paramètre de la page, avec une valeur par défaut dans `params`.
- **Observations de test** dans le panneau : note rattachée au scénario, à l'étape et à l'écran ; export Markdown à copier ou télécharger ; conservées après une réinitialisation.
- Correctif : `scaffold.mjs --pages … --force` écrasait aussi `shells.html` (câblé). Il ne l'écrase plus qu'avec un scaffold complet.

## 1.2.0 · 14/10/2026

- **Les étapes déroulent le scénario type** : Suivant, Précédent et le clic sur une étape changent d'écran.
  - Une étape a son écran (`page`, avec paramètres : `e4.html?step=2`) et, si besoin, un état garanti (`preset`) qui complète les données sans écraser les gestes réels.
  - Les données sont mémorisées à l'entrée de chaque étape : Précédent les restaure.
  - En changeant d'écran, les données vont droit au stockage : la page quittée ne se redessine pas avec un état qui n'est pas le sien.
- `check.mjs` vérifie les presets d'étape.
- Câblage : un écran à états internes lit un paramètre de l'adresse pour s'ouvrir au bon endroit, et suit `proto:params` quand l'étape suivante reste sur le même écran (pas de rechargement).
- Plus d'effet de rechargement en changeant d'écran : fond de l'application et contenu masqué jusqu'à ce que les styles soient prêts, puis fondu de 120 ms ; panneau sans animation au chargement.

## 1.1.0 · 14/10/2026

- **Déroulé guidé des scénarios** : « Commencer » ouvre le panneau sur l'étape en cours.
  - Précédent / Suivant, barre de progression, étapes passées cochées automatiquement, clic sur une étape pour y aller ;
  - « Terminer » puis « Recommencer » ;
  - une étape peut indiquer son écran (`{ text, page }`) : lien « Aller à l'écran » quand on n'y est pas ;
  - l'onglet replié affiche l'étape (« Étape 2 / 5 ») ; l'état ouvert ou replié est gardé d'une page à l'autre.
- `check.mjs` vérifie le texte et l'écran de chaque étape.

## 1.0.0 · 14/10/2026

Première version.

- Scaffold depuis un projet `specs-ui` (2.1 et plus) :
  - une page par écran, états desktop et mobile ;
  - habillage des specs retiré ;
  - les pages câblées sont protégées et la version des specs va dans `src/_from-specs/`.
- Socle Alpine :
  - store `app` (données sauvegardées dans le navigateur, `notify`, `go`, `param`, `later`, `load`) ;
  - presets de départ par scénario ;
  - panneau « Scénarios » avec mode démo (« Masquer », touche « . », `?clean`).
- Build multi-pages avec l'identité des specs (tokens, polices).
- `check.mjs` :
  - contrôles statiques et dans Chrome en desktop et mobile, en parallèle, avec une nouvelle tentative si le CDN est lent ;
  - planches de revue.
- Publication incrémentale avec l'outil Artifact (`prepare-publish.mjs`).
- Retours du premier câblage (Agentic Studio, parcours « Premier usage ») :
  - build : extraction des templates qui tient compte des `<template x-for>` imbriqués (une coquille vivante était tronquée) ;
  - méthode : états dérivés, objets créés dans le prototype (`fresh`), remplacement des slots par `x-init`, câblage des éléments partagés par le modèle principal avant les rédacteurs.

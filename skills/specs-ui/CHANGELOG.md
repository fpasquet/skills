# Changelog

## 3.2.1 · 15 oct. 2026

- `prepare-publish.mjs` s'arrête avec un message clair quand le site n'est pas construit (pas d'`index.html`), au lieu d'une erreur de fichier introuvable. `--confirm` aurait aussi remplacé `.published.json` par un état vide, et perdu la trace des pages publiées.

## 3.2.0 · 14 oct. 2026

- **Points ouverts à quatre colonnes** : question, réponse recommandée, qui tranche, écrans. Gabarit et consigne de rédaction mis à jour ; plus de colonne de numéro. Le cahier des charges (requirements-doc 2.1.0) reprend la recommandation.
- `build.mjs` signale les balises de structure non fermées ou en trop (`header`, `section`, `div`…) dans chaque page : un `<header>` resté ouvert faisait passer toute la suite de la page dans l'en-tête, sans aucune alerte (mise en page cassée, captures `--sections` vides).

## 3.1.1 · 14 oct. 2026

- `build.mjs` signale les liens vers un écran ou un état inexistant (`#e9a`, `marketplace.html#e20`), par exemple après le retrait d'un écran. Ces liens restaient muets. Un renvoi vers un écran entier (`#e9`) mène désormais à sa page.

## 3.1.0 · 14 oct. 2026

- `prepare-publish.mjs --all` liste toutes les pages, pour publier un nouvel artifact (première publication, ou artifact d'un autre compte claude.ai devenu inaccessible). Procédure de remplacement d'un artifact dans l'étape 4.

## 3.0.0 · 14 oct. 2026

Les specs suivent l'implémentation, dans le dépôt de l'application.

- **Disposition `specs/`** (rupture) : les livrables de la chaîne vont dans un seul dossier `specs/` à la racine du projet, `specs/ui` pour les specs (au lieu de `specs-ui/`). `migrate-layout.mjs` range un projet existant (specs, prototype, cahier des charges, paquet Design System) et garde les URL d'artifacts.
- **Statut d'implémentation** par écran (`site.json` → `implementation`, `lot.json` → `status`) : À développer, En cours, Livré, Écart avec une note.
  - Le badge remplace « Nouveau » dans le titre de chaque état.
  - Une pastille apparaît dans la navigation, et l'avancement sur l'index des lots et sur l'accueil.
  - Couleur `doc-gap` ajoutée à l'habillage : template 3.0.0, toutes les pages se reconstruisent une fois.
- **Build déterministe** : plus de date dans `site/.build.json`. Le site construit se commite avec ses sources et ne change que si son contenu change.
- `prepare-publish.mjs --check` dit si l'artifact est en retard sur le site local (`--strict` pour la CI).
- **Étape 7 « Maintenir pendant les développements »** :
  - trancher un écart (le code a raison, les specs ont raison, question ouverte) ;
  - le reporter dans les specs, puis dans le prototype et le cahier des charges ;
  - publier et commiter ensemble ;
  - numérotation stable des règles, écrans et états, cités par le code.

## 2.6.0 · 14 oct. 2026

- **Paquet « tokens seuls » pour Claude Design.** Le skill `/design-sync` attend un paquet React. Le dossier exporté en 2.5.0 n'en est pas un, donc on lui envoie l'identité sous forme de tokens et de classes utilitaires.
  - `design-sync-package.mjs` crée `design-system-package/` à côté des specs. Il contient la configuration du convertisseur, un brouillon de conventions pour le design agent, les notes de synchronisation et `build.mjs`.
  - `build.mjs` compile avec Tailwind :
    - tous les tokens, les classes des maquettes, tout le vocabulaire des tokens et la mise en page courante ;
    - les polices du projet ;
    - les fiches du catalogue rebranchées sur `styles.css`, qui deviennent les cartes visibles.
  - Testé sur Agentic Studio : la validation du convertisseur passe, avec 20 cartes.
- Renvoi vers le nouveau skill `prototype-ui` (prototype cliquable à partir des specs) à l'étape 6.

## 2.5.0 · 14 oct. 2026

- **Option Design System Claude Design**, facultative et proposée une seule fois (réponse notée dans `CONTEXTE.md`, section « Préférences ») : `export-design-system.mjs` prépare `specs-ui/design-system/`. Le dossier contient le README (thème, vocabulaire des tokens, règles d'usage), `tokens.css`, les fondations (couleurs, typographie, formes), les composants du catalogue (`templates/design-system.html`) et les composants propres au projet, chacun avec le marqueur de carte de Claude Design. La synchronisation se fait par le skill `/design-sync`, lancé par la personne.
- Étape 0 : possibilité, facultative, de partir d'un Design System Claude Design existant comme source d'identité.

## 2.4.0 · 14 oct. 2026

- Correctif : la page principale d'un artifact (publiée sans enveloppe) prenait la police système en 14 px et les couleurs du squelette de l'outil Artifact, dont la règle `body` hors couche l'emportait sur le `@layer base` de Tailwind. Le corps du document est maintenant stylé par une règle hors couche (`html body`) dans l'habillage des templates.

## 2.3.0 · 14 oct. 2026

Retours du lot 2 de Agentic Studio et préparation de la consolidation des lots.

- Script des templates : `data-active` accepte plusieurs identifiants (onglet et projet actifs) ; zones de coquille optionnelles (`data-optional`, affichées avec `data-include`), par exemple la section Administration d'un admin.
- `build.mjs` supprime les pages sans source (écran ou lot retiré) et signale un changement de version du template entre deux constructions.
- `capture.mjs --lot <nom>` limite les contrôles d'un site à un lot ; le contrôle d'isolement des cadres fait deux essais avant d'alerter.
- **Specs fonctionnelles, sans code** : aucun nom de bibliothèque, de fonction, de champ d'API ni de notation technique dans les specs ; une bibliothèque citée dans le brief sert d'inspiration et se traduit en vocabulaire fonctionnel. La consigne précédente (citer les noms techniques dans les annotations) est supprimée.
- `site.json` : `intro` accepte une liste de paragraphes pour l'accueil du site.
- Catalogue : assistant à étapes et son pied. Conventions : plusieurs cadres pour un même état, pastilles dans un tableau.

## 2.2.0 · 14 oct. 2026

Retours du lot 4 de Relais, premier lot produit avec le site multi-pages.

- `CONTEXTE.md` : section « Faits du fil rouge » en chaînes exactes, et écrans modèles et composants partagés dans les conventions. Chercher ces valeurs dans les autres lots était le poste le plus coûteux.
- `split.mjs --new` dans un projet existant : squelette vide (en-tête, règles, points ouverts, journal, annexe d'identité reprise d'un lot), plus 30 Ko d'exemples à remplacer.
- Composants partagés entre lots : tous les fichiers de `sources/shared/` (par exemple `components.html`) sont disponibles dans chaque page.
- `data-clip-ok` marque une coupe voulue ; une pastille coupée indique le conteneur responsable.
- **Répartition entre modèles** : le modèle principal conçoit (fiches d'écran, relecture, décisions), des sous-agents `sonnet` rédigent le HTML des écrans à partir de fiches précises et appliquent les retours, des sous-agents `haiku` exécutent les tâches mécaniques (scripts, extractions, corrections signalées).
- Catalogue : conversation avec un agent, liste de conditions, pipeline horizontal. Comportement des slots absents et de `data-backdrop` documenté. Règle de dates.

## 2.1.0 · 14 oct. 2026

Un projet de specs devient un **site multi-pages publié comme un seul artifact**, au lieu d'un gros document par lot.

- `build.mjs specs-ui` produit `specs-ui/site/` :
  - accueil du projet ;
  - index de chaque lot (en-tête, règles, liste des écrans, points ouverts, journal, annexe) ;
  - une page par écran (tous ses états), avec navigation entre écrans ;
  - copie de `propositions.html`.

  Les liens (`#e13b`, `sessions.html#e13b`, `propositions.html#…`) sont réécrits vers la bonne page, et chaque page n'embarque que les templates qu'elle utilise. Le build liste les pages modifiées et les liens non résolus.
- `sources/site.json` (titre, introduction, artifact, ordre des lots) ; `lot.json` gagne `label` et `screens` (titres courts).
- `split.mjs --new <lot> --root specs-ui` crée un lot depuis le template et l'inscrit dans `site.json`.
- `prepare-publish.mjs specs-ui/site <tmp>` prépare la page principale et la table `files` des **seules pages modifiées** depuis la dernière publication (`--confirm` après publication) ; le mode document isolé reste disponible.
- `capture.mjs` contrôle un fichier ou tout un site (sans image par défaut), découpe les planches (6 desktop ou 10 mobiles par image).
- Procédure de migration d'un projet 1.x documentée (anciens documents rangés dans `archives/`).
- `split.mjs --new` dans un projet existant ignore les coquilles et le thème d'exemple du template ; `build.mjs` signale les identifiants d'écran utilisés dans plusieurs lots.

## 2.0.0 · 13 oct. 2026

Réduction de la consommation de tokens et code en anglais. **Changements incompatibles** : noms des scripts, options et conventions des templates.

- **Mémoire du projet** `specs-ui/CONTEXTE.md` (modèle `templates/contexte.md`) : décisions, identité, disposition, personas, inventaire avec ancres, état des lots et URL, points ouverts, prochaine étape. Lue en premier, mise à jour à chaque étape.
- **Sources par écran** : `specs-ui/sources/<lot>/` (un fichier par écran) et `sources/shared/shells.html` (coquilles communes). `build.mjs` construit le document en injectant `tokens.css`, les coquilles, l'habillage et le script à jour, et la typographie française ; `split.mjs` découpe un document existant. Plus de lecture ni de réécriture de documents de 300 Ko, plus de mise à niveau manuelle, une coquille modifiée une seule fois pour tous les lots.
- **Économie dans SKILL.md** : règles de lecture minimale selon la tâche, captures du moins cher au plus cher, délégation sobre, republication groupée. SKILL.md resserré.
- **capture.mjs** : planche de revue `--sheet` (environ 1 000 tokens pour plusieurs écrans) ; captures de section seulement avec `--sections` ; détection des pastilles coupées par un bord.
- **Code en anglais** (commentaires en français) :
  - scripts : `build`, `split`, `capture`, `check-contrast`, `prepare-publish`, `extract-identity`, `upgrade`, `typography` ;
  - options : `--frames`, `--sheet`, `--thumbnails`, `--height`, `--check`, `--screenshots` ;
  - attributs : `data-frame`, `data-active`, `data-omit`, `data-backdrop`, `data-count`, `data-value`, `data-product-theme`, `data-choice`, `data-slot="content|title"` ;
  - classe `next-step`, tokens `doc-new` et `doc-changed`, paramètres `?only=` et `?frame=`.
- `upgrade.mjs` et `split.mjs` renomment automatiquement les anciennes conventions ; sauvegardes de mise à niveau dans le dossier temporaire du système.
- `prepare-publish.mjs` signale les documents liés absents et les ancres introuvables.
- Consignes : table d'inventaire commune avant tout travail en parallèle, lien vers le premier état d'un écran, factorisation lors d'une évolution transverse, « écart avec la bibliothèque », sens des badges d'écran.

## 1.5.0 · 13 oct. 2026

Retours de l'itération 2 du lot 5 de Relais.

- Détection des pastilles sur du texte : ignore le texte d'un écran de fond (`data-fond`), caché sous le calque ; `capturer.mjs` indique le cadre, le numéro de la pastille et le texte recouvert.
- Nouveau script `mettre-a-niveau.mjs` : met un document ancien au niveau des templates (meta de version, habillage, script final, corps, badges) avec sauvegarde et compte rendu, sans toucher aux maquettes.
- `typographie.mjs` normalise les espaces insécables déjà présentes (U+00A0 / U+202F).
- `preparer-publication.mjs` liste les liens réécrits vers les artifacts.
- Portée de la mise à niveau précisée : les maquettes existantes ne se restructurent pas.
- Procédures « évolution transverse » (analyse d'impact, décisions, inventaire révisé, ordre de production) et « brief qui s'appuie sur une bibliothèque » (vocabulaire repris, correspondance concept → écran, trous transformés en décisions).

## 1.4.0 · 13 oct. 2026

Retours du lot 5 de Relais (sessions et interventions).

- Liens entre documents : `preparer-publication.mjs` remplace les liens relatifs par les URL d'artifact des documents visés ; ordre de publication documenté.
- Pastilles posées sur du texte détectées dans la page et signalées par `capturer.mjs` ; planche des mobiles avec `--vignettes`.
- Version des templates (`meta specs-ui-template`) signalée par `capturer.mjs` ; mise à niveau obligatoire d'un document ancien dès qu'on le modifie.
- Nouveau script `typographie.mjs` (espaces insécables), templates conformes.
- Compteurs automatiques `data-compte` (points ouverts, décisions à prendre).
- Consignes : paramètres des blocs imbriqués, calques avec coquille, cohérence fond / calque, inventaire à plusieurs dimensions, retouches de maintenance sans nouvelle itération, regrouper les republications.

## 1.3.0 · 13 oct. 2026

Retours du lot 1 de Relais (thème dérivé, specs de connexion).

- Coquilles plus souples : `data-sans` retire des zones (`data-zone`) pour un écran, `data-anno-<zone>` annote un élément de la coquille.
- Écran réutilisé en fond d'un calque (`data-fond`) : pastilles, cibles et menus ouverts (`data-menu`) masqués automatiquement.
- Badges Nouveau / Modifié / Existant sur des tokens du document (plus de couleur brute ni de `dark:`).
- `capturer.mjs` détecte une page qui n'isole pas les cadres (fichier issu d'un ancien template) ; procédure de mise à niveau dans SKILL.md.
- L'inventaire validé fait référence et ne se reconstitue jamais de mémoire ; définition du « mobile simplifié » ; choix composite ambigu sans outil de question ; thème dérivé ajouté aux boutons « Thème » ; liens soulignés quand la couleur principale est presque noire.

## 1.2.0 · 13 oct. 2026

Retours sur le test : propositions trop proches, mises en page identiques, maquettes génériques.

- Les « directions visuelles » deviennent des **propositions d'interface = disposition + thème**. Chaque disposition a son propre balisage (navigation, organisation, manière de travailler, version mobile) ; les thèmes sont des jeux de tokens applicables à toutes les dispositions, avec des boutons pour essayer les combinaisons en direct.
- Nouveau template `propositions.html` (remplace `directions.html`) : pilotage (barre latérale, indicateurs, tableau), file guidée (navigation haute, cartes centrées), liste et détail (rail, file compacte, thème sombre).
- Nouvelle référence `qualite-ui.md` : partir de l'usage, point focal, hiérarchie typographique, composition, éviter l'empilement de cartes, couleur et états, détails de produit fini, mobile, et grille de revue obligatoire avant publication.
- `direction-visuelle.md` devient `propositions.md` : dimensions de disposition et de thème, règle de différenciation, test de la vignette.
- Tokens de navigation `nav`, `nav-ink`, `nav-muted`, `nav-active` (barre latérale sombre ou colorée possible), contrôlés par le script de contrastes.
- Variantes de disposition `E5-A` / `E5-B` dans les specs pour itérer sur l'UX après le choix initial.
- `capturer.mjs` : options `--cadres` (chaque maquette seule, à sa taille), `--vignettes` (planche du test de la vignette), `--themes` (combinaisons de thèmes), détection du contenu coupé dans les cadres.
- Nouveau script `preparer-publication.mjs` : copie sans enveloppe pour l'outil Artifact (évite la double enveloppe) ; templates compatibles (corps stylé en CSS, `#page`, paramètres `?seul`, `?cadre`, `?themes`).
- Grilles mobile + annotations sans débordement à 400 px ; pastilles d'état dans le bloc identité ; paires de contraste `muted` sur `primary-soft` et états sur `canvas`.
- Questions jamais seulement dans la conversation : outil de questions interactives pour les choix fermés quand il existe, section « À valider » (inventaire, hypothèses, questions) dans `propositions.html`, report des décisions dans le document.
- Consignes : au moins une disposition issue du domaine, réinterprétation de l'écran permise et signalée, refaire l'étape 1A après un retour (même fichier, encadré « Depuis la version précédente »), boucle de vérification prioritaire, polices non limitées à la liste.

## 1.1.0 · 13 oct. 2026

Corrections issues d'un premier test en conditions réelles (brief d'une plateforme d'agents).

- Nouveau script `capturer.mjs` : une capture par section (`?seul=<id>`), détection des icônes Lucide inconnues et des blocs `data-use` non assemblés. Les captures vont dans un dossier temporaire.
- Templates : les ancres sont rejouées une fois Tailwind prêt, paramètre `?seul=<id>`, navigation collante sous `env(safe-area-inset-top)`, carte « Pour choisir » non étirée.
- Token `--color-on-danger` (plus de `text-white`) : une direction sombre devient possible.
- `line-strong` à 3:1 dans les exemples ; nouvelles paires contrôlées (couleurs d'état sur `surface`, `primary` sur `canvas`, `ink` sur `primary-soft`).
- Direction B du template remplacée (fini crème + terracotta + serif), consignes contre les archétypes, option sombre explicite.
- SKILL.md : chemins `<skill>/scripts/…`, questions regroupées en un seul message (ou aucune si le brief suffit), inventaire présenté avec les directions, briefs découpés en lots avec numérotation unique, portée mobile négociable pour la configuration, règles de l'outil Artifact prioritaires pour la publication.

## 1.0.0 · 13 oct. 2026

- Workflow en étapes : cadrage, identité visuelle (trois directions, site existant ou charte fournie), inventaire, specs, vérification, publication, itérations, passage aux développements.
- Templates Tailwind v4 (CDN) : `directions.html`, `specs.html`, `tokens.css`, avec habillage clair/sombre, blocs réutilisables `data-use` et icônes Lucide.
- Maquettes desktop (1280 × 820) et mobile (390 × 844) systématiques.
- Scripts `extraire-identite.mjs` (URL ou dossier, captures Chrome) et `verifier-contrastes.mjs` (WCAG AA).
- Note de conception pour une future intégration Jira.

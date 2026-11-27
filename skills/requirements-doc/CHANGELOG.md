# Journal des versions

## 2.5.0 · 27/11/2026

- **Specs découpées par fonctionnalités** (`site.json` → `"grouping": "features"`, `specs-ui` 3.10.0) : les libellés suivent (« fonctionnalité par fonctionnalité » en partie 3, colonne « Fonctionnalité » de l'inventaire, des points ouverts, de la couverture et du README de l'export), et `export.json` note le découpage pour `trace.mjs`.
- **Partie 9 « Évolutions et estimations »** pour un produit existant découpé par fonctionnalités (`90-evolutions.md`) : seulement ce qui reste à livrer, regroupé en évolutions chiffrées, sans lot « Socle ». Rien à livrer : pas de partie 9, ni à la création ni au contrôle. `extract.mjs` écrit `generated/a-livrer.md` (états « À développer », « En cours », « À faire évoluer », « Écart »). `check.mjs` signale les écrans à livrer absents des évolutions et une partie 9 encore découpée en lots. Méthode : `references/estimations.md`.
- **`regroup.mjs`** : range le cahier des charges sur les nouveaux groupes des specs après `regroup.mjs` de `specs-ui`. Les critères suivent leur écran, sans renumérotation, et leur nombre est vérifié avant d'écrire. `30-specs.md` et le titre suivent les groupes. Par fonctionnalités, `90-lots.md` va dans `archive/` et `90-evolutions.md` le remplace s'il reste des écrans à livrer. Éprouvé sur un cahier des charges réel de 531 critères : identifiants RF et CA identiques avant et après, contrôle sans problème, export qui remplace les fichiers des anciens lots.
- **Identifiants des règles stables** : une règle marquée `data-rf="CONN-03"` dans les specs garde `RF-CONN-03` quel que soit son groupe ; les autres sont numérotées comme avant, en sautant les numéros pris.
- Nouveau critère d'un groupe regroupé : préfixe du groupe, numéro suivant pour ce préfixe (`references/redacteur.md`).

## 2.4.3 · 20/11/2026

- **La construction de la page HTML ne boucle plus** sur une ligne qui commence par `|` sans ouvrir de tableau (pas de ligne de séparation à la suite) : le rendu n'avançait plus et ajoutait des paragraphes vides jusqu'à saturer la mémoire de Node. La ligne s'affiche désormais en paragraphe.
- **Usage des tokens** (`identite.md`) : seul le commentaire écrit sur la ligne d'un token le décrit. Le titre de section de la ligne suivante (`/* Surfaces */`) n'est plus attribué au token précédent, et un commentaire sur plusieurs lignes tient dans une seule cellule au lieu de casser le tableau, ce qui déclenchait la boucle ci-dessus.

## 2.4.2 · 08/11/2026

- **Trois accents graves dans une phrase** ne tronquent plus le document. L'assemblage, l'export et le contrôle prenaient ```…``` pour un bloc de code où qu'il soit : une annotation des specs qui en citait un s'appariait avec le bloc suivant, et tout ce qui se trouvait entre les deux perdait ses ancres (parties « manquantes », liens cassés). Seule une clôture en début de ligne ouvre désormais un bloc.
- `extract.mjs` échappe ces accents graves (\`\`\`), que la page HTML affiche tels quels ; `check.mjs` signale ceux qui restent au milieu d'une ligne.

## 2.4.1 · 08/11/2026

- **Statut « À faire évoluer »** des specs (`change`, specs-ui 3.9.0) repris à l'extraction de l'inventaire.

## 2.4.0 · 07/11/2026

- **Dépôt de specs** : le cahier des charges vit avec les specs et le prototype dans un dépôt séparé du code de l'application (`references/depot-specs.md` du skill `specs-ui`). `<projet>` désigne le dossier du projet dans ce dépôt ; l'ancienne disposition (`specs/` dans l'application) fonctionne toujours.
- **`export.mjs`** : exporte vers le dépôt de l'application la partie utile au code, en Markdown généré. Il produit un fichier par partie, `lots/<lot>.md` par lot, un `README.md` (version, artifacts, écrans, identifiants) et un `export.json` (source, version, statut des écrans, empreintes).
  - Par défaut, les parties 10 à 80 ; le titre, les lots chiffrés, le planning, les risques et les annexes restent internes (`requirements.json` → `export.parts`).
  - `<!-- export:skip -->` … `<!-- /export:skip -->` garde un passage interne, comme les coûts de 8.10 du gabarit ; le script signale ce qui ressemble encore à un coût ou à une charge.
  - Les liens internes sont réécrits vers le bon fichier. Rien n'est réécrit quand rien n'a changé, et seuls les fichiers d'un export précédent sont supprimés. `--check` dit si l'application est en retard, et affiche les notes de l'export sans rien écrire.
  - Sont refusés, sauf `--force` : un dossier qui ne vient pas d'un export, et une destination hors d'un dépôt git de l'application (clone absent) ou dans un dépôt qui contient aussi les specs. L'étape 6 dit la base des chemins : `--to` depuis le dossier courant, `export.to` depuis le dossier du cahier des charges.
- **Décisions techniques et ADR** : les décisions DT restent dans un seul fichier de l'export (`architecture.md`). Les ADR que l'équipe écrit pendant les développements vivent dans l'application, hors du dossier de l'export ; un ADR qui remplace une DT se reporte dans le cahier des charges, qui marque la DT « Remplacée par ADR-… ». Le `README.md` de l'export le rappelle.
- **`trace.mjs`** :
  - lit aussi un export : la CI de l'application trace ses tests sans le dépôt de specs, avec les statuts d'écran de l'export, et signale un fichier de l'export modifié à la main (`--strict`) ;
  - depuis le dépôt de specs, analyse le dépôt git de l'export (`export.to`), même avant le premier export. Sans clone de l'application, ou sans `export.to` hors de l'ancienne disposition, il le dit et n'analyse rien, au lieu de remonter jusqu'à un dépôt sans rapport (dépôt parent, dépôt de specs lui-même) ;
  - compte à part les critères retirés (« 5 acceptance criteria (1 retired, not counted) »), comme `check.mjs`.
- `assemble.mjs` : inclusions, ancres et ordre des sources, partagés par `build.mjs` et `export.mjs` (le document construit ne change pas).

## 2.3.0 · 17/10/2026

- **Chat claude.ai** : `SKILL.md` renvoie à `references/claude-ai.md` du skill `specs-ui`. La page se publie en version autonome (`bundle.mjs`, Mermaid intégré, sans réseau), avec le Markdown à côté, et le projet se garde dans une archive d'une conversation à l'autre.

## 2.2.0 · 15/10/2026

- **Page HTML hors du dépôt par défaut** : on versionne les sources, le Markdown construit (`requirements.md`, `sources/generated/`) et `.published.json`, plus `requirements.html`, qui se reconstruit et se lit dans l'artifact publié.

## 2.1.0 · 14/10/2026

- **`extract.mjs`** lit les colonnes des points ouverts par leur en-tête (Question, Recommandé, À trancher par, Écrans ; une colonne « # » est ignorée) au lieu de prendre les trois premières cellules : un tableau avec une colonne de plus décalait toutes les valeurs. `generated/points-ouverts.md` gagne la colonne « Recommandé ». Sans en-tête, l'ancien ordre est gardé.

## 2.0.0 · 14/10/2026

- **Disposition `specs/` et noms anglais** (rupture) :
  - le cahier des charges vit dans `specs/requirements` ;
  - `cdc.json` devient `requirements.json` (`artifacts.cdc` → `artifacts.requirements`) et `CDC.md` devient `REQUIREMENTS.md` ;
  - le document est produit dans `requirements.md` et `requirements.html`.

  Les scripts lisent encore un ancien `cdc.json` ; `migrate-layout.mjs` du skill `specs-ui` renomme tout.
- **`trace.mjs`** : traçabilité entre critères d'acceptation (et RF, NF) et code. Il donne, par lot, les critères testés, seulement référencés ou non couverts, les identifiants cités dans le code mais définis nulle part, et les écrans livrés dont des critères ne sont pas testés. `--write` produit `generated/couverture.md`.
- **`prepare-publish.mjs`** : suivi de la publication (`.published.json`, `--confirm`, `--check`).
- **Statut d'implémentation** des écrans repris dans l'inventaire et les lots extraits.
- **Identifiants stables** : jamais renumérotés, un critère abandonné reste barré et « Retiré ». Consigne ajoutée pour les rédacteurs, et texte barré (`~~…~~`) rendu dans la page HTML.
- Section « Maintenir pendant les développements ».

## 1.1.0 · 14/10/2026

- **Page HTML pour l'artifact**, à la place du Markdown brut, peu lisible dans l'artifact. Le Markdown reste produit (fichier local et boutons de copie).
  - La conversion se fait au build et sans dépendance (`render.mjs`) : la page est complète dès le chargement, et les diagrammes `mermaid` sont rendus par l'artifact.
  - Contenu de la page (`templates/page.html`) :
    - sommaire latéral qui suit la lecture ;
    - recherche par identifiant ou écran (« CA-SESS-12 », « E13a ») ;
    - pastilles RF / CA / NF / DT / RQ, renvois cliquables vers les définitions ;
    - « Copier le Markdown » pour le document entier ou une partie ;
    - thème clair et sombre aux couleurs du produit, mobile.
  - Deux fichiers HTML : complet pour le local (diagrammes rendus par mermaid), sans enveloppe pour l'outil Artifact (`cdc/publish/`).
- Nom du document tiré du produit (`cdc.json` → `output`).
- Ancres en ASCII (les liens d'artifact ne transmettent que des ancres simples).
- `check.mjs` signale aussi les identifiants cités sans définition, et calcule les ancres comme le build.

## 1.0.0 · 14/10/2026

Première version.

- Extraction des specs (skill specs-ui 2.1 et plus) en Markdown :
  - inventaire des écrans ;
  - par lot, règles RF numérotées, écrans et états, parcours, règles d'écran et portée mobile ;
  - points ouverts ;
  - tokens.
- Une source par partie, avec gabarits ; assemblage par inclusions, ancres explicites et sommaire.
- Architecture déduite des besoins des specs, proposée en options, décisions DT validées. Stack et infrastructure détaillées : hébergement, environnements, réseau, CI/CD, IaC, observabilité, sauvegardes, sécurité, coûts.
- Découpage avec lot 0 « Socle », estimations en fourchettes, hypothèses et planning.
- Critères d'acceptation par lot, rédigés par des sous-agents depuis l'extraction.
- `check.mjs` :
  - parties manquantes, gabarits non remplis, liens cassés ;
  - lots sans fourchette, écrans non couverts ;
  - diagrammes non refermés, identifiants en double.
- Publication en artifact Markdown.

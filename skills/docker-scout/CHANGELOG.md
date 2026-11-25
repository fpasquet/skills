# Journal des versions

## 1.4.0 · 25/11/2026

Éprouvé sur les images de production d'un monorepo (neuf images publiées par Cloud Build, trois fonctions Cloud Run).

- **Image republiée** : quand une release reprend l'image de préproduction sans couche de plus (`FROM …:staging` puis
  `ENV`), la provenance la déclare comme image de base et toute l'application passait en `base-os`. `scan.mts` remonte à
  la vraie base. Une image de la provenance devenue inaccessible est signalée au lieu d'arrêter l'analyse.
- **Dockerfile à plusieurs cibles** : `detect.mts --target`. La cible par défaut est une étape finale (que personne ne
  réutilise, ou qui a son `CMD`), plus un socle `runtime` partagé, qui donnait un faux « tourne en root ».
- `detect.mts` : un dossier illisible (données d'une base montées par Compose) est ignoré et signalé ; `Dockerfile.x.prod`
  est reconnu ; une image `unprivileged` n'est plus donnée comme root.
- **Espace de travail de Scout sur disque** (`~/.cache/docker-scout-skill`, ou `XDG_CACHE_HOME`) : l'indexation d'une
  grosse image échouait dans un `/tmp` en tmpfs sous quota, et y laissait ses dossiers d'extraction. Ils sont supprimés
  après chaque appel. L'erreur de Scout s'affiche, avec la cause quand c'est la place.
- Faux zéro : un binaire Go sans informations de build (`esbuild` 0.28) est signalé incomplet.
- Rapport : le nombre de failles « restantes » de l'avant et après comptait aussi les failles apparues ; pas de commande
  de build pour une image sans Dockerfile.
- Image de buildpack (Cloud Run functions) : son système vient de la plateforme, le total est signalé incomplet.

## 1.3.0 · 24/11/2026

- `ci.mts` : `--hub-login` et `--hub-input` (connexion à Docker Hub par une action du dépôt, quand le jeton vit hors des
  secrets GitHub), `--when` (analyse éteinte jusqu'au dépôt du jeton), `--no-comment`.
- `change.mts` garde aussi le diff des actions composites (`.github/actions/`).
- Méthode : jouer la commande de blocage sur l'image avant d'écrire la CI ; blocage du lockfile limité aux dépendances de
  production des applications ; migration de données exigée par une montée, en deux temps.
- Éprouvé en CI réelle : étapes ajoutées à un job existant, tous les contrôles de la PR au vert.

## 1.2.0 · 24/11/2026

- **Avant et après** dans le rapport et la vue d'ensemble : chiffres, politiques, taille et image de base des deux
  images ; version d'avant et d'après de chaque paquet corrigé, ou « retiré » ; ce qui reste, avec sa raison ; failles
  apparues ; contrôles passés et à faire ; filtre « Corrigées / Restantes » du détail.
- `change.mts` relève la branche ou la PR de corrections : commits, diff des Dockerfiles et des manifestes, état et CI.
- `compare.mts --markdown` : tableaux pour une issue ou une PR.
- `references/livraison.md` : préparer, vérifier et ouvrir l'issue et la PR, puis republier l'avant et l'après.
- Un scan garde l'inventaire des paquets. La comparaison apparie d'abord les versions égales : un même paquet en deux
  exemplaires ne fausse plus le compte (avant = disparues + restantes).

## 1.1.1 · 24/11/2026

- Méthode : une montée de version n'est donnée comme faisable qu'après toute la chaîne de vérification du projet. Sur le
  monorepo de test, l'image corrigée démarrait, mais une montée cassait la connexion (migration de schéma dans un
  correctif), une autre l'éditeur de texte, une troisième les histoires Storybook.
- Version corrigée minimale pour les paquets sensibles, et conduite à tenir quand les tests échouent.

## 1.1.0 · 24/11/2026

Éprouvé sur un monorepo réel (pnpm 12, API NestJS sur Debian, web Next.js sur Alpine, images construites par Cloud
Build), et l'état des lieux sur quatre autres dépôts.

- **Plusieurs images** : `overview.mts` réunit les rapports en un seul artifact, avec une vue d'ensemble, les corrections
  de toutes les images et le code source.
- **Dépendances compilées** : ce qu'un bundler range dans ses fichiers part en production sans être vu dans l'image. Le
  scan du code source les classe d'après le lockfile (pnpm, npm), par manifeste (`lockfile.mts`, `init.mts --package`).
- **Code source** (`fs://`) : seuls les fichiers suivis par git sont analysés. Un dossier lu tel quel comptait
  `node_modules` et `.terraform` (265 failles d'outils du poste), et 15 paquets sur 2139 d'un lockfile pnpm à deux
  documents YAML. Un lockfile que Scout ne lit pas est signalé.
- **Politique `app`** (`ci.mts --gate app`) : bloque les failles corrigeables hors de l'image de base. `--steps` affiche
  les étapes à ajouter à un job qui construit déjà.
- `detect.mts` : Dockerfile de production déduit des fichiers qui construisent une image (workflows, scripts, Cloud
  Build, motifs comme `${app}.Dockerfile`), jamais un `Dockerfile.dev` par défaut ; nom d'image et manifeste proposés par
  Dockerfile ; contexte de build d'un sous-dossier ; Dockerfile vide ignoré.
- `report.mts` : plus d'arrêt quand `ci.workflow` est vide ; paquet présent en plusieurs versions signalé.
- Méthode : règles du projet lues d'abord, corrections mesurées sur une copie en audit seul, exploitabilité vérifiée dans
  le code, correctif annoncé mais absent de la distribution, délai de publication des paquets respecté.

## 1.0.0 · 24/11/2026

- Première version : audit d'une image Docker avec Docker Scout, corrections mesurées, CI GitHub Actions, rapport HTML
  publié comme artifact. Éprouvé sur une image Node (Debian) et une image Python (Alpine) construites pour l'occasion,
  avec Docker 29 et Docker Scout 1.30.
- Scripts en TypeScript (`.mts`), exécutés directement par Node 22.18 ou plus, sans compilation ni dépendance :
  - `detect.mts` : état des lieux (Dockerfile, cible, image de base, secrets de build, registres privés, CI), écarts du
    Dockerfile, commande de build et questions à poser ;
  - `init.mts` : espace de travail `.docker-scout/` (configuration, mémoire, analyse), scans et rapport hors de git ;
  - `scan.mts` : une analyse normalisée, avec l'origine de chaque paquet. L'image de base exacte vient de l'attestation
    de provenance du build ; elle est analysée aussi, et un paquet est attribué à la base ou au projet par comparaison ;
  - `list.mts`, `compare.mts` : lecture filtrée d'un scan, écart entre deux scans ;
  - `bases.mts` : images de base candidates comparées ;
  - `vex.mts` : exceptions OpenVEX justifiées, visant une version exacte ;
  - `ci.mts` : workflow GitHub Actions (politiques `fixable`, `new`, `report`), Dependabot, liste des secrets à créer ;
  - `report.mts` : rapport HTML, dont tous les chiffres viennent des scans.
- Faux zéro signalé : dans une image distroless, Scout indexe les paquets Debian sous leur nom binaire (`libc6`) et n'en
  trouve aucune faille. Le scan, la comparaison des bases et le rapport le disent.
- Registre de paquets privé, `.npmrc`, miroir et registre d'images privé : rien par défaut, demandés quand `detect.mts`
  en trouve, et pris en charge du build local à la CI sans qu'une valeur de secret soit lue ni écrite.

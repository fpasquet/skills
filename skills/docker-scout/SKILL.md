---
name: docker-scout
description: >
  Audite une image Docker et le code qui la construit avec Docker Scout, corrige les failles CVE et publie le résultat
  comme un rapport HTML (artifact) : failles par sévérité, origine et instruction du Dockerfile, images de base
  comparées, audit du Dockerfile, plan d'action chiffré, commande de build de production, workflow GitHub Actions.
  Corrige par lots (image de base, outils embarqués, paquets système, dépendances), mesure chaque gain par un nouveau
  build, gère les exceptions VEX, les secrets de build (.npmrc, pip.conf…) et les registres privés ou miroirs.
  Utiliser dès que la personne parle de Docker Scout, de CVE, de failles ou de vulnérabilités d'une image ou d'un
  conteneur, de scanner une image, de durcir un Dockerfile, d'image de base obsolète, de SBOM, de provenance, de VEX,
  de bloquer les failles en CI, ou demande si son image de production est sûre, même sans nommer Docker Scout.
compatibility: >
  Docker avec Buildx, plugin CLI Docker Scout, compte Docker Hub gratuit, Node 22.18 ou plus (scripts TypeScript
  exécutés sans compilation). Accès réseau aux registres.
metadata:
  author: fpasquet
  version: "1.0.0"
---

# Audit d'image avec Docker Scout : failles, corrections, CI

Ce skill mène l'audit de sécurité d'une image Docker, de la première analyse à la CI :

1. **construire** l'image de production telle qu'elle part en production ;
2. **analyser** l'image, le code source et des images de base candidates avec Docker Scout ;
3. **corriger** les failles, lot par lot, en mesurant chaque gain par un nouveau build ;
4. **empêcher le retour** des failles par un workflow GitHub Actions et des mises à jour automatiques ;
5. **restituer** le tout dans un rapport HTML publié comme artifact.

Trois demandes possibles, à reconnaître à l'étape 0 : **audit seul** (rapport, sans toucher au code), **audit et corrections** (défaut si la personne veut corriger), **CI seule** (étapes 0, 1 et 6).

Échanges, rapport et commentaires en français. Code, identifiants et noms d'étapes des workflows en anglais.

`<skill>` désigne le dossier de ce skill, `<app>` la racine du projet et `<dir>` l'espace de travail de l'audit : `.docker-scout`, ou `.docker-scout/<image>` quand le dépôt construit plusieurs images. Les scripts sont en TypeScript, lancés directement par Node depuis `<app>` (`node <skill>/scripts/….mts`).

## Économiser les tokens (à lire en premier)

Un scan compte des centaines de failles, et un SBOM plusieurs mégaoctets. Règles :

1. **`<dir>/SCOUT.md` est la mémoire** : build, scans, corrections, décisions, CI, URL de l'artifact. À lire en premier en reprise, à tenir à jour à la fin de chaque étape, sous 100 lignes.
2. **Ne jamais ouvrir un scan** (`scans/*.json`), un SBOM ou un SARIF. `scan.mts` donne une page de résumé, `list.mts` filtre, `compare.mts` donne l'écart entre deux scans.
3. **Ne jamais lire `report.html`** : il est produit par script. On modifie `analysis.json`, puis on relance `report.mts`.
4. **Aucun chiffre écrit à la main** dans l'analyse : les champs `{{current.C}}` et les gains sont calculés depuis les scans.
5. **Regrouper par correction, pas par faille** : une montée d'image de base règle cent failles. On n'ouvre la fiche d'une faille que pour décider d'une exception ou d'une urgence.
6. Un build ou un scan peut dépasser deux minutes : le lancer en arrière-plan ou avec un délai long, sans relancer.

| Rôle | Modèle | Tâches |
|---|---|---|
| Analyse | modèle principal | Choix de l'image de base, ordre des corrections, exceptions, `analysis.json`, revue |
| Rédaction | `sonnet` | Montées de version d'un lot, adaptation du code à une version majeure |
| Exécution mécanique | `haiku` | Builds, scans, tests de démarrage, compte rendu |

| Tâche | À lire |
|---|---|
| Build, secrets, registres privés, miroirs (étape 1) | `references/build.md` |
| Corrections et exceptions (étapes 4 et 5) | `references/remediation.md` |
| GitHub Actions, Dependabot, politique de blocage (étape 6) | `references/ci-github.md` |
| Rapport et publication (étape 7) | `references/report.md` |

## Règles de sécurité

- **Aucune valeur de secret** n'est lue, affichée, écrite dans un fichier ou passée en argument. Un secret se désigne par son emplacement (`id=npmrc,src=$HOME/.npmrc`) ou par son nom en CI. C'est la personne qui se connecte (`! docker login`) et qui crée les secrets GitHub.
- **Les scans et le rapport listent des failles ouvertes** : ils restent hors de git (le `.gitignore` de `<dir>` s'en charge), et l'artifact reste privé. Le dire avant tout partage ; sur un dépôt public, ne pas les joindre à une issue ni à une PR.
- **Rien n'est poussé ni publié sans accord** : image, commit, PR, secret, workflow. Le rapport se publie comme artifact privé quand la personne a demandé un rapport.
- Ne pas supprimer d'image ni vider le cache Docker de la personne. À la fin, proposer la liste des étiquettes créées par l'audit (`<image>:scout`, `<image>:final`…).

## Étape 0 · Repérer et questionner

1. Si `<dir>/SCOUT.md` existe, c'est une reprise : lire la mémoire, puis aller à « Reprise ».
2. État des lieux, en lecture seule :

   ```sh
   node <skill>/scripts/detect.mts <app>      # --dockerfile <chemin> s'il y en a plusieurs
   ```

   Il donne les outils présents, les étapes et la cible du Dockerfile, l'image de base, les secrets de build, les registres privés (lus dans les fichiers de configuration et les lockfiles), la CI, les écarts du Dockerfile, la commande de build proposée et **les questions à poser**.
3. Poser avec **AskUserQuestion** les questions listées, et seulement celles-là, en un ou deux lots. **Par défaut : pas de registre privé, pas de `.npmrc`.** Quand un registre privé apparaît, demander où est le jeton sur le poste et quel secret la CI utilisera (`references/build.md`). Demander aussi, si la conversation ne le dit pas : audit seul ou corrections, et la politique de la CI (étape 6).
4. Créer l'espace de travail, avec les réponses :

   ```sh
   node <skill>/scripts/init.mts .docker-scout --image api --target production [--dockerfile …] [--build-arg MIRROR=] [--secret 'id=npmrc,src=$HOME/.npmrc']
   node <skill>/scripts/detect.mts <app> --out .docker-scout/detect.json
   ```

   `init.mts` signale un `.dockerignore` à compléter. `detect.json` alimente la partie Dockerfile du rapport.

Outil manquant (Scout, connexion Docker Hub, Node trop ancien) : `references/build.md`, « Prérequis ».

## Étape 1 · Construire l'image de production

Lancer la commande affichée par `init.mts`, toujours avec `--pull` : sans lui, une vieille image de base du cache fausse l'audit.

- Le build échoue sur une dépendance privée : `references/build.md`, jamais un jeton en `ARG` ni un `COPY .npmrc`.
- Noter dans `SCOUT.md` la commande qui marche. C'est celle du rapport et de la CI.
- Pas de Dockerfile : proposer d'en écrire un (modèle dans `references/remediation.md`), ou d'analyser une image publiée (`registry://…`).

## Étape 2 · Analyser

```sh
node <skill>/scripts/scan.mts <dir> current api:scout --title "Image actuelle"
node <skill>/scripts/scan.mts <dir> source fs://. --title "Code source"      # lockfiles (développement compris) et actions GitHub
```

Le script lit l'image de base exacte dans l'attestation de provenance du build, l'analyse aussi, puis range chaque paquet par **origine** :

| Origine | Ce que c'est | Comment on corrige |
|---|---|---|
| `base-os` | système et moteur (node, python) de l'image de base | image de base à jour, autre variante |
| `base-tools` | outils livrés avec elle (npm, pip, corepack) | les retirer de l'image finale |
| `app-os` | paquets installés par le Dockerfile | retirer, ou reconstruire sans cache |
| `app` | dépendances de l'application | montée de version, sinon version forcée |
| `ci` | actions GitHub du dépôt (scan `fs://`) | épingler une version corrigée |

Lire les avertissements de fin de sortie :

- **« image de base inconnue »** ou **« aucune couche de … »** : relancer avec `--base <ref>`, sinon l'origine est approximative ;
- **« indexés sous leur nom binaire »** (distroless) ou **« aucun paquet système »** : le total est faux par défaut, une image à zéro faille n'est pas une image sûre (`references/remediation.md`, « Faux zéro »).

## Étape 3 · Comprendre

```sh
node <skill>/scripts/list.mts <dir>:current --origin app --severity critical,high   # une ligne par paquet, version corrective
node <skill>/scripts/list.mts <dir>:current --kev --cves                            # failles exploitées (catalogue CISA)
node <skill>/scripts/bases.mts node:24-slim node:24-trixie-slim node:24-alpine --out <dir>/bases.json
```

1. **Priorité** : failles exploitées (KEV), puis critiques et hautes corrigeables dans du code réellement exécuté, puis EPSS élevé. Une critique sans correctif dans un outil jamais lancé passe après une haute exposée au réseau.
2. **Image de base** : comparer deux à quatre candidates de même usage (même version majeure, autre distribution, image durcie) avec `bases.mts`. `docker scout recommendations` ne propose rien derrière un miroir.
3. **Miroir** : vérifier qu'il sert la version actuelle (`references/build.md`, « Miroir périmé »). C'est souvent le constat principal.
4. **Dépendances** : pour chaque paquet `app`, trouver qui le tire avec l'outil du projet (`pnpm why`, `npm ls`, `uv tree --invert`, `go mod why`… : tableau de `references/remediation.md`). Le rapport l'affiche.

## Étape 4 · Corriger et mesurer

En audit seul, sauter cette étape : les gains seront estimés. Sinon, un lot par commit, dans cet ordre : **image de base** (souvent plus de la moitié des failles), **outils embarqués**, **paquets système du Dockerfile**, **dépendances**, puis **durcissement** (USER, multi-étapes, `.dockerignore`, digest). Recettes par écosystème : `references/remediation.md`.

Pour chaque lot :

1. faire valider avec **AskUserQuestion** ce qui change le comportement : version majeure, changement de distribution, version forcée d'une dépendance transitive ;
2. modifier, reconstruire avec `--pull` et une étiquette propre (`api:base-updated`) ;
3. **vérifier que l'image marche** : tests du projet, démarrage du conteneur et appel de son point de santé. Une image sûre qui ne démarre pas n'est pas une correction ;
4. mesurer :

   ```sh
   node <skill>/scripts/scan.mts <dir> base-updated api:base-updated --title "Image de base à jour"
   node <skill>/scripts/compare.mts <dir>:current <dir>:base-updated
   ```

   Une faille **apparue** se regarde toujours : régression, ou paquet nouveau de la base.
5. noter le lot dans `SCOUT.md` et dans `analysis.json` (`status: "done"`, `gain` mesuré).

Le dernier scan s'appelle `final` : c'est la cible du rapport. Relancer `detect.mts --out` après les modifications du Dockerfile, et lister dans `analysis.json` → `dockerfile.fixed` les règles corrigées si on veut les garder visibles.

## Étape 5 · Exceptions

Une faille sans correctif, ou inexploitable ici, s'écarte par une exception VEX justifiée, jamais en baissant le seuil de la CI :

```sh
node <skill>/scripts/vex.mts <dir> add --cve CVE-2025-0000 --scan final --package pam \
  --justification vulnerable_code_not_in_execute_path --reason "pam_namespace n'est pas activé." --author securite@exemple.fr
```

La justification se **prouve** (code lu, module absent, entrée non contrôlable) et se valide avec la personne, qui en porte la responsabilité. L'exception vise une version exacte : elle tombe à la montée de version. Les fichiers `.vex/` se commitent, la CI les lit. Relancer un scan pour vérifier que la faille disparaît.

## Étape 6 · GitHub Actions

Lire `references/ci-github.md`, choisir la politique avec **AskUserQuestion**, puis :

```sh
node <skill>/scripts/ci.mts <dir> --gate fixable [--sarif] [--source] [--secret npmrc=NPMRC] [--login ghcr] [--push ghcr.io/acme/api]
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest .github/workflows/docker-scout.yml
```

| Politique | Quand | Effet |
|---|---|---|
| `fixable` | l'image n'a plus de critique ni de haute corrigeable | échoue dès qu'il y en a une |
| `new` | il reste de la dette | en PR, échoue si la PR en ajoute ; rapport seul ailleurs |
| `report` | mise en place | n'échoue jamais |

Recommander `fixable` si le scan `final` n'a plus de critique ni de haute corrigeable, `new` sinon. Le script n'écrase rien, propose Dependabot (image de base, actions, dépendances) et liste **les secrets à créer**, que la personne crée elle-même. Un autre outil de CI : reprendre les mêmes commandes (`references/ci-github.md`, « Autre CI »).

## Étape 7 · Rapport et publication

1. Remplir `<dir>/analysis.json` (format et conseils : `references/report.md`) : constats, scénarios, plan d'action, secrets, étapes de mise en place de la CI.
2. `node <skill>/scripts/report.mts <dir> --check`, corriger erreurs et avertissements, puis `node <skill>/scripts/report.mts <dir>`.
3. Contrôler la page (navigateur ou capture) : sommaire, graphiques, tableau filtrable, mobile.
4. Publier `<dir>/report.html` avec l'outil Artifact (`url` si `scout.json` → `artifact` en a une), noter l'URL dans `scout.json` et `SCOUT.md`. Sans outil Artifact, le fichier est autonome : il s'ouvre et s'envoie tel quel.
5. Répondre en quelques lignes : avant et après, ce qui reste et pourquoi, décisions attendues, lien.

## Reprise

- **Nouvel audit périodique** : `--pull`, nouveau scan `current-AAAAMM`, `compare.mts` avec le `final` précédent, relecture des exceptions (`vex.mts <dir> list`), mise à jour du même artifact.
- **Alerte de la CI** : reproduire en local avec la même étiquette, `list.mts --fixable`, corriger par l'étape 4.
- **Scans absents** (ils ne sont pas dans git) : refaire `current` et `final` avant de toucher au rapport.

## Contrôle final

- [ ] image construite avec `--pull`, et démarrée après corrections ;
- [ ] `compare.mts current final` lu, failles apparues expliquées ;
- [ ] aucune valeur de secret dans les fichiers ni dans l'historique de l'image (`docker history --no-trunc`) ;
- [ ] `scans/` et `report.html` hors de git, `.docker-scout` dans `.dockerignore` ;
- [ ] workflow validé par actionlint, secrets listés à la personne ;
- [ ] `report.mts --check` sans erreur, artifact à jour, `SCOUT.md` à jour.

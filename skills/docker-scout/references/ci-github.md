# GitHub Actions

## Ce que fait le workflow

`ci.mts` écrit `.github/workflows/docker-scout.yml`, lancé sur chaque PR, sur la branche principale, chaque semaine, et à la main :

1. build de l'image de production, avec le cache GitHub (`no-cache` sur l'analyse planifiée, pour prendre les correctifs système) ;
2. résumé Scout en commentaire de PR, liste des failles corrigeables dans le résumé du job ;
3. options : SARIF dans l'onglet Security (`--sarif`), lockfiles et actions (`--source`), issue quand l'analyse planifiée échoue (`--issue`) ;
4. blocage selon la politique ;
5. option `--push` : publication depuis la branche principale, après l'analyse, avec SBOM et provenance.

L'analyse planifiée est la partie la plus utile : une image qui n'a pas changé peut devenir vulnérable.

Les actions sont épinglées par empreinte de commit (`templates/workflows/versions.json`), Dependabot les tient à jour. Avant de générer, vérifier qu'elles ne datent pas trop (`gh release view -R docker/scout-action`).

## Questions à poser

| Question | Option |
|---|---|
| Bloquer dès maintenant, hors image de base, ou seulement les nouvelles failles ? | `--gate fixable`, `app`, `new`, `report` |
| Dépôt public, ou Code Security actif sur un dépôt privé ? | `--sarif` (sinon l'envoi échoue) |
| Le build a-t-il besoin d'un secret (`.npmrc`…) ? Par défaut non | `--secret <id>=<NOM_DU_SECRET>` |
| L'image de base est-elle sur un registre privé ? Par défaut non | `--login ghcr`, `dhi`, `ecr:<hôte>`, `gar:<hôte>`, `other:<hôte>` |
| La CI publie-t-elle déjà l'image ? Où ? | `--push <image>`, ou ajouter les étapes d'analyse au workflow existant |
| Branche principale autre que `main` ? | `--branch` |

Un workflow construit déjà l'image (`detect.mts` le dit) : ne pas construire deux fois. `ci.mts --steps --image-ref '<image du job>'` affiche les seules étapes Scout, à placer après son build (matrice comprise). L'analyse planifiée, elle, demande un workflow à part : `--pull --no-cache`, sans quoi elle relit une vieille image.

## Lockfile

`--source` analyse les fichiers suivis par git, exportés à part : un `fs://.` direct lit aussi les dépendances installées par une étape précédente. Le lockfile de pnpm 11 et plus a deux documents YAML, dont Scout ne lit que le premier (quelques paquets de pnpm lui-même) : l'étape d'export ne garde que le dernier. Un contrôle : le nombre de paquets indexés, qui doit être celui du lockfile.

## Politique de blocage

- **`fixable`** : `cves --only-severity critical,high --only-fixed --exit-code`. Seules les failles qu'on peut corriger bloquent.
- **`app`** : la même, avec `--ignore-base`. L'équipe n'est bloquée que par ce qu'elle choisit (dépendances, paquets du Dockerfile). Scout reconnaît l'image de base à ses couches : vérifier en local que la commande écarte bien ses failles.
- **`new`** : construit aussi la branche de base et compare (`compare --exit-on vulnerability`). Scout échoue dès qu'une faille est **ajoutée**, même si le bilan est meilleur : une montée d'image de base qui retire cinquante failles et en ajoute une sera bloquée. Dans ce cas, corriger la faille ajoutée, l'écarter (VEX), ou fusionner en connaissance de cause. Le second build allonge le job.
- **`report`** : première semaine, ou dépôt sans équipe pour traiter.

Passer de `report` à `new`, puis à `fixable` quand la dette est soldée. Rendre le job obligatoire dans la protection de branche est une décision de la personne.

## Secrets

`ci.mts` liste les noms. La personne crée les valeurs :

```sh
gh variable set DOCKERHUB_USERNAME
gh secret set DOCKERHUB_TOKEN                    # valeur demandée, ou lue sur l'entrée standard
gh secret set DOCKERHUB_TOKEN --app dependabot   # les PR de Dependabot ont leurs propres secrets
gh secret set NPMRC < ~/.npmrc                   # un .npmrc réduit au registre utile, avec un jeton en lecture
```

- Le projet a sa propre règle (Secret Manager, Vault, identités fédérées) : la suivre, en reprenant le modèle d'un workflow qui lit déjà un secret. Masquer la valeur lue (`::add-mask::`) avant de s'en servir.
- Jeton Docker Hub : un compte de service, en lecture seule. Scout ne fait pas payer l'analyse locale ; l'offre gratuite limite le nombre de dépôts suivis sur scout.docker.com, que ce workflow n'utilise pas.
- Les secrets de build passent par `secret-envs` : la valeur reste dans l'environnement de l'étape, et un `.npmrc` de plusieurs lignes passe sans échappement.
- AWS et Google Cloud : identité fédérée (OIDC), sans clé enregistrée.
- Les PR venues d'un fork n'ont pas les secrets : le job est ignoré. Ne jamais passer à `pull_request_target` pour contourner cela, il exécuterait le code du fork avec les secrets.

## Mises à jour automatiques

Une CI qui bloque sans mise à jour automatique se fait désactiver. `ci.mts` écrit `.github/dependabot.yml` s'il n'existe pas, affiche sinon ce qui manque : `docker` (image de base et digest), `github-actions`, et les gestionnaires du projet.

- Dependabot ne met pas à jour une image composée par `ARG`. Écrire l'étiquette et le digest dans le `FROM`, ou passer à Renovate.
- Renovate : `config:recommended` et `docker:pinDigests` ; `ci.mts` n'écrit rien si sa configuration existe.
- Dependabot trouve les fichiers dont le nom contient « dockerfile » dans le dossier déclaré (`directory: /infra/dockerfiles`).
- Registre privé : Dependabot a besoin d'un bloc `registries` avec un secret `dependabot`.

## Vérifier

```sh
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest .github/workflows/docker-scout.yml
```

Puis, avec l'accord de la personne : pousser une branche, lire le premier passage (`gh run watch`), vérifier le commentaire et la politique. Erreurs fréquentes :

| Message | Cause |
|---|---|
| `Password required` à la connexion | secret absent : fork, PR de Dependabot, ou nom différent |
| `Resource not accessible by integration` | permission manquante, ou Code Security inactif pour le SARIF |
| `secret npmrc: not found` | identifiant différent entre le Dockerfile et `--secret` |
| image introuvable (`local://`) | build sans `load: true`, ou plusieurs plateformes (en charger une seule) |

## Autre CI

Mêmes commandes, après `docker login` et l'installation du plugin :

```sh
docker build --pull --target production --tag api:ci .
docker scout cves --only-severity critical,high --only-fixed --exit-code local://api:ci        # code 2 si une faille correspond
docker scout cves --format gitlab --output gl-container-scanning-report.json local://api:ci     # rapport GitLab
```

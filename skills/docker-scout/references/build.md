# Construire l'image de production

## Prérequis

| Outil | Contrôle | Installation |
|---|---|---|
| Docker et Buildx | `docker version`, `docker buildx version` | paquet de la distribution, ou Docker Desktop |
| Docker Scout | `docker scout version` | inclus dans Docker Desktop ; sous Linux, voir ci-dessous |
| Compte Docker Hub | `docker login` | gratuit ; Scout exige une connexion, même pour une image locale |
| Node 22.18 ou plus | `node -v` | exécute les scripts TypeScript sans compilation |

Plugin Scout sous Linux, avec l'accord de la personne (le script s'installe dans `~/.docker/cli-plugins`) :

```sh
curl -fsSL https://raw.githubusercontent.com/docker/scout-cli/main/install.sh -o install-scout.sh
sh install-scout.sh
```

La connexion est interactive : proposer à la personne de taper `! docker login`. Pour une image locale, Scout n'envoie à Docker que l'identité des paquets (nom, version) et l'empreinte des couches.

## Commande

`init.mts` l'affiche et `SCOUT.md` la garde. Forme générale :

```sh
docker build --pull --target production --tag api:scout .
```

- `--pull` : toujours. L'audit doit porter sur l'image de base actuelle.
- `--no-cache` : quand le Dockerfile installe des paquets système (`apt-get`, `apk`) et qu'on veut leurs dernières versions. Le cache garde une couche `apt-get install` tant que l'instruction ne change pas.
- `--platform linux/amd64` : si la production n'a pas l'architecture du poste (Mac ARM).
- `docker build --check .` : contrôles de BuildKit sur le Dockerfile, en complément de `detect.mts`.

L'analyse d'une image déjà publiée se passe de build : `scan.mts <dir> current registry://ghcr.io/acme/api:1.4.0`. C'est utile pour savoir ce qui tourne vraiment en production.

## Registre de paquets privé

Par défaut, il n'y en a pas. `detect.mts` en trouve dans `.npmrc`, `.yarnrc.yml`, `pip.conf`, `pyproject.toml`, `composer.json`, `nuget.config`, `pom.xml`, et dans les adresses des lockfiles. Alors demander :

1. le registre exige-t-il un jeton en lecture ? (certains miroirs internes sont ouverts sur le réseau)
2. quel fichier ou quelle variable le contient sur le poste ?
3. en CI, quel secret GitHub le portera, ou une identité fédérée (OIDC) ?

Un jeton passe par un **secret de build** : il est monté pendant le `RUN`, et n'entre ni dans une couche ni dans l'historique.

| Écosystème | Dockerfile | Poste |
|---|---|---|
| npm, pnpm, Yarn 1 | `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci --omit=dev` | `--secret id=npmrc,src=$HOME/.npmrc` |
| Yarn 4 | `RUN --mount=type=secret,id=npm_token,env=NPM_TOKEN yarn install --immutable` | `--secret id=npm_token,env=NPM_TOKEN` |
| pip, uv | `RUN --mount=type=secret,id=pipconf,target=/etc/pip.conf pip install …` ; uv : `env=UV_INDEX_<NOM>_PASSWORD` | `--secret id=pipconf,src=$HOME/.config/pip/pip.conf` |
| Composer | `RUN --mount=type=secret,id=composer_auth,env=COMPOSER_AUTH composer install --no-dev` | `--secret id=composer_auth,env=COMPOSER_AUTH` |
| Maven | `RUN --mount=type=secret,id=maven,target=/root/.m2/settings.xml mvn package` | `--secret id=maven,src=$HOME/.m2/settings.xml` |
| Go | `RUN --mount=type=secret,id=netrc,target=/root/.netrc go mod download` (avec `GOPRIVATE`) | `--secret id=netrc,src=$HOME/.netrc` |
| Git privé (SSH) | `RUN --mount=type=ssh npm ci` | `--ssh default` |

- Le chemin `target` est celui de l'utilisateur du build : `/root/.npmrc` pour root, `/home/node/.npmrc` pour `node` (ajouter `uid=1000`).
- Un `.npmrc` de projet peut rester dans le dépôt s'il ne contient que l'adresse et une variable : `//npm.acme.example/:_authToken=${NPM_TOKEN}`. Jamais le jeton.
- Un jeton trouvé en clair dans un fichier suivi par git, ou dans `docker history --no-trunc` : le dire tout de suite, il faut le **révoquer**. Le supprimer du fichier ne suffit pas.

Puis recréer l'espace de travail, ou compléter `scout.json` → `build.secrets` avec l'emplacement du secret.

## Image de base sur un registre privé ou un miroir

- Connexion, par la personne : `! docker login registry.acme.example`, `gcloud auth configure-docker europe-docker.pkg.dev`, `aws ecr get-login-password | docker login --username AWS --password-stdin <hôte>`, `! docker login dhi.io` (images durcies de Docker).
- Le préfixe du miroir se passe en argument (`ARG MIRROR=`, `FROM ${MIRROR}node:24-slim`). Avec `--build-arg MIRROR=`, on construit la même image sur la base officielle, ce qui mesure l'écart. Dependabot ne met pas à jour une image composée par `ARG`.

### Miroir périmé

Un miroir (cache de registre) peut servir une étiquette figée depuis des mois, même avec `--pull`. Comparer les digests :

```sh
docker buildx imagetools inspect <miroir>/node:24-slim --format '{{.Manifest.Digest}}'
docker buildx imagetools inspect node:24-slim --format '{{.Manifest.Digest}}'
```

S'ils diffèrent, construire une variante sur l'image officielle, l'analyser sous le label `base-official`, et chiffrer l'écart avec `compare.mts`. La correction durable : faire rafraîchir le miroir, ou épingler l'image par digest (le miroir doit alors la récupérer).

## Publier

```sh
docker buildx build --pull --target production --sbom=true --provenance=mode=max --push --tag ghcr.io/acme/api:1.4.0 .
```

`--sbom` et `--provenance=mode=max` attachent à l'image les attestations que demande la politique « supply chain ». `mode=max` publie les valeurs des arguments de build : vérifier qu'aucun n'est sensible. Publier reste un geste de la personne ou de la CI.

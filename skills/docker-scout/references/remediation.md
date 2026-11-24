# Corriger les failles

L'ordre compte : chaque étape supprime des failles que la suivante n'aura plus à traiter.

## 1. Image de base

Candidates à mesurer avec `bases.mts`, selon l'application :

| Variante | Pour | Contre |
|---|---|---|
| même étiquette, reconstruite | aucun changement de code | l'étiquette doit être encore maintenue (`node:22.12` ne l'est plus, `node:22` ou `node:24` oui) |
| `-slim` au lieu de l'image complète | beaucoup moins de paquets | outils de build absents : les garder dans une étape de build |
| distribution plus récente (`-trixie-slim`) | moins de failles sans correctif | versions de bibliothèques système différentes, à tester |
| Alpine | petite | musl : modules natifs, DNS et performances à tester |
| image durcie (`dhi.io/…`, gratuite avec un compte Docker Hub) | très peu de paquets, non root, VEX fournis | pas d'interpréteur de commandes ni de gestionnaire de paquets dans la variante d'exécution, ports sous 1024 interdits, pas d'étiquette `latest` ; les variantes `-dev` servent aux étapes de build |
| distroless, `scratch` | presque rien à corriger | pas d'interpréteur, et un scan incomplet (ci-dessous) |

- Choisir une version **maintenue** du moteur (LTS) : une faille de Node ou de Python se corrige par sa version.
- **Épingler par digest** une fois la base choisie : `FROM node:24-trixie-slim@sha256:…` (le digest est en fin de sortie de `bases.mts`). Sans mise à jour automatique (étape 6), un digest fige aussi les failles.
- Une version majeure du moteur ou une autre distribution se valide avec la personne, puis par les tests.

### Correctif annoncé mais absent

Scout annonce parfois une version que la distribution de l'image ne propose pas encore (un `musl` publié dans une branche d'Alpine plus récente, par exemple). Vérifier avant de promettre :

```sh
docker run --rm -u root --entrypoint sh <image> -c 'apk update >/dev/null && apk policy musl'
docker run --rm -u root --entrypoint sh <image> -c 'apt-get update -qq && apt-cache policy libssl3t64'
```

Si elle manque, la noter « à suivre », et choisir la politique `app` en CI. Le cas inverse existe aussi : le correctif est dans la distribution, mais l'image officielle n'a pas été reconstruite. `apk upgrade --no-cache` (ou `apt-get upgrade`) dans l'étape finale le prend en attendant.

### Faux zéro

Scout rapproche les paquets Debian et Ubuntu des avis de sécurité par leur **paquet source** (`glibc`, `openssl`). Dans une image distroless, il n'indexe que les noms binaires (`libc6`, `libssl3t64`) et n'affiche aucune faille, alors que la même version d'OpenSSL en a dans l'image Debian. Les scripts le signalent (« incomplet »). Même effet si le Dockerfile supprime la base dpkg ou apk.

Dans ce cas, ne pas présenter zéro comme un résultat : comparer la version des paquets système à celle d'une image `-slim` de la même distribution, et s'appuyer sur la date de reconstruction. L'intérêt d'une image minimale reste réel (moins de code exposé), mais il ne se lit pas dans ce total.

## 2. Outils embarqués (`base-tools`)

L'image officielle Node contient npm, Yarn et corepack ; celle de Python, pip. Le conteneur n'en a en général pas besoin.

```dockerfile
# Dans l'étape finale, avant USER
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
```

- L'installation des dépendances passe dans une autre étape, et `CMD` lance le moteur directement (`["node", "dist/main.js"]`, pas `npm start`).
- Vérifier ce qui s'exécute au démarrage : migrations (`npx prisma migrate`), scripts d'entrée. Les lancer par leur fichier (`node node_modules/prisma/build/index.js`).
- Le `rm` masque les fichiers : le scan ne les voit plus et ils ne sont plus exécutables, mais la taille ne baisse pas. Pour la taille, copier seulement le moteur dans une image nue.
- Python : `pip uninstall -y pip setuptools wheel` en fin d'étape, ou copier l'environnement virtuel depuis l'étape de build.

## 3. Paquets système du Dockerfile (`app-os`)

`list.mts --origin app-os` montre l'instruction qui les amène. Un seul paquet en tire beaucoup : `curl` apporte Kerberos, LDAP et OpenSSL.

- Retirer ce qui ne sert qu'au build ou au diagnostic (`curl`, `git`, `python3`, `build-essential`) : étape de build.
- `curl` pour un `HEALTHCHECK` : le remplacer par le moteur (`node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`) ou par la sonde de l'orchestrateur.
- `--no-install-recommends` (apt), `--no-cache` (apk).
- Restent nécessaires : reconstruire avec `--no-cache` pour prendre les correctifs de la distribution. `apt-get upgrade` dans l'image finale est un pis-aller, acceptable quand l'image de base tarde à être reconstruite.

## 4. Dépendances de l'application (`app`)

Pour chaque paquet, dans l'ordre : monter la dépendance **directe** qui le tire ; si elle n'a pas de version corrigée, forcer la version transitive ; sinon remplacer ou écarter (exception).

| Écosystème | Qui tire le paquet | Monter | Forcer une version transitive |
|---|---|---|---|
| npm | `npm ls <paquet> --all`, `npm explain <paquet>` | `npm install <direct>@<version>` | `overrides` de `package.json` |
| pnpm | `pnpm why -r <paquet>` | `pnpm up -r <direct>@<version>` | `overrides` de `pnpm-workspace.yaml` (`"validator@<13.15.22": ^13.15.22`) |
| Yarn 4 | `yarn why -R <paquet>` | `yarn up <direct>@<version>` | `resolutions` de `package.json` |
| Bun | `bun why <paquet>` | `bun update <direct>` | `overrides` de `package.json` |
| pip | `pipdeptree -r -p <paquet>` | `requirements.txt` | fichier de contraintes (`-c constraints.txt`) |
| uv | `uv tree --invert --package <paquet>` | `uv lock --upgrade-package <paquet>` | `[tool.uv] override-dependencies` |
| Poetry | `poetry show --why <paquet>` | `poetry update <paquet>` | contrainte directe dans `pyproject.toml` |
| Go | `go mod why -m <module>` | `go get <module>@<version> && go mod tidy` | `replace` (dernier recours) |
| Maven | `mvn dependency:tree -Dincludes=<groupe>` | version du parent ou du BOM | `dependencyManagement` |
| Gradle | `gradle dependencyInsight --dependency <paquet>` | catalogue de versions | `constraints`, `resolutionStrategy` |
| Composer | `composer why <paquet>` | `composer update <paquet> --with-dependencies` | `conflict` sur les versions vulnérables |
| Cargo | `cargo tree -i <crate>` | `cargo update -p <crate> --precise <version>` | `[patch.crates-io]` |
| Bundler | `gem dependency <gem> --reverse-dependencies` (ou `Gemfile.lock`) | `bundle update --conservative <gem>` | gem directe dans le `Gemfile` |
| .NET | `dotnet nuget why <projet> <paquet>` | `dotnet add package` | référence directe du paquet |

- **Version corrigée minimale** pour ce qui est sensible (authentification, paiement, éditeur, ORM) : la dernière version d'une plage `^` peut porter vingt correctifs de plus, avec des changements de comportement ou de schéma. Lire les notes de version entre l'actuelle et la cible, chercher les migrations, et préférer une version corrigée proche. Une plage `^` qui laisse passer une version cassante se signale.
- **Échec des tests après une montée** : isoler le paquet en cause (une montée à la fois), comparer avec un passage sur la branche de départ (test instable ou vraie régression), chercher le correctif dans l'écosystème (outil de test, mocks), sinon tenir le paquet sur la branche corrigée précédente par une version forcée, avec le motif et un ticket. Une montée qui demande une migration sort du lot et devient une action à part.
- **Forcer une version majeure** d'une dépendance transitive casse souvent son parent : lire ses changements, lancer les tests, et préférer une exception à une rustine fragile.
- **Délai de publication** (`minimumReleaseAge` de pnpm, `npmMinimalAgeGate` de Yarn) : ne pas ajouter d'exception pour prendre une version du jour. Demander la dépendance sans version (`pnpm up -r <paquet>`) : pnpm prend la plus récente qui a l'âge requis, souvent déjà corrigée. `pnpm up -r --depth 20 <paquet>` met à jour une dépendance indirecte dans le seul lockfile.
- Chaque version forcée se note dans `SCOUT.md` avec la condition pour l'enlever (« quand express dépendra de qs ≥ 6.15 »).
- Paquet présent dans l'image mais de développement : l'installation de production est incomplète (`--omit=dev`, `--prod`, `--no-dev`, `uv sync --no-dev`).
- Binaire Go ou Rust : la bibliothèque standard est dans le binaire, elle se corrige en recompilant avec un compilateur à jour. `govulncheck` dit si le code vulnérable est appelé.
- Le gestionnaire a aussi son audit (`npm audit`, `pip-audit`…), utile pour la version corrective, mais le chiffre de référence reste celui du scan de l'image.

## 5. Dépendances compilées

Un bundler (Next.js, Vite, esbuild, rspack) range les dépendances dans ses fichiers : Scout ne les identifie plus, et le total de l'image est un minimum. Le scan `source` les nomme (« Production, hors de l'image »).

- Confirmer la présence : `docker run --rm --entrypoint sh <image> -c "grep -rlE '<paquet>' /app/apps/web/.next/static | head"`.
- Une faille de l'interface (XSS d'un éditeur de texte, d'un rendu Markdown) touche les navigateurs : même priorité qu'une faille de l'image.
- La montée de version se mesure sur le lockfile (second scan `source`), pas sur l'image.
- En CI, analyser aussi le lockfile (`ci.mts --source`).

## 6. Durcissement

| Règle de `detect.mts` | Correction |
|---|---|
| `root-user` | `USER node` (Node), `USER 10001` ailleurs ; fichiers copiés avec `--chown`, dossiers d'écriture créés avant |
| `single-stage` | étapes `deps`, `build`, `production` (modèle ci-dessous) |
| `secret-in-layer`, `secret-file` | `RUN --mount=type=secret` (`references/build.md`), et révoquer le jeton exposé |
| `dockerignore`, `wide-copy` | `.dockerignore` complet, `COPY` des seuls fichiers exécutés |
| `base-tag`, `base-digest`, `base-arg` | étiquette précise et digest dans le `FROM` |
| `lockfile` | `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable` |
| `bundled-npm`, `package-manager-cmd` | partie 2 |
| `pipe-to-shell`, `add-remote` | version épinglée et somme vérifiée |

À l'exécution, hors de l'image : système de fichiers en lecture seule, `--cap-drop=ALL`, `no-new-privileges`. Ils réduisent l'impact d'une faille, et peuvent justifier une exception.

Modèle (Node, npm) :

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-trixie-slim@sha256:… AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
RUN rm -rf /usr/local/lib/node_modules /opt/yarn* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

## 7. Vérifier

```sh
# Sans base ni environnement : charger le module racine et les extensions natives suffit souvent à prouver l'image
docker run --rm api:final --input-type=module --eval "await import('./dist/app.module.js'); process.exit(0)"
docker run --rm -d --name scout-check -p 3000:3000 api:final
docker logs scout-check && curl -fsS http://localhost:3000/health
docker rm -f scout-check
docker history --no-trunc api:final | grep -iE 'token|password|secret'   # rien ne doit sortir
```

## 8. Exceptions VEX

Une exception dit que l'image n'est **pas affectée**, avec une justification d'OpenVEX :

| Justification | Se prouve par |
|---|---|
| `component_not_present` | le composant signalé n'est pas dans l'image (erreur de détection) |
| `vulnerable_code_not_present` | la partie vulnérable n'est pas embarquée (option de compilation, module retiré) |
| `vulnerable_code_not_in_execute_path` | le code n'est jamais appelé par l'application |
| `vulnerable_code_cannot_be_controlled_by_adversary` | aucune entrée externe n'atteint le code |
| `inline_mitigations_already_exist` | une protection en place bloque l'attaque |

- « Pas de correctif disponible » n'est pas une justification : sans preuve, la faille reste visible. Le seuil de la CI (`only-fixed`) ne bloque déjà pas dessus.
- Scout n'applique que les exceptions des auteurs demandés par `--vex-author` (par défaut, ceux de `docker.com`). `vex.mts` note l'auteur dans `scout.json`, et les scripts comme la CI le passent.
- L'identifiant de l'image s'écrit `pkg:docker/api`, et `pkg:docker/acme/api?repository_url=ghcr.io` pour un registre. `--registry-image` ajoute le second.
- À chaque audit, relire la liste : une exception dont le paquet a changé de version ne s'applique plus, et se retire.

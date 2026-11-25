# Livrer les corrections

Une issue et une PR sont des écritures distantes : seulement à la demande de la personne, dans le dépôt qu'elle désigne.

## Préparer

1. **Règles du dépôt** : `AGENTS.md`, `CONTRIBUTING.md`, modèles d'issue et de PR, convention de commit et de branche, étiquettes, PR et issues ouvertes sur le même sujet (Dependabot compris). Elles l'emportent sur ce qui suit.
2. **Visibilité** (`gh repo view --json visibility`) : sur un dépôt public, ne jamais dire quelles failles l'image porte, ni combien. Ni identifiant, ni paquet vulnérable, ni total, ni tableau avant/après, ni lien vers le rapport ou vers un dépôt privé ; la règle vaut pour l'issue, la PR, le nom de branche, les commits, les commentaires du code, le changeset et le CHANGELOG. Décrire la montée et le durcissement pour eux-mêmes (distribution maintenue, image plus petite, moins d'outils embarqués), et garder le détail dans l'artifact privé ou un avis de sécurité privé du dépôt.
3. **Compte** : `gh api repos/<depot> --jq .permissions` avec le bon compte (`GH_TOKEN=$(gh auth token --user <compte>)`).
4. **Worktree** : travailler à côté, pour ne pas toucher aux fichiers ni au `node_modules` de la personne.

   ```sh
   git fetch && git worktree add -b fix/image-vulnerabilities <copie> origin/main
   ```

   Le retirer à la fin (`git worktree remove`). Ne pas lancer de suite qui réinitialise la base locale de la personne : la laisser à la CI, et le dire.

## Vérifier avant de proposer

Dans l'ordre, sur l'état exact qui sera commité : format, lint, types, tests unitaires, build, scénarios de bout en bout possibles, histoires Storybook, images construites et démarrées, scan.

- Un échec se compare à la branche de départ : test instable ou régression ?
- Isoler le paquet en cause, une montée à la fois (`references/remediation.md`).
- Une montée qui demande une migration, un changement de schéma ou une version majeure **sort de la PR** et entre dans l'issue, avec ce qui a été constaté.
- Noter chaque contrôle dans `analysis.json` → `checks` : `pass`, `todo` (avec qui ou quoi le fera) ou `fail`.

## Issue

Reprend le modèle du dépôt. Elle contient :

- le total par image, le commit analysé, la commande de reproduction ;
- ce qui est **à traiter en premier**, et pourquoi (atteignable ou non, d'après le code) ;
- une liste à cocher : ce que la PR corrige, ce qui demande une migration, ce qui attend un correctif en amont, ce qui est à décider (CI, image de base).

Elle reste ouverte tant que la liste n'est pas vide : la PR écrit `Ref #…`, pas `Closes #…`, si elle n'en traite qu'une partie.

## PR

- Commits atomiques : dépendances, outils retirés de l'image, paquets système.
- Documentation du dépôt mise à jour dans le même commit que ce qu'elle décrit ; motif d'une version forcée dans un commentaire, avec le numéro de l'issue.
- Corps : `compare.mts --markdown` pour l'avant et l'après, ce qui n'y est **pas** et pourquoi, ce qui a été vérifié, ce qui ne l'a pas été, ce qu'il faut regarder à la main.
- État (brouillon ou prête) : celui que veut la personne, brouillon dans le doute. Un brouillon ne déclenche pas toujours la CI.

## Avant et après

1. Reconstruire les images **depuis le commit de la PR** (`git archive <commit> | tar -x -C <copie>`), étiquette `pr-<numéro>`, et les analyser sous le même label. Un scan fait en cours de travail peut différer.
2. Analyser aussi le lockfile de la PR (`scan.mts … source-pr-<numéro> fs://<copie>`, la copie étant un dépôt git : `git init`), car l'image ne montre pas les dépendances compilées.
3. `analysis.json` → `target`, `checks`, `remaining` ; `overview.json` → `sourceTarget`, `checks`.
4. `change.mts` relève la PR (commits, diff des Dockerfiles et des manifestes, état, CI). Il ne lit ni lockfile ni fichier d'environnement ; relire tout de même le diff avant de publier.
5. Republier le même artifact, et corriger ce que les tests ont démenti : un rapport qui recommande une montée cassante est une erreur à corriger tout de suite.

Le relevé se relance quand la PR avance (CI passée, relecture, fusion).

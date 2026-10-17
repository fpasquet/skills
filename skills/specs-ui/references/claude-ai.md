# Travailler dans le chat claude.ai

Consignes communes aux trois skills de la chaîne (`specs-ui`, `prototype-ui`, `requirements-doc`) quand ils tournent dans le chat claude.ai plutôt que dans Claude Code. Le reste de chaque `SKILL.md` s'applique tel quel ; seuls changent la reprise d'un projet, la publication, les contrôles en navigateur et l'accès au réseau.

## 1. Reconnaître l'environnement

On est dans le chat claude.ai quand l'outil Artifact de Claude Code (paramètres `file_path` et `files`) n'existe pas et que le bac à sable d'exécution de code est là : dossier `/mnt/user-data/` (fichiers joints dans `uploads/`, livrables dans `outputs/`), skills sous `/mnt/skills/`. Vérifier avec `ls /mnt/user-data /mnt/skills/*/` plutôt que supposer.

Trois différences commandent tout le reste :

- **le disque ne dure pas** : chaque conversation repart d'un bac à sable vide ;
- **un artifact ne contient qu'un fichier**, sans publication incrémentale ni URL stable à mettre à jour ;
- **le réseau est filtré** (par défaut, gestionnaires de paquets seulement) et **Chrome n'est pas installé**.

`<specs-ui>` désigne le dossier du skill `specs-ui` (par exemple `/mnt/skills/user/specs-ui`) : `pack.mjs` et `bundle.mjs` y vivent et servent aux trois skills.

## 2. Reprendre un projet : l'archive `specs.zip`

L'archive du dossier `specs/` tient lieu de dépôt git d'une conversation à l'autre.

- **Début de conversation** : si la personne joint `specs.zip`, la restaurer dans un dossier de travail, puis lire la mémoire du skill (`CONTEXTE.md`, `PROTOTYPE.md` ou `REQUIREMENTS.md`) comme d'habitude :

  ```sh
  node <specs-ui>/scripts/pack.mjs --extract /mnt/user-data/uploads/specs.zip .
  ```

  Un projet déjà commencé sans archive jointe : demander l'archive avant tout travail, plutôt que repartir de zéro.
- **Fin de chaque étape qui modifie le projet** : refaire l'archive, la livrer, et rappeler à la personne de la télécharger et de la joindre à la prochaine conversation.

  ```sh
  node <specs-ui>/scripts/pack.mjs specs /mnt/user-data/outputs/specs.zip
  ```

  L'archive laisse de côté ce qui se reconstruit (sites construits, `node_modules/`, `publish/`) : après restauration, relancer `build.mjs` avant de publier.

## 3. Publier : une version autonome en un seul fichier

`prepare-publish.mjs` et l'outil Artifact multi-pages ne servent pas ici. On construit comme d'habitude, puis `bundle.mjs` produit un seul fichier HTML, qui intègre les pages, les scripts (Tailwind, Lucide, Alpine, Mermaid) et les images et qui s'ouvre sans réseau, sauf pour les polices web :

| Livrable | Commande |
|---|---|
| Specs | `node <specs-ui>/scripts/bundle.mjs specs/ui/site /mnt/user-data/outputs/specs-<projet>.html` |
| Prototype | `node <specs-ui>/scripts/bundle.mjs specs/prototype/site /mnt/user-data/outputs/prototype-<projet>.html` |
| Cahier des charges | `node <specs-ui>/scripts/bundle.mjs specs/requirements/requirements.html /mnt/user-data/outputs/cahier-des-charges-<projet>.html`, plus `requirements.md` copié dans `outputs/` |

- Présenter le fichier à la personne : elle l'ouvre dans l'aperçu de claude.ai, le télécharge, l'ouvre dans un navigateur ou le joint à un message. Chaque page garde ses liens, ses ancres (`#e3b`) et, pour le prototype, ses données d'une page à l'autre.
- Une nouvelle version remplace le fichier entier : il n'y a ni `.published.json` à confirmer, ni URL à noter. Garder dans la mémoire du projet les URL d'artifacts déjà publiées depuis Claude Code : elles resservent si le projet y revient.
- Retours de relecture (specs) et observations (prototype) restent dans le navigateur de chaque lecteur, comme dans un artifact : la personne copie l'export et le colle dans le chat.
- Le premier `bundle.mjs` télécharge les scripts depuis le CDN, sinon avec curl, sinon depuis le registre npm (autorisé par défaut), puis les garde en cache pour la conversation.

## 4. Vérifier sans navigateur

Sans Chrome, `capture.mjs` fait les contrôles statiques (version du template, blocs `data-use` sans template) et dit ce qu'il n'a pas vérifié : icônes, contenu coupé, pastilles, planches. **Le dire à la personne**, sans prétendre avoir relu le rendu. `check.mjs` (prototype) a besoin d'un navigateur.

Pour avoir Chrome, la personne ajoute `storage.googleapis.com` aux domaines autorisés (Paramètres → Capacités → Exécution de code → Domaines supplémentaires autorisés), puis dans une nouvelle conversation :

```sh
npx @puppeteer/browsers install chrome-headless-shell@stable --path /tmp/chrome
export CHROME_PATH="$(ls /tmp/chrome/chrome-headless-shell/*/chrome-headless-shell-linux64/chrome-headless-shell)"
export CHROME_ARGS=--no-sandbox   # le conteneur n'offre pas le bac à sable de Chrome
```

`capture.mjs` vérifie que Chrome démarre et revient aux contrôles statiques s'il échoue, avec le message d'erreur. S'il manque des bibliothèques système, le dire et rester aux contrôles statiques.

## 5. Réseau

- **npm** : autorisé par défaut. `npm install` dans `specs/prototype/` compile Tailwind au build.
- **Site existant** (étape 1B de `specs-ui`) : `extract-identity.mjs` télécharge le site, ce que le filtre bloque par défaut. Proposer à la personne soit d'ajouter le domaine du site aux domaines autorisés, soit de joindre des captures d'écran et la feuille de style du site. Le script repasse par curl quand `fetch` échoue, car curl suit le proxy du bac à sable.
- Une commande bloquée par le filtre répond souvent par une erreur 403 ou un échec de résolution : ne pas réessayer en boucle, dire quel domaine manque.

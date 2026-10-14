# AGENTS.md

Instructions pour les agents qui modifient ce dépôt. La documentation destinée aux humains est dans [`README.md`](README.md) : ne pas la dupliquer ici.

## Nature du dépôt

Catalogue de skills d'agents, installés avec le CLI [`skills`](https://github.com/vercel-labs/skills) (`npx skills add`). Les skills suivent la [spécification Agent Skills](https://agentskills.io/specification) et ne dépendent d'aucun agent en particulier.

Les trois skills forment une chaîne : `specs-ui` (specs maquettées) → `prototype-ui` (prototype cliquable) → `requirements-doc` (cahier des charges, document pour l'équipe de développement). Les deux derniers lisent le projet produit par le premier.

## Invariants

1. **Emplacement** : `skills/<skill>/SKILL.md`, un seul niveau sous `skills/`. Un `SKILL.md` ailleurs n'est pas découvert par le CLI.
2. **Trois documents par skill** :
   - `SKILL.md` s'adresse à l'agent ;
   - `README.md` aux humains (ce que fait le skill, installation, exemples, contenu) ;
   - `CHANGELOG.md` trace les versions.

   Ne pas dupliquer une règle entre `SKILL.md` et `README.md` : deux copies finissent toujours par diverger.
3. **`name` identique au nom du dossier**, 64 caractères au plus, `[a-z0-9-]` uniquement, ni tiret en début ou fin, ni `--`.
4. **Frontmatter en liste blanche** : `name`, `description`, `allowed-tools`, `license`, `compatibility`, `metadata`, et rien d'autre. Toute autre donnée va sous `metadata` (map de chaînes).
5. **Version** : `metadata.version` (chaîne quotée, SemVer) est égale à la première entrée de `CHANGELOG.md` (`## X.Y.Z · date`). Toute modification d'un skill ajoute une entrée au CHANGELOG et monte la version dans le même commit.
6. **Langue** :
   - documentation, instructions, gabarits et textes produits en français, avec guillemets « » ;
   - code des scripts en anglais (identifiants, options, noms de fichiers générés), commentaires en français.
7. **Aucune dépendance pour les scripts des skills** : Node 18+ suffit. Les dépendances éventuelles (Tailwind, Alpine…) s'installent dans le projet de la personne, jamais dans ce dépôt.
8. **Économie de tokens** : chaque skill commence par sa section « Économiser… », garde une mémoire de projet courte (`CONTEXTE.md`, `PROTOTYPE.md`, `CDC.md`), fournit des résumés avant lecture et publie de façon incrémentale. Tout ajout doit respecter ces règles.

## Piège YAML

Le CLI parse le frontmatter en YAML et, en cas d'erreur, **ignore le skill sans aucun message**. Le cas le plus fréquent : un `:` suivi d'un espace dans un scalaire simple non quoté. Toujours écrire `description` en bloc plié (`>` ou `>-`).

## Espaces de travail

Les projets produits par les skills (`specs/ui/`, `specs/prototype/`, `specs/requirements/`, anciennement `specs-ui/`, `prototype-ui/`, `cdc/`) vivent dans le dossier du projet concerné, **jamais dans ce dépôt**. Pour tester un skill, travailler dans un dossier à part. Le `.gitignore` exclut `*-workspace/` par sécurité.

Ne jamais supprimer ni déplacer un espace de travail existant sans accord : ses fichiers `.published.json` et les URL d'artifacts de sa mémoire de projet permettent de mettre à jour les artifacts déjà publiés.

## À ne pas faire

- Ne pas introduire de `.claude-plugin/`, `plugin.json` ou `marketplace.json` : ces formats lient le dépôt à un agent unique.
- Ne pas committer de `skills-lock.json`, `.claude/skills/` ni `.agents/skills/` : ce sont des artefacts des projets qui installent les skills.
- Ne rien ajouter au `package.json` qui ne serve pas à valider le dépôt.
- Ne pas créer de `CONTRIBUTING.md` : `README.md` pour les humains, ce fichier pour les agents.
- Ne pas coder en dur un nom de skill dans `scripts/validate-skills.mjs` : il boucle sur les skills découverts.

## Validation

```bash
npm run validate          # structure, frontmatter, nommage, versions, syntaxe des scripts
npx skills add . --list   # découverte réelle par le CLI
npm ci && npm run lint:md # lint Markdown, version figée par le lockfile
```

Après toute modification d'une règle du validateur, la vérifier par un échec provoqué.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), en anglais, avec la portée du skill concerné : `feat(specs-ui): …`, `fix(prototype-ui): …`, `chore: …`. Identité git : `fpasquet <fab.pasquet@gmail.com>`, sans ligne `Co-Authored-By`.

`git push` et toute écriture distante nécessitent une confirmation explicite.

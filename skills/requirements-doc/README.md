# requirements-doc

Skill qui produit le **cahier des charges** d'une équipe de développement. Il est livré en Markdown, et publié comme artifact sous forme de page HTML lisible : sommaire, recherche par identifiant, diagrammes, copie du Markdown. Il part de specs UI et fonctionnelles (skill `specs-ui`, et du prototype `prototype-ui` s'il existe) et couvre :

- spécifications fonctionnelles et UI par lot, avec critères d'acceptation ;
- identité visuelle ;
- exigences non fonctionnelles ;
- architecture ;
- stack technique ;
- infrastructure et exploitation ;
- découpage en lots avec estimations en fourchettes ;
- planning, risques et points ouverts.

Le cahier des charges vit dans le dépôt de specs, avec les specs et le prototype, et se lit dans l'artifact. Le dépôt de l'application en reçoit un **export** : règles et critères d'acceptation par lot, exigences non fonctionnelles, architecture et stack, en Markdown généré. Les lots chiffrés, le planning et les risques n'y vont pas. Les tests citent les critères (`CA-CONN-27`), et la CI de l'application mesure leur couverture sur cet export, sans le dépôt de specs.

## Installation

```bash
# Dans le projet courant (choix de l'agent en interactif)
npx skills add <source> --skill requirements-doc

# Globalement, pour tous vos projets
npx skills add <source> --skill requirements-doc -g
```

`<source>` vaut `<compte>/skills` depuis GitHub, ou le chemin d'une copie locale du dépôt (`~/www/skills`).

À installer avec `specs-ui`, dont il lit le projet : `npx skills add <source> --skill specs-ui requirements-doc`. Dans le dépôt de l'application, il ne sert qu'à la traçabilité en CI (`trace.mjs` sur l'export).

## Exemples de demandes

- « Fais le cahier des charges à partir des specs. »
- « Prépare le document pour l'équipe de dev : architecture, stack et découpage en lots chiffrés. »
- « Mets à jour le cahier des charges après les derniers retours sur le lot Sessions. »
- « Exporte le cahier des charges dans le dépôt de l'application. »
- « Quels critères d'acceptation du lot Connexion ne sont pas encore testés ? »

## Contenu

| Chemin | Rôle |
|---|---|
| `SKILL.md` | Méthode : préparation, cadrage, architecture proposée puis validée, partie fonctionnelle, lots et estimations, contrôle, publication |
| `references/plan.md` | Les parties, leur source, les identifiants (RF, CA, NF, DT, RQ), le style |
| `references/architecture.md` | Lire les besoins techniques dans les specs, décisions à prendre, options, rédaction de l'architecture, de la stack et de l'infrastructure |
| `references/estimations.md` | Découpage (lot 0 « Socle »), méthode d'estimation en fourchettes, hypothèses, planning |
| `references/redacteur.md` | Consigne des sous-agents qui rédigent les critères d'acceptation d'un lot |
| `templates/sources/` | Une source Markdown par partie, avec gabarits `{{…}}` |
| `templates/memory.md` | Mémoire du cahier des charges (`REQUIREMENTS.md`) |
| `scripts/init.mjs` | Crée `<projet>/requirements/` depuis un projet de specs et lance l'extraction |
| `scripts/extract.mjs` | Specs HTML → Markdown : inventaire, lots (règles, écrans, parcours, règles d'écran, mobile), points ouverts, tokens |
| `scripts/build.mjs` | Assemble le document en Markdown et en page HTML (inclusions, ancres, sommaire, version à publier) |
| `scripts/assemble.mjs` | Inclusions, ancres et ordre des sources, communs au build et à l'export |
| `scripts/export.mjs` | Export vers le dépôt de l'application : un fichier par partie et par lot, index, manifeste, parties internes écartées, `--check` |
| `scripts/render.mjs` | Conversion Markdown → HTML sans dépendance (titres, listes, tableaux, diagrammes, pastilles et renvois d'identifiants) |
| `templates/page.html` | Page du cahier des charges : sommaire latéral, recherche, copie du Markdown, thème clair et sombre |
| `scripts/config.mjs` | Lecture de `requirements.json` (et de l'ancien `cdc.json`), chemin des specs |
| `scripts/prepare-publish.mjs` | Page à publier, `--confirm` après publication, `--check` : artifact en retard sur la page locale |
| `scripts/trace.mjs` | Traçabilité CA / RF / NF ↔ code et tests, depuis le dépôt de specs ou sur l'export dans l'application : couverture par lot, identifiants inconnus, écrans livrés non testés, export modifié à la main |
| `scripts/check.mjs` | Parties manquantes, gabarits, liens, identifiants non définis, lots et fourchettes, couverture des écrans, doublons |

## Démarrage rapide

Depuis la racine du dépôt de specs, pour le projet `orbe` :

```sh
node requirements-doc/scripts/init.mjs --specs orbe/ui --out orbe/requirements --prototype orbe/prototype
node requirements-doc/scripts/build.mjs orbe/requirements
node requirements-doc/scripts/check.mjs orbe/requirements
node requirements-doc/scripts/export.mjs orbe/requirements --to ../orbe-app/docs/requirements
```

Dans la CI de l'application :

```sh
node requirements-doc/scripts/trace.mjs docs/requirements --strict
```

Aucune dépendance : Node 18+.

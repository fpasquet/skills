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

## Installation

```bash
# Dans le projet courant (choix de l'agent en interactif)
npx skills add <source> --skill requirements-doc

# Globalement, pour tous vos projets
npx skills add <source> --skill requirements-doc -g
```

`<source>` vaut `<compte>/skills` depuis GitHub, ou le chemin d'une copie locale du dépôt (`~/www/skills`).

À installer avec `specs-ui`, dont il lit le projet : `npx skills add <source> --skill specs-ui requirements-doc`.

## Exemples de demandes

- « Fais le cahier des charges à partir des specs. »
- « Prépare le document pour l'équipe de dev : architecture, stack et découpage en lots chiffrés. »
- « Mets à jour le CDC après les derniers retours sur le lot Sessions. »

## Contenu

| Chemin | Rôle |
|---|---|
| `SKILL.md` | Méthode : préparation, cadrage, architecture proposée puis validée, partie fonctionnelle, lots et estimations, contrôle, publication |
| `references/plan.md` | Les parties, leur source, les identifiants (RF, CA, NF, DT, RQ), le style |
| `references/architecture.md` | Lire les besoins techniques dans les specs, décisions à prendre, options, rédaction de l'architecture, de la stack et de l'infrastructure |
| `references/estimations.md` | Découpage (lot 0 « Socle »), méthode d'estimation en fourchettes, hypothèses, planning |
| `references/redacteur.md` | Consigne des sous-agents qui rédigent les critères d'acceptation d'un lot |
| `templates/sources/` | Une source Markdown par partie, avec gabarits `{{…}}` |
| `templates/cdc.md` | Mémoire du cahier des charges (`CDC.md`) |
| `scripts/init.mjs` | Crée `cdc/` depuis un projet de specs et lance l'extraction |
| `scripts/extract.mjs` | Specs HTML → Markdown : inventaire, lots (règles, écrans, parcours, règles d'écran, mobile), points ouverts, tokens |
| `scripts/build.mjs` | Assemble le document en Markdown et en page HTML (inclusions, ancres, sommaire, version à publier) |
| `scripts/render.mjs` | Conversion Markdown → HTML sans dépendance (titres, listes, tableaux, diagrammes, pastilles et renvois d'identifiants) |
| `templates/page.html` | Page du cahier des charges : sommaire latéral, recherche, copie du Markdown, thème clair et sombre |
| `scripts/check.mjs` | Parties manquantes, gabarits, liens, identifiants non définis, lots et fourchettes, couverture des écrans, doublons |

## Démarrage rapide

```sh
node requirements-doc/scripts/init.mjs --specs specs-ui --out cdc --prototype prototype-ui
node requirements-doc/scripts/build.mjs cdc
node requirements-doc/scripts/check.mjs cdc
```

Aucune dépendance : Node 18+.

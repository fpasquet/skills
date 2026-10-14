# Plan et rédaction du cahier des charges

Ce que contient chaque partie, d'où vient sa matière et comment l'écrire. Lecteur : l'équipe de développement, qui doit pouvoir construire et recetter sans revenir poser les questions déjà tranchées.

## Les parties et leur source

| Source | Partie | Matière | Qui écrit |
|---|---|---|---|
| `00-titre.md` | Titre, version, liens, sommaire | rempli par `init.mjs` ; version et statut à tenir à jour | modèle principal |
| `10-presentation.md` | 1. Présentation | introduction des specs (`site.json`), CONTEXTE.md (décisions, périmètre) | modèle principal |
| `20-utilisateurs.md` | 2. Utilisateurs et rôles | personas et rôles de CONTEXTE.md ; matrice des permissions tirée des règles RF | modèle principal |
| `30-specs.md` | 3. Spécifications fonctionnelles et UI | **généré** (`generated/lot-*.md`) + critères d'acceptation (`lots/*-criteres.md`) | extraction + rédacteurs |
| `40-interface.md` | 4. Interface et identité visuelle | décision d'identité (CONTEXTE.md), tokens (**généré**), composants partagés | modèle principal |
| `50-exigences-non-fonctionnelles.md` | 5. Exigences non fonctionnelles | règles des specs (délais, conservation, sécurité) + standards | modèle principal |
| `60-architecture.md` | 6. Architecture | `references/architecture.md` | modèle principal |
| `70-stack.md` | 7. Stack technique | décisions DT validées | modèle principal |
| `80-infrastructure.md` | 8. Infrastructure et exploitation | décisions DT validées | modèle principal |
| `90-lots.md` | 9. Découpage et estimations | inventaire, `references/estimations.md` | modèle principal |
| `95-risques.md` | 10. Risques et points ouverts | risques (rédigés) + points ouverts (**généré**) | modèle principal |
| `99-annexes.md` | 11. Annexes | inventaire (**généré**), décisions datées de CONTEXTE.md | modèle principal |

Les fichiers de `sources/generated/` se régénèrent par `extract.mjs` : ne jamais les modifier. Pour corriger une règle d'écran, corriger les specs (skill `specs-ui`), puis réextraire.

## Identifiants

- **RF-LOT-nn** : règles fonctionnelles d'un lot (générées depuis les specs).
- **CA-LOT-nn** : critères d'acceptation (rédigés par lot).
- **NF-nn** : exigences non fonctionnelles.
- **DT-nn** : décisions techniques (architecture, stack, infrastructure).
- **RQ-nn** : risques.

En gras à leur définition (`**NF-03**`), en texte simple quand on y renvoie. `check.mjs` signale les doublons.

## Écrire

- **Concret et vérifiable** : chaque exigence dit ce qui doit être vrai et comment on le vérifie. Pas d'adjectifs vagues (« rapide », « intuitif ») sans chiffre ou critère.
- **Fidèle aux specs** : mêmes mots que l'interface, mêmes valeurs que le fil rouge, renvoi à l'écran (`[E13a](#e13a)`) plutôt que paraphrase. Les parties 1 à 5 restent fonctionnelles, et la technique commence à la partie 6.
- **Décidé ou supposé, toujours dit** : une décision porte sa date ou son identifiant DT ; une hypothèse est écrite « hypothèse » et se retrouve dans « À valider » de `CDC.md`.
- **Exigences non fonctionnelles** : les chiffrer. Par exemple :
  - p95 d'affichage d'un écran < 1 s ;
  - événement externe traité en < 30 s ;
  - disponibilité 99,5 % ;
  - RPO 24 h, RTO 4 h ;
  - WCAG 2.2 AA ;
  - données en UE.

  Reprendre en priorité les valeurs déjà écrites dans les specs (délais, durées de conservation, limites).
- **Tableaux plutôt que paragraphes** pour les listes de choix, d'exigences, d'environnements, de lots.
- Langue : français ; noms techniques (produits, protocoles) tels quels à partir de la partie 6.

## Critères d'acceptation (partie 3)

Rédigés par lot, depuis `generated/lot-<lot>.md` seulement, par un rédacteur `sonnet` (consigne : `references/redacteur.md`). 2 à 5 par état d'écran, au format « Étant donné … quand … alors … », chacun rattaché à son état (`[E13a](#e13a)`) et, si possible, à une règle RF.

## Version et suivi

`00-titre.md` porte la version (0.1, 0.2… puis 1.0 à la validation) et le statut (Brouillon, En relecture, Validé). Une nouvelle version après une évolution des specs : réextraire, relancer `check.mjs`, mettre à jour les parties touchées (lots, estimations, risques), puis noter le changement dans `CDC.md`.

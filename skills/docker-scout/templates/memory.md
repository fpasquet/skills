# Audit Docker Scout · {{IMAGE}}

Mémoire de l'audit. À lire en premier à chaque reprise, à mettre à jour à la fin de chaque étape. Moins de 100 lignes.

## État

- **Artifact** : {{URL}} (aussi dans `scout.json` → `artifact`)
- **Dernière analyse** : {{date, branche, commit, scan de référence}}
- **Prochaine étape** : {{…}}

## Build de production

```sh
{{BUILD}}
```

- **Registres privés** : {{aucun, ou lesquels et comment on s'y connecte ; jamais de jeton}}
- **Image de base** : {{référence, variante retenue et pourquoi}}

## Scans

| Label | Image | Ce qu'il mesure |
|---|---|---|
| `current` | `{{IMAGE}}:scout` | {{état de départ}} |

## Corrections

| Correction | Statut | Commit ou PR |
|---|---|---|
| {{…}} | {{à faire / fait / risque accepté}} | {{…}} |

## Décisions et exceptions

- {{date · décision · raison}}

## CI

- **Workflow** : {{chemin, politique (fixable, new, report)}}
- **Secrets créés** : {{noms seulement}}

## À demander

- {{question en attente}}

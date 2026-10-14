# {{EN}} · {{Titre de l'écran}}

Fiche de câblage, écrite par le modèle principal et lue par le rédacteur. 5 à 15 lignes utiles. Elle se met à jour à chaque itération au lieu d'être réécrite.

- **Parcours** : {{nom}} · étape {{n}} du scénario {{id}} (`{{page?paramètres}}`)
- **États** (`outline.mjs`) : {{eNa}} quand {{condition}} · {{eNb}} quand {{condition}}
- **Données** : {{collection / objet, choisi par param('…') avec défaut '…'}}
- **Gestes** : {{bouton}} → `$store.app.{{action}}(…)` → message « {{…}} » → `{{page suivante}}`
- **Paramètres** : {{?step= / ?id= lus à l'ouverture ; @proto:params.window si l'étape suivante reste sur l'écran}}
- **Reste statique** : {{zones hors parcours}}
- **Nouveaux textes autorisés** : {{« … »}}
- **Mobile** : {{même logique / pas de maquette : version desktop}}

## Historique

- {{date}} : {{câblée / modifiée : ce qui a changé}}

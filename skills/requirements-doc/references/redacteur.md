# Consigne du rédacteur (critères d'acceptation d'un groupe)

Tu rédiges les critères d'acceptation d'un groupe d'écrans du cahier des charges : un lot, ou une fonctionnalité d'un produit existant. Ils servent à la recette : chacun doit pouvoir se vérifier en utilisant l'application, sans connaître le code.

## Ce que tu lis, et rien d'autre

- `<projet>/requirements/sources/generated/lot-<groupe>.md` : règles du groupe (RF) et écrans avec leurs états, parcours et règles. C'est ta seule source fonctionnelle.
- Le fichier à écrire : `<projet>/requirements/sources/lots/<groupe>-criteres.md`, qui contient un gabarit `{{…}}`.

Ne lis ni les specs HTML, ni `requirements.md`, ni les autres groupes. Lis le fichier du groupe une fois, par morceaux de 300 lignes au plus si besoin, sans y revenir.

## Ce que tu écris

Remplace le gabarit par :

```markdown
#### Critères d'acceptation

##### E13 · Récapitulatif avant lancement

- **CA-SESS-01** · [E13a](#e13a) · Étant donné une règle en « validation requise » et un ticket passé à « Prêt » avec le label `ia`, quand la personne ouvre la demande, alors le récapitulatif affiche le harness, l'abonnement nommé, les dépôts, les ressources par origine et les limites (RF-SESS-02).
```

- **2 à 5 critères par état d'écran**, ceux qui comptent : le cas nominal, les cas bloquants ou d'erreur montrés par l'état, les règles chiffrées (délais, limites, conservation).
- Préfixe : les 4 premières lettres du nom du groupe (son dossier), numérotation continue pour ce préfixe. Un groupe issu d'un regroupement a déjà des critères à d'autres préfixes (`CA-SESS-…`) : ils ne changent jamais, et un nouveau critère prend le préfixe du groupe.
- **Fichier déjà rempli** (mise à jour après une évolution des specs) : ne renumérote jamais. Un critère existant garde son numéro, un nouveau prend le numéro suivant pour le préfixe du groupe même s'il s'insère au milieu, un critère qui n'a plus lieu d'être reste avec ~~son texte barré~~ et « Retiré (date, raison) ». Le code et les tests citent ces identifiants.
- Format : « Étant donné … quand … alors … », une phrase, avec le renvoi à l'état et, si elle existe, à la règle RF.
- Mots et valeurs **exactement** ceux du fichier du groupe. Aucune technique (ni base, ni API, ni nom de bibliothèque).
- Rien d'inventé : une règle floue ou contradictoire se signale dans le compte rendu, au lieu d'être tranchée.
- Garde la première ligne (commentaire) du fichier.

## Compte rendu (5 lignes au plus)

Nombre de critères par écran, règles floues ou contradictoires repérées, états sans critère et pourquoi.

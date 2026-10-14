# Découpage en lots et estimations

Méthode pour la partie 9. Les estimations sont **indicatives** : des fourchettes avec leurs hypothèses, que l'équipe ajuste. Elles servent à ordonner et à dimensionner, pas à engager.

## Découpage

- **Lot 0 · Socle** avant les lots fonctionnels : infrastructure et environnements, CI/CD, authentification et organisations, design system (tokens et composants des specs), observabilité de base, squelette de l'application.
- **Puis les lots des specs, dans leur ordre** (`site.json`). Si une dépendance technique impose un autre ordre, le dire et l'expliquer.
- Par lot :
  - **objectif** : une phrase ;
  - **périmètre** : écrans et états (liens vers la partie 3), règles RF clés ;
  - **dépendances** : lots, intégrations, décisions DT ;
  - **livrables** ;
  - **critères de fin** : critères d'acceptation passés, recette, déploiement en préproduction ;
  - **estimation**.
- Ce qui peut avancer en parallèle (front et back d'un même lot, deux lots indépendants) se dit dans le planning.

## Estimer

1. **Compter par lot** :
   - les états d'écran (inventaire), par complexité :
     - simple : affichage, formulaire court ;
     - moyenne : liste filtrée, assistant, plusieurs états ;
     - forte : temps réel, éditeur, règles imbriquées ;
   - les intégrations externes ;
   - les traitements asynchrones ;
   - les règles RF qui demandent une logique propre.
2. **Ordres de grandeur de départ** (jours de développement front + back, une personne confirmée), à corriger selon la stack et l'équipe :
   - état d'écran simple 0,5 à 1 j ;
   - état d'écran moyen 1 à 2 j ;
   - état d'écran complexe 2 à 4 j ;
   - intégration externe 3 à 8 j ;
   - traitement asynchrone fiable (reprise, idempotence) 3 à 6 j ;
   - temps réel sur un écran 2 à 4 j.
3. **Ajouter les coefficients** :
   - tests automatisés + 20 à 30 % ;
   - recette et corrections + 15 à 20 % ;
   - gestion de projet et revues + 10 à 15 % ;
   - aléas + 15 à 25 %, selon le nombre de points ouverts du lot.
4. **Donner une fourchette basse et haute par lot** (en jours), un niveau de complexité, et les profils nécessaires (front, back, devops, design). La synthèse fait le total et propose une durée calendaire pour une équipe type (par exemple 2 dev full stack, 1 devops à temps partiel).
5. **Écrire les hypothèses** (partie 9.4) :
   - composition de l'équipe ;
   - ce qui est inclus et exclu (design déjà fait, contenu, migration de données) ;
   - les points ouverts qui feraient bouger la fourchette, avec leur sens (« si la reprise de sandbox passe par instantané disque : + 5 à 8 j sur le lot 5 »).

Détail du calcul : dans `CDC.md` (« Hypothèses d'estimation ») ou en note sous le tableau, pas dans le corps du document. Le document montre les fourchettes et les hypothèses, pas l'arithmétique.

## Planning indicatif

Un `gantt` mermaid en semaines : lot 0, puis les lots dans l'ordre, avec les recouvrements possibles et un jalon par mise en préproduction. Tant que la date de démarrage n'est pas connue, partir d'une date hypothétique (un lundi), écrite comme telle sous le diagramme, et donner les durées en semaines (`5w`).

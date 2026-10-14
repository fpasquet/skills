# Qualité UI des maquettes

Une maquette correcte ne suffit pas : si elle ressemble à un gabarit d'administration générique, la personne ne peut pas juger le produit et les développeurs reproduisent ce gabarit. Ce fichier donne les principes qui font la différence, puis une grille de revue à passer sur chaque capture avant de publier.

## Sommaire

1. Partir de l'usage, pas du gabarit
2. Un point focal par écran
3. Hiérarchie typographique
4. Composition et remplissage
5. Moins de cartes, plus de structure
6. Couleur et états
7. Les détails qui font produit fini
8. Mobile
9. Grille de revue avant publication

## 1. Partir de l'usage, pas du gabarit

Avant de dessiner, répondre en une phrase : **que vient faire la personne sur cet écran, et qu'est-ce qui lui fait gagner du temps ?** La disposition en découle.

| Usage dominant | Dispositions qui le servent |
|---|---|
| Surveiller, piloter | Indicateurs en tête, tableau triable, vues enregistrées |
| Traiter une file l'une après l'autre | Liste et détail côte à côte, raccourcis clavier, action suivante préparée |
| Comprendre, être guidé | Colonne centrée, phrases complètes, une action principale bien visible |
| Configurer | Assistant par étapes, ou page de réglages en sections avec un récapitulatif |
| Explorer, comparer | Grille de cartes avec filtres, vue côte à côte |
| Suivre une exécution | Chronologie, statut en grand, journal repliable, actions contextuelles |

Penser à des produits de référence pour ce type d'usage (Linear, GitHub, Vercel, Stripe, Notion, Front, Intercom…) et se demander comment ils traiteraient cet écran. S'en inspirer pour la structure et les interactions, jamais pour copier leur identité.

## 2. Un point focal par écran

Chaque écran a **une** chose à voir en premier : le nombre de demandes à traiter, la question qui bloque un agent, l'erreur à corriger. Elle se distingue par la taille, la graisse, la position (en haut à gauche, ou centrée), la couleur, ou un contour. Tout le reste est visiblement secondaire.

Test : flouter mentalement la capture. Si rien ne ressort, ou si tout ressort autant, la hiérarchie est à revoir.

## 3. Hiérarchie typographique

Quatre ou cinq niveaux au plus, avec de vrais écarts :

| Niveau | Repère |
|---|---|
| Titre de page | 24-34 px, `font-semibold` ou plus, `tracking-tight` |
| Titre de section | 15-18 px, `font-semibold` |
| Texte courant | 14 px (13 px pour une interface dense) |
| Métadonnées, libellés | 12-13 px, `text-muted` |
| Chiffres clés | 22-32 px, `tabular-nums`, éventuellement `font-display` |

Erreurs fréquentes : tout en 14 px, titres de cartes plus gros que le titre de page, trois graisses sur une même ligne. Les références (identifiants, branches, chemins, montants) passent en `font-mono` ou `tabular-nums`.

## 4. Composition et remplissage

- **Une grille** : marges constantes (24 ou 32 px sur desktop), colonnes alignées. Les bords des blocs s'alignent entre eux.
- **Remplir le cadre avec intention** : pas de grande zone vide en bas d'une colonne pendant que l'autre déborde. Ajuster le nombre de lignes, ou donner à l'espace libre un rôle (aperçu, aide, récapitulatif).
- **Largeurs de colonnes pensées pour le contenu** : l'information importante (titre, statut) ne doit jamais être tronquée. Tronquer ce qui est secondaire (extrait, chemin), en priorité à droite.
- **Densité cohérente** : une même page ne mélange pas des lignes de 36 px et des cartes de 120 px sans raison.
- **Rythme vertical** : plus d'espace entre les sections qu'à l'intérieur d'une section (par exemple 32 / 12 px).

## 5. Moins de cartes, plus de structure

L'empilement de cartes blanches identiques, chacune avec son en-tête « Titre · Voir tout », est le marqueur numéro un d'une maquette générique. Alternatives :

- séparer par l'espace et des intertitres plutôt que par des bordures ;
- une seule surface avec des séparateurs (`divide-y`) au lieu de plusieurs cartes ;
- regrouper des indicateurs dans un bandeau unique divisé (`grid divide-x`) plutôt que quatre cartes ;
- réserver la carte aux objets manipulables (une demande, un projet, une PR).

## 6. Couleur et états

- La couleur principale signale l'action et la sélection. Si elle est partout, elle ne signale plus rien. Si elle est presque noire, les liens doivent se distinguer autrement (soulignement, icône).
- Une couleur d'état utilisée en fond plein (pastille de compteur, bouton) a besoin d'un texte contrasté : ajouter un token `on-…` et le vérifier.
- Chaque état a une couleur fixe, et toujours un libellé (et si possible une icône ou une pastille). Même correspondance sur tous les écrans.
- Pas plus de deux ou trois éléments colorés par ligne de liste : au-delà, l'œil ne sait plus où aller.
- Un état « en cours » se montre comme vivant (pastille animée, indicateur de progression si la durée est connue, horodatage relatif).
- Les priorités et les gravités se lisent d'un coup d'œil : icône (flèche, signal), position (en tête), couleur.

## 7. Les détails qui font produit fini

- Avatars ou initiales pour les personnes, icônes de type pour les objets (dépôt, ticket, PR, fichier).
- Horodatages relatifs (« il y a 12 min ») et absolus au survol, dans l'annotation.
- Compteurs sur les onglets et la navigation.
- Fil d'Ariane ou contexte au-dessus du titre (« Support · File de l'équipe »).
- Raccourcis clavier affichés (`kbd`) quand l'outil vise des utilisateurs intensifs.
- Une ligne sélectionnée ou survolée visible, pour montrer l'interaction.
- Champs de recherche avec raccourci, filtres sous forme de puces qui affichent leur valeur.
- Contenu réaliste qui couvre les cas gênants : titre long, valeur vide, nombre élevé.
- Icônes toutes de la même taille (16 px dans le texte, 18-20 px dans la navigation), alignées sur le texte.

## 8. Mobile

- Repenser plutôt que réduire : tableau → liste ou cartes, panneau → écran poussé ou feuille modale, liste + détail → deux écrans.
- Les actions principales vont dans la zone du pouce (bas de l'écran) : barre d'onglets, bouton flottant, barre d'action collée en bas.
- Cibles de 44 px minimum, texte courant de 14-16 px.
- Le point focal reste le même que sur desktop.

## 9. Grille de revue avant publication

Après chaque capture (`scripts/capture.mjs`), regarder chaque écran et noter honnêtement :

1. **Point focal** : sait-on en deux secondes ce qui compte sur cet écran ?
2. **Usage** : la disposition sert-elle l'usage dominant (§1), ou est-ce un gabarit par défaut ?
3. **Hiérarchie** : au moins trois niveaux typographiques nettement distincts ?
4. **Composition** : alignements tenus, pas de zone morte, pas de texte important tronqué ?
5. **Structure** : pas d'empilement de cartes identiques ?
6. **Couleur** : primaire réservée aux actions, états cohérents et libellés ?
7. **Détails** : avatars, icônes, compteurs, horodatages, contenu réaliste ?
8. **Mobile** : repensé, actions dans la zone du pouce ?
9. **Défauts techniques** : passage à la ligne non voulu, débordement, icône manquante, pastille qui masque du texte ?

Corriger au moins les trois défauts les plus visibles avant de publier, puis recapturer les écrans touchés. Mieux vaut un écran de moins et des écrans aboutis.

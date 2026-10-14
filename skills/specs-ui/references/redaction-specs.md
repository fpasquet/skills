# Rédiger les specs UI

Le document de specs sert deux publics. Le métier y valide le fonctionnement, les développeurs y trouvent ce qu'il faut construire. Chaque écran doit donc répondre à trois questions : à quoi il sert, d'où on y arrive et où on va ensuite, et quelles règles le gouvernent.

## Sommaire

1. Inventaire avant maquettes
2. Structure du document
3. Anatomie d'un écran
4. États à couvrir
5. Écrire les textes
6. Itérer
7. Préparer les développements

## 1. Inventaire avant maquettes

Avant de dessiner, proposer dans la conversation la liste des écrans et des parcours, puis la faire valider. Corriger une ligne de tableau coûte moins cher que refaire une maquette.

```
| ID  | Écran                         | Objectif                              | États distincts            |
|-----|-------------------------------|---------------------------------------|----------------------------|
| E1  | Liste des demandes            | Prioriser la file du jour             | vide (E1a), standard (E1b) |
| E2  | Détail d'une demande          | Répondre et qualifier                 | standard, brouillon        |
| E3  | Nouvelle demande (téléphone)  | Saisir une demande reçue par appel    | formulaire, erreurs        |

Parcours : Traiter une demande : E1 → E2 → E1 · Saisir un appel : E1 → E3 → E2
Règles fonctionnelles connues : …
Questions avant de commencer : (2 ou 3 au maximum)
```

Pour les règles et les cas limites, demander ce qui manque vraiment (volumes, droits, cas d'erreur métier). Pour le reste, faire des hypothèses explicites : les lister sous l'inventaire, puis les reporter dans les annotations et les points ouverts du document à l'étape 3.

**L'inventaire validé fait référence** pour la numérotation et le découpage : le relire (section « À valider » des propositions, ou tête du premier document) avant chaque nouveau lot, et ne jamais le reconstituer de mémoire. Un écran ajouté en cours de route prend une lettre (`E5c`) ou le numéro libre suivant, et l'inventaire est mis à jour.

**Brief en plusieurs lots.** Quand le brief couvre plusieurs fonctionnalités (connexion, projets, sessions…), regrouper les écrans en lots cohérents :

- un document par lot (`specs/ui/connexion.html`, `specs/ui/sessions.html`…), tous avec le même `tokens.css` et les mêmes coquilles ;
- une numérotation **unique pour tout le projet** (E1 à E16 répartis entre les lots), pour qu'un « E12 » cité dans un ticket ou une conversation ne soit jamais ambigu ;
- dans l'en-tête de chaque document, une ligne « Autres lots » avec les liens vers les autres documents ; les liens « Depuis / Ensuite » vers un autre lot pointent vers `autre-lot.html#e12` ;
- l'inventaire présente les lots comme des intertitres du tableau, et propose un ordre de réalisation.

## 2. Structure du document

Celle de `templates/specs.html`, dans cet ordre :

1. **En-tête** : produit, titre de la fonctionnalité, badge d'itération et date, identité utilisée (lien vers l'annexe), contexte en deux ou trois phrases avec un **exemple fil rouge** (un cas concret suivi d'écran en écran : la demande #4821, l'article « … », le client « … »).
2. **Règles fonctionnelles** : encadré de règles courtes, chacune avec son point clé en gras. Uniquement les règles qui structurent l'interface (unicité, droits, limites, statuts, synchronisme). Citer les références (tickets, documents) quand la personne en donne.
3. **Parcours** : une ligne par parcours, écrans en pastilles cliquables reliées par des flèches.
4. **Navigation collante** : un lien par écran, puis Points ouverts, Journal, Identité.
5. **Écrans**, dans l'ordre du parcours principal.
6. **Points ouverts** : question, qui tranche, écrans concernés.
7. **Journal des itérations**.
8. **Annexe · Identité visuelle** : palette, typographie et composants lus dans la page.

## 3. Anatomie d'un écran

```
<section id="e3b">
  h2      : ID (E3b) · titre qui décrit l'état (« Nouvelle demande : erreurs de saisie ») · badge Nouveau / Modifié / Existant
  note    : 1 à 3 phrases. Ce que voit l'utilisateur et pourquoi l'écran est conçu ainsi.
  flux    : Depuis … (liens) · Ensuite … (liens, avec l'action qui y mène)
  desktop : cadre 1280 × 820
  mobile  : cadre 390 × 844, à gauche
  annotations : liste numérotée, à droite du mobile, + paragraphe « Mobile : … » si le mobile diffère
</section>
```

**Variantes de disposition** : quand l'organisation d'un écran fait débat, le maquetter en deux ou trois variantes `E5-A`, `E5-B`, `E5-C` dans la même section, chacune avec une phrase « À choisir si » et ses points de vigilance. Après le choix, la variante retenue reprend le numéro `E5` et le journal note la décision.

**Identifiants** : `E1`, `E2`… dans l'ordre du parcours. Un état distinct du même écran prend une lettre (`E3a` formulaire vide, `E3b` formulaire avec erreurs). Les identifiants sont stables : un écran ajouté entre E2 et E3 devient `E2c`, on ne renumérote jamais (les tickets et les échanges y font référence). Un écran supprimé disparaît du document et le journal le mentionne.

**Annotations** : chacune explique un comportement ou une décision, pas ce qui se voit déjà. Bonnes candidates : règle de gestion, condition d'activation d'un bouton, provenance d'une donnée, validation et message d'erreur, différence avec l'existant, ce qui reste à valider (« **À valider avec** … »), ce qui est hors périmètre. Une annotation peut citer un ticket ou un document de référence (PROJ-142), jamais un élément de code (voir « Specs fonctionnelles, sans code »).

**Fond d'un calque** : un panneau ou une modale posé sur un autre écran montre le même instant que ce fond. Choisir l'objet du calque d'après l'état visible derrière (si S-1042 est « en attente » sur le tableau, le panneau « en cours » montre une autre session), ou préparer une variante du fond.

**Inventaire à plusieurs dimensions** (« liste globale et onglet de projet × standard, vide ») : choisir les maquettes de sorte que chaque contexte et chaque état apparaissent au moins une fois, annoter les combinaisons non maquettées, et noter la répartition dans le journal.

**Dates** : la date d'une itération (en-tête, journal) est celle du jour où elle est rédigée ; les dates du fil rouge (heures des messages, création des tickets) restent celles fixées dans `CONTEXTE.md`, même si le travail s'étale sur plusieurs jours.

**Données** : réalistes, cohérentes d'un écran à l'autre (l'exemple fil rouge garde le même nom, les mêmes chiffres, la même date), couvrant les cas gênants : texte long, valeur vide, nombre élevé, accents.

## 4. États à couvrir

Passer cette liste pour chaque écran. Tous ne méritent pas une maquette, mais chacun doit être dessiné ou mentionné dans une annotation :

- **Premier usage / vide** : expliquer et proposer l'action, jamais une liste vide sans explication.
- **Standard** : le cas le plus fréquent, avec des données réalistes.
- **Chargement** et **traitement long** (asynchrone : statut, pas de fausse barre de progression si la durée est inconnue).
- **Erreurs** : validation de formulaire, erreur serveur, droits insuffisants, élément introuvable.
- **Limites** : beaucoup de données (pagination, troncature), très peu, valeurs extrêmes.
- **Confirmation et retour** : toast, redirection, action d'annulation.
- **Désactivé** : quand et pourquoi une action est indisponible.

**Plusieurs cadres pour un même état** (une variante qui ne mérite pas un état à part, par exemple GitHub Issues et Jira) : un cadre par variante dans la même section, nommés `data-frame="e4c-desktop"` et `data-frame="e4c-jira-desktop"`, avec une légende au-dessus de chacun.

**Mobile simplifié** (quand la personne l'a accepté pour les écrans de configuration) : une maquette mobile de l'état principal, puis une annotation par état qui n'est pas maquetté. Ajouter un paragraphe « Mobile : » qui dit ce qu'on peut faire au téléphone (consulter, revérifier, révoquer…) et ce qui renvoie vers l'ordinateur (saisir un jeton, créer un projet), avec la maquette du message de renvoi s'il existe.

Un état qui change l'écran de façon importante devient un écran à lui seul (`E2a`, `E2b`). Un détail (message d'erreur sous un champ) tient dans une annotation.

## 5. Écrire les textes

- Français courant, phrases courtes, voix active. Les libellés de l'interface sont de vrais libellés : ce sont eux que les développeurs recopieront.
- Typographie française : guillemets « … », espace insécable avant `: ; ? !`, apostrophe typographique (’) si le produit l'utilise, nombres au format français (1 234,50 €, 13 oct. 2026, 14:32).
- Boutons : un verbe à l'infinitif qui dit ce qui va se passer (« Envoyer la réponse », pas « Valider »). L'action principale est unique par écran.
- Messages d'erreur : ce qui s'est passé, puis quoi faire (« Le numéro de commande doit comporter 8 chiffres, par exemple 30055210. »).
- Dans les notes et annotations, pas de jargon de conception (« affordance », « above the fold ») : écrire pour le métier.

## 6. Itérer

Chaque retour de la personne (« E3 : ajoute un filtre par auteur », « on ne veut plus de modale ») suit ce cycle :

1. Modifier **seulement** les fichiers sources des écrans concernés (`sources/<lot>/NNN-<id>.html`), plus ceux que le changement impacte (parcours, liens « Depuis / Ensuite », règles, annexe), puis reconstruire avec `build.mjs`. Ne pas réécrire le reste : la personne a déjà validé ces écrans et ne doit pas tout relire, et relire tout le document coûte cher.
2. Incrémenter le badge d'itération, mettre à jour la date.
3. Ajouter une entrée en tête du journal : ce qui a changé, écran par écran, avec des liens.
4. Mettre à jour les points ouverts : retirer ceux qui sont tranchés (et reporter la décision dans la règle ou l'annotation concernée), ajouter les nouveaux.
5. Vérifier le rendu (`capture.mjs --sheet --ids` les écrans touchés), republier au même endroit.
6. Mettre à jour `CONTEXTE.md` (état, décisions, points ouverts, prochaine étape).
7. Résumer en quelques lignes dans la conversation ce qui a changé, et poser les questions encore ouvertes.

**Évolution transverse** (une fonctionnalité qui touche plusieurs lots, ajoutée en cours de route : marketplace, rôles, facturation…) : ne pas la loger seulement dans le prochain lot. Procéder ainsi :

1. **Analyse d'impact**, présentée avant de produire : écrans des lots faits qui changent (coquille, écrans touchés), écrans des lots à venir qui changent, nouveaux écrans, règles nouvelles ou modifiées.
2. **Décisions fermées** posées avec l'outil de questions (niveaux, partage, sécurité, ordre), réponses reportées dans les règles.
3. **Inventaire révisé** dans `CONTEXTE.md` (ID, titre, ancres, document) et dans la section « À valider » des propositions (« révision n », date), nouveaux écrans aux numéros libres suivants. L'écrire **avant** de produire, surtout si plusieurs agents travaillent en parallèle : c'est leur table commune. Un lien vers un écran à plusieurs états pointe sur l'ancre du premier état (`#e7a`).
   Profiter du changement pour factoriser ce qui se répète dans les écrans touchés (barre d'onglets recopiée, fond de calque recopié au lieu d'un `data-backdrop`).
4. **Production** : le lot qui porte le cœur de l'évolution d'abord, puis les lots faits mis à jour (nouvelle itération si un écran change, maintenance si seule la coquille change), puis les lots suivants.

**Brief qui s'appuie sur une bibliothèque ou une documentation** (package, API, SDK) : la lire avant de concevoir, pour comprendre les concepts et leurs limites, puis les traduire en **vocabulaire fonctionnel**. Ce que la bibliothèque ne couvre pas (niveaux, versions, partage…) devient des décisions explicites, pas des suppositions silencieuses. La bibliothèque elle-même n'apparaît jamais dans les specs : ni son nom, ni ses fonctions, ni sa notation. Elle sert d'inspiration, pas de contenu.

**Specs fonctionnelles, sans code.** Les specs décrivent ce que l'utilisateur voit et fait, et les règles de gestion. Elles ne contiennent :

- aucun nom de bibliothèque, de fonction, de classe ou de champ d'API ;
- aucune notation technique (`type:nom`, `requires`, syntaxe JSON, codes d'erreur internes) ;
- aucune consigne d'implémentation.

Un concept technique se dit avec les mots de l'interface : « dépend de l'outil playwright-run » et non `requires: tool:playwright-run` ; « empreinte de configuration » et non `fingerprint` ; « si l'élément n'est pas pris en charge par le harness : avertir ou bloquer » et non `onUnsupported`. Ce que l'interface affiche réellement à l'utilisateur reste tel quel (une commande à copier dans un parcours guidé, un nom de branche, un nom de secret) : c'est du contenu d'écran, pas une mention de code. Les classes Tailwind du balisage ne sont pas concernées : elles servent la maquette, pas le texte.

**Retouche de maintenance** d'un lot déjà validé (liens vers un nouveau lot, coquille corrigée, coquille de texte, mise à niveau du template) : pas de nouvelle itération, mais une entrée « Maintenance · date » dans le journal qui dit ce qui a été touché. Toute modification d'un écran ou d'une règle reste une itération.

Une décision qui touche l'identité (couleur, police, rayon) se fait dans `tokens.css`, puis on reconstruit les documents, jamais par une classe isolée dans un écran.

**Badges d'écran** : ils disent l'état par rapport au produit en service, pas l'itération. Nouveau = n'existe pas encore dans le produit (tous les écrans d'un produit à créer) ; Modifié = écran existant qui change ; Existant = reproduit pour contexte. Ce qui a changé d'une itération à l'autre se lit dans le journal.

## 7. Préparer les développements

Quand la personne considère les specs prêtes :

- Plus de point ouvert bloquant ; les points non bloquants sont marqués comme tels.
- Proposer, dans la conversation ou en fin de document, l'**inventaire des composants** : chaque composant récurrent (bouton, badge d'état, carte de demande, panneau…), ses variantes, les écrans où il apparaît. C'est la première liste de tâches front.
- Rappeler que `tokens.css` se copie tel quel dans le CSS de l'application (Tailwind v4) et que les classes des maquettes sont réutilisables.
- Si la personne le demande, découper en stories : une par écran ou par état, avec les annotations comme critères d'acceptation.

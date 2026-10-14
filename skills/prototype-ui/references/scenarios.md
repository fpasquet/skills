# Scénarios de test et démos

Un scénario donne à la personne testée un objectif réaliste et la laisse trouver son chemin dans le prototype. Le panneau « Scénarios » affiche l'objectif et des étapes à cocher ; l'animateur observe où elle hésite.

## Format (`src/prototype.json` → `scenarios`)

```json
{
  "id": "first-session",
  "title": "Lancer une première session",
  "persona": "Léa, développeuse dans l'équipe Paiements",
  "goal": "Votre ticket « Export CSV des factures » est prêt. Faites-le prendre en charge par un agent et suivez-le jusqu'à la PR.",
  "start": "e2.html",
  "preset": "first-use",
  "steps": [
    { "text": "Connecter votre abonnement Claude Code", "page": "e3.html" },
    { "text": "Créer le projet Facturation avec ses dépôts", "page": "e4.html", "preset": "claude-code-connected" },
    { "text": "Lancer la session sur le ticket", "page": "e13.html", "preset": "facturation-created" },
    { "text": "Répondre à la question de l'agent", "page": "e15.html?id=s-1042", "preset": "session-waiting" },
    { "text": "Ouvrir la PR en brouillon", "page": "e15.html?id=s-1042", "preset": "session-answered" }
  ]
}
```

- `start` : la page où commence la tâche, pas forcément l'accueil du produit.
- `preset` : situation de départ (fonction de `window.PROTO_PRESETS` dans `data.js`). Sans preset, l'état initial. Commencer un scénario remet toujours les données à zéro : deux testeurs partent du même point.
- `steps` : 3 à 7 étapes, le **déroulé du scénario type**. Chaque étape a son écran (`page`, avec ses paramètres) et, si besoin, l'état garanti en y arrivant (`preset`).

## Déroulé dans le panneau

« Commencer » ouvre le panneau sur l'étape 1. **Suivant** coche l'étape en cours, complète les données avec le preset de l'étape suivante et ouvre son écran. **Précédent** rouvre l'écran de l'étape précédente avec les données qu'elle avait. Un clic sur une étape y mène directement. La dernière étape propose « Terminer », puis « Recommencer ». L'onglet replié rappelle l'étape (« Étape 2 / 5 »).

**Presets d'étape** : ils complètent, ils n'écrasent pas. Ce que la personne a vraiment fait (un nom de connexion, un projet créé à sa façon) est gardé. Le preset ajoute seulement ce qui manque pour que l'étape ait du sens (le projet, s'il n'existe pas encore). Écrire chaque preset d'étape pour qu'il fonctionne aussi bien après les gestes réels qu'après une série de Suivant.

- **En test** : on laisse le testeur faire les gestes. L'animateur clique sur Suivant quand le jalon est atteint : l'écran de l'étape suivante s'ouvre, ce qui est aussi un moyen de débloquer quelqu'un (à noter dans les observations).
- **En démo** : on enchaîne les Suivant pour dérouler l'histoire, en montrant les gestes clés sur chaque écran.

## Bien écrire

- **L'objectif décrit une intention, pas des clics** : « Faites prendre en charge votre ticket par un agent », pas « Cliquez sur Préparer un ticket ». Ne pas reprendre les libellés des boutons : on teste justement s'ils se comprennent.
- **Les étapes nomment des résultats** (« Projet créé avec ses dépôts »), pas des écrans ni des boutons.
- **Le persona et les données concordent** : le persona utilise les noms, projets et tickets du fil rouge, que le preset met en place.
- **Un scénario, une tâche.** Mieux vaut trois scénarios courts qu'un long : chacun se rejoue et s'analyse seul.
- **Couvrir les cas qui comptent** : premier usage, tâche principale répétée, récupération après une erreur (échec de tests, connexion expirée). Chacun a son preset.
- Rester dans les parcours câblés : un scénario qui oblige à passer par une page statique bloque le testeur.

## Observations et compte rendu

Pendant la séance, l'animateur (ou le testeur) note ce qu'il voit avec « Noter une observation » dans le panneau. Chaque note est rattachée au scénario, à l'étape en cours et à l'écran, avec l'heure. « Exporter » produit un compte rendu Markdown (scénario → étape → notes), à copier ou à télécharger. Les notes survivent à « Réinitialiser les données » : on enchaîne les testeurs, puis on exporte le tout et on efface.

Le compte rendu se lit dans la conversation : chaque hésitation ou incompréhension devient une évolution des specs (skill `specs-ui`), puis le prototype suit.

## Préparer une séance de test

Proposer à la personne, dans le compte rendu de publication :

1. le lien de l'artifact, à ouvrir dans un navigateur sur l'ordinateur ou le téléphone du testeur ;
2. l'ordre des scénarios (du plus simple au plus riche) ;
3. les consignes à l'animateur : lire l'objectif à voix haute, demander au testeur de penser tout haut, ne pas aider avant un vrai blocage, passer à l'étape suivante quand le jalon est atteint, noter les hésitations à chaque étape dans le panneau (« Noter une observation ») ;
4. « Réinitialiser les données » entre deux testeurs (ou commencer chaque scénario depuis l'accueil, ce qui remet tout à zéro), sans perdre les observations ; en fin de séance, « Exporter » ;
5. au besoin, un lien direct vers une étape (`…?scenario=<id>&scenario-step=<n>`) pour reprendre une séance au bon endroit.

Les retours de test se reportent dans les specs (skill `specs-ui`) : un libellé incompris, un état manquant, un parcours trop long y deviennent une évolution, puis le prototype suit (« Suivre les specs » dans SKILL.md).

## Démo

- Commencer depuis l'accueil du prototype et lancer le scénario voulu, puis « Masquer » le panneau. La touche « . » le fait revenir.
- `?clean` dans l'adresse cache le panneau dès l'ouverture (projection, captures).
- Les évolutions simulées (`later`) rendent la démo vivante : un agent qui avance pendant qu'on parle. Garder leurs délais courts.

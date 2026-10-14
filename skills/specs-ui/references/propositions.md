# Proposer des interfaces : disposition + thème

À utiliser quand l'interface du produit n'est pas encore validée. Une proposition n'est pas un thème de couleurs : c'est **une manière d'organiser le travail** (la disposition) **et une identité** (le thème). La personne doit pouvoir choisir la meilleure organisation, le meilleur thème, ou combiner les deux, puis continuer à itérer sur l'UX comme sur l'apparence.

## 1. Ce qu'il faut savoir avant de proposer

Le demander en une seule fois, avec les questions de l'étape 0 du SKILL.md, et seulement ce que la conversation n'a pas déjà dit. Un brief détaillé suffit souvent : dans ce cas, ne rien demander et écrire les hypothèses.

- **Qui utilise l'outil, combien de temps, sur quel support, pour faire quoi** : surveiller, traiter une file, configurer, comprendre… Souvent plusieurs profils coexistent, et chaque disposition peut en servir un en priorité.
- **Contraintes imposées** : couleur de marque, logo, police sous licence, accessibilité renforcée, mode sombre.
- **Ton recherché** : deux ou trois adjectifs, des produits aimés ou rejetés.
- **Densité attendue**.

## 2. Trois dispositions vraiment différentes

Chaque disposition répond à une hypothèse d'usage différente (voir `qualite-ui.md` §1). Elles diffèrent par leur **structure**, pas seulement par leur habillage :

| Dimension | Exemples d'options |
|---|---|
| Navigation | Barre latérale avec sections · barre haute · rail d'icônes · navigation contextuelle (onglets d'un objet) · palette de commandes |
| Organisation de l'écran | Indicateurs + tableau · colonne centrée de cartes · liste et détail côte à côte · tableau de bord en grille · chronologie · tableau kanban |
| Point focal | Chiffres du jour · prochaine action · objet ouvert · alerte |
| Manière de travailler | Piloter et répartir · enchaîner au clavier · être guidé pas à pas |
| Mobile | Onglets en bas + liste · cartes riches · liste compacte puis écran poussé |

Deux dispositions ne doivent pas partager à la fois la navigation **et** l'organisation de l'écran. Si c'est le cas, l'une des deux n'apporte rien : la remplacer.

**Au moins une disposition doit naître du domaine** plutôt que d'un gabarit : les étapes d'un pipeline en colonnes, un calendrier, une carte, une chronologie, un plan, un schéma de dépendances… C'est souvent la proposition la plus juste, et celle qu'aucun outil générique ne propose. Les trois dispositions du template (barre latérale + tableau, barre haute + cartes centrées, rail + liste et détail) sont les solutions les plus répandues : en reprendre une est permis, en reprendre deux demande une justification écrite dans le comparatif.

**Réinterpréter l'écran est permis** si la disposition sert le même besoin : un tableau de bord peut devenir une file de travail ou une session ouverte, si c'est ainsi que l'utilisateur gagne du temps. Le dire dans la description de la proposition et dans ses points de vigilance (ce qui n'est plus visible d'emblée).

## 3. Trois thèmes vraiment différents

| Axe | Exemples de positions |
|---|---|
| Luminosité | Clair · sombre · clair avec navigation sombre ou colorée (tokens `nav-*`) |
| Palette | Neutres froids + couleur franche · neutres chauds + couleur sourde · quasi monochrome + un accent vif |
| Typographie | Une sans-serif sobre · une sans-serif à personnalité · grotesque technique + mono pour les données · serif pour les titres |
| Formes | Angles vifs (2-4 px) · arrondis moyens (6-10 px) · pilules et grands rayons |
| Densité | Compacte (32 / 36 px) · standard (40 / 48) · aérée (44-48 / 56-64) |
| Relief | Bordures seules · bordures + ombre légère · ombres douces sans bordure · aplats |

Deux thèmes ne doivent pas se ressembler sur plus de deux axes. Au moins un des trois thèmes devrait explorer une autre luminosité (sombre, ou navigation sombre) quand le public s'y prête : outils de développeurs, supervision, usage prolongé.

**Éviter les archétypes vus partout** quand rien dans le brief ne les justifie : crème + terracotta + serif éditoriale, dégradé violet sur fond noir, bleu SaaS + Inter sans autre parti pris.

Si la marque impose une couleur, les trois thèmes la gardent et diffèrent par tout le reste (neutres, luminosité, typographie, formes, densité, place de la couleur).

## 4. Associer et rendre les combinaisons possibles

- Proposition A = disposition A + thème A, et ainsi de suite. Chaque thème doit aller avec sa disposition (un thème dense pour une disposition « enchaîner vite », un thème aéré pour une disposition « être guidé »).
- Les dispositions n'utilisent **que** les tokens : n'importe quel thème s'applique à n'importe quelle disposition. Les boutons « Thème » du template le permettent en direct ; la personne peut répondre « disposition C avec le thème A ».
- Test de la vignette : réduire les trois captures desktop à environ 320 px de large et les mettre côte à côte. Si deux se confondent, ce sont les mêmes propositions : en changer une.

## 5. Règles de construction des thèmes

### Couleurs

- Partir de la couleur principale, puis teinter légèrement les neutres vers sa teinte.
- `primary-soft` : la couleur principale très claire (ou très sombre en thème sombre), en fond d'élément actif. `primary-hover` : 10 à 15 % plus sombre (plus claire en thème sombre).
- Thème sombre : `canvas` et `surface` sombres (pas de noir pur), `ink` clair, couleurs d'état éclaircies, `-soft` sombres, et `on-primary` / `on-danger` foncés si les couleurs pleines sont claires.
- Toutes les valeurs en hexadécimal. Lancer `node <skill>/scripts/check-contrast.mjs specs/ui/propositions.html` : toutes les paires obligatoires doivent passer le niveau AA. Corriger avant de montrer. La paire `line-strong` est un conseil (3:1).

### Typographie

- Google Fonts uniquement (ou pile système), deux familles au plus par thème, plus éventuellement une mono.
- Exemples de familles fiables, à choisir pour une raison et non par défaut (toute famille Google Fonts convient) : Public Sans · Manrope · IBM Plex Sans + Plex Mono · Source Sans 3 + Source Serif 4 · Work Sans · Atkinson Hyperlegible (lisibilité renforcée) · Space Grotesk + JetBrains Mono · Instrument Sans · Outfit · DM Sans + DM Mono · Inter (très répandue, donc peu distinctive) · Marianne (seulement pour un service de l'État, à condition d'y avoir droit).
- Vérifier les accents français et les chiffres dans la graisse utilisée.

## 6. L'écran représentatif

Un seul écran, celui qui ressemble le plus au cœur de l'outil, avec de quoi juger les deux dimensions : navigation, titre, chiffres ou état principal, liste ou objet métier, actions principale et secondaire, états, champ.

- **Même contenu** dans les trois dispositions (mêmes objets, mêmes noms, mêmes valeurs) : seules l'organisation et l'apparence changent. Une disposition peut montrer plus ou moins d'éléments si c'est sa nature (une liste compacte en montre plus) ; le dire dans le comparatif.
- Contenu réaliste, en français, issu du domaine. Jamais de lorem ipsum.
- Desktop et mobile, chaque disposition ayant sa version mobile.
- Appliquer `qualite-ui.md` : point focal, hiérarchie, pas d'empilement de cartes identiques, détails de produit fini.

## 7. Présenter et faire choisir

Partir de `templates/propositions.html` :

1. Remplir la section « À valider » : inventaire des écrans, parcours, hypothèses, questions numérotées (et leur nombre dans le lien de navigation). C'est ce que voit la personne qui n'ouvre que le lien.
2. Remplacer le contexte, les trois blocs `[data-product-theme]` (valeurs `--t-*`), les textes de chaque proposition (disposition, thème, « À choisir si », points forts et de vigilance) et le comparatif (lignes Disposition et Thème).
3. Remplacer les six templates d'écran (`tpl-desktop-a/b/c`, `tpl-mobile-a/b/c`) par l'écran du produit. Le template « Orbe » montre le niveau de finition attendu, pas une structure à recopier.
4. Charger dans le `<link>` Google Fonts toutes les familles des trois thèmes.
5. Vérifier les contrastes, capturer, passer la grille de revue de `qualite-ui.md`, faire le test de la vignette, publier.
6. Demander de choisir (outil de questions interactives s'il existe, sinon dans le message) : une lettre, une combinaison (« disposition C, thème A »), ou une proposition avec retouches.

Si rien ne convient, faire un second tour à deux propositions en partant de ce qui a plu (« la liste de C mais avec les indicateurs de A »). Plus de deux tours signale en général une contrainte non dite : la demander franchement.

## 8. Figer le choix

- **Thème** : recopier les valeurs `--t-*` du thème retenu dans `tokens.css`, au format `@theme` standard (`--color-primary: #…`). Indiquer la source et la date. Relancer la vérification des contrastes.
- **Disposition** : elle devient la coquille des specs (`tpl-shell-desktop`, `tpl-shell-mobile`) et le modèle d'organisation des écrans semblables. Noter en tête des specs la disposition retenue et les retouches demandées.
- Garder `propositions.html`, ne jamais le supprimer : ajouter en tête un encadré « Décision » (choix, retouches, date, réponses aux questions) et marquer « À valider » comme tranché. Il montre pourquoi ce choix a été fait.
- Un thème dérivé (« le thème de C, mais en clair ») est un nouveau jeu de tokens : le construire, le vérifier (contrastes), et le montrer dans `propositions.html` sous la décision, appliqué à la disposition retenue, avant de produire les specs.
- L'itération continue dans les specs : un écran dont la disposition fait débat peut recevoir deux ou trois variantes (`E5-A`, `E5-B`), voir `redaction-specs.md`.

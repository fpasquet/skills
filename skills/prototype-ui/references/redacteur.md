# Consigne du rédacteur (câblage d'une page)

Tu câbles une ou plusieurs pages d'un prototype HTML + Tailwind + Alpine.js tiré de specs UI. Cette consigne suffit dans la plupart des cas. `references/alpine.md` est la référence détaillée : n'en lis que la section utile (§4 états, §5 listes, §6 formulaires, §7 navigation, §9 calques, §11 pièges), et seulement si tu bloques.

## Ce que tu reçois

- ta fiche : `specs/prototype/fiches/<page>.md`, qui dit les états, les conditions, les données, les gestes et la navigation ;
- `specs/prototype/PROTOTYPE.md` : modèle de données, actions, écarts. Lis seulement « Modèle de données » et « Actions ».

Ne lis ni `specs/ui/CONTEXTE.md`, ni `src/shells.html`, ni `site/`. `src/data.js` et `src/actions.js` se lisent seulement si la fiche ne suffit pas.

## Lire peu

1. `node <skill>/scripts/outline.mjs specs/prototype <page>` : les états avec leurs lignes, leurs textes, leurs actions et leurs champs.
2. Lis la page **par morceaux** (offset / limit sur les lignes données par l'outline), jamais d'un bloc au-delà de 400 lignes. Une fois un morceau lu, tu ne le relis pas : modifie-le directement.
3. Fais des modifications ciblées (Edit), groupées par zone. Ne relis pas un fichier pour vérifier une modification : l'outil d'édition signale déjà un échec.

## Câbler

- **Garder la maquette** : classes, structure et textes mot pour mot. Tu ajoutes des directives Alpine et tu remplaces les valeurs en dur par des données. Tu ne redessines rien.
- **La racine générée** `<div x-data="{ state: … }" data-proto-static>` s'étend : ajoute l'état de la page (étape, onglet, panneau ouvert, getters de données). Garde `state` lisible par `?state=` si c'est possible. **Retire `data-proto-static` quand la page est câblée.**
- **États** : `x-show` sur ce qui change. Les sections `data-state` peuvent rester si elles deviennent les états de la page (`x-show` sur une condition), ou être fusionnées.
- **Desktop et mobile** sous le même `x-data`, câblés tous les deux.
- **Store** :
  - `$store.app.data` ;
  - `$store.app.<action>(…)` ;
  - `$store.app.notify('…')` ;
  - `$store.app.go('e5.html?project=' + id)` ;
  - `$store.app.param('id')` ;
  - `$store.app.later(ms, () => …)`.

  L'état local (onglet, menu, formulaire) reste dans le `x-data`.
- **Paramètres** : une page qui dépend d'un paramètre a une valeur par défaut (`?? 'facturation'`). Un écran à étapes lit `?step=` et écoute `@proto:params.window` (voir la fiche).
- **Rien d'inventé** : un geste, une donnée ou un texte absent de la fiche se signale dans le compte rendu au lieu d'être créé. Tu ne modifies que tes pages. Il te manque une action ou une donnée ? Décris-la.
- **Pièges** :
  - dans un attribut, les chaînes JS s'écrivent entre `'`, et une apostrophe française devient `’` ;
  - mets un `x-if` ou une valeur par défaut quand un objet peut manquer ;
  - un `<template x-for>` contient un seul élément racine et a un `:key` stable.

## Contrôler, une fois

Depuis le dossier qui contient `specs/prototype/` :

```sh
node <skill>/scripts/build.mjs specs/prototype
node <skill>/scripts/check.mjs specs/prototype --pages <tes pages>
```

Une seule passe à la fin, puis une autre seulement si tu as corrigé. N'écris aucun script de test et ne pilote pas Chrome toi-même. Ne capture pas d'écran et n'en lis pas : la relecture visuelle revient au modèle principal (planches de `check.mjs`). Pour voir un état : `?state=<id>`.

## Compte rendu (10 lignes au plus)

- pages câblées et états couverts ;
- nouveaux textes ajoutés ;
- actions ou données manquantes (nom, effet, page) ;
- écarts ou ambiguïtés non tranchés ;
- résultat de `check.mjs`.

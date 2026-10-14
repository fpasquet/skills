# Câbler une page avec Alpine.js

Référence pour rendre vivante une page issue des specs (`src/pages/eN.html`) sans abîmer la maquette. À lire avant de câbler et à donner aux sous-agents rédacteurs avec les fiches de câblage.

Sommaire : 1. Ce que contient une page · 2. Principe · 3. Store et données · 4. États · 5. Listes · 6. Formulaires · 7. Navigation · 8. Actions et évolution simulée · 9. Calques, menus, onglets · 10. Coquilles et blocs partagés · 11. Pièges · 12. Compte rendu du rédacteur

## 1. Ce que contient une page

```html
<div x-data="{ state: $store.app.param('state') ?? 'e13a' }" data-proto-static>   <!-- racine générée -->
  <section data-state="e13a" x-show="state === 'e13a'">       <!-- un état de l'écran, tel que maquetté -->
    <div class="hidden lg:block h-dvh w-full …" data-use="shell-desktop" data-active="accueil">…</div>  <!-- desktop -->
    <div class="lg:hidden h-dvh w-full …" data-use="shell-mobile">…</div>                               <!-- mobile -->
  </section>
  <section data-state="e13b" x-show="state === 'e13b'" x-cloak>…</section>
</div>
```

Chaque `<section data-state>` est un état de la maquette, affiché selon `?state=` (le premier par défaut). `data-use` insère une coquille ou un bloc de `src/shells.html` au chargement, avant Alpine : les directives Alpine placées dans un bloc fonctionnent donc. Un `data-backdrop` est l'écran d'arrière-plan d'un panneau : c'est la page d'où l'on vient.

Pour un aperçu rapide des états avant d'ouvrir le HTML : `node <skill>/scripts/outline.mjs prototype-ui e13`.

## 2. Principe

Câbler, c'est ajouter, pas redessiner :

- on garde **les classes, la structure et les textes** de la maquette ;
- on remplace les valeurs en dur par des données (`x-text`, `x-for`) ;
- on relie les boutons et les formulaires aux actions ;
- on **fusionne les états** : un seul écran, des `x-show` sur ce qui change d'un état à l'autre.

Pour fusionner, partir de l'état le plus complet. Pour chaque autre état, repérer la différence : un bloc en plus, en moins ou remplacé. Mettre un `x-show` sur ces blocs. Quand deux états diffèrent presque partout (un formulaire, puis une confirmation plein écran), garder deux blocs entiers sous `x-show`, c'est plus lisible.

Un seul `x-data` enveloppe desktop et mobile, pour qu'ils partagent l'état de la page (celui de la racine générée, étendu) :

```html
<div x-data="{ step: 1, confirmOpen: false, get session() { return $store.app.data.sessions.find(s => s.id === ($store.app.param('id') ?? 's-1042')) } }">
  <div class="hidden lg:block h-dvh w-full …" data-use="shell-desktop" data-active="sessions">…</div>
  <div class="lg:hidden h-dvh w-full …" data-use="shell-mobile">…</div>
</div>
```

Le câblage étend le `x-data` racine (données, conditions des états). Les sections peuvent rester si elles servent d'états pilotés par des conditions, ou être fusionnées. **Une fois la page câblée, retirer `data-proto-static`** : c'est ce qui la fait sortir de la liste « Pages still static » de `check.mjs`. Garder si possible `?state=` utilisable (`state: $store.app.param('state') ?? …`) : les étapes de scénario et les relectures s'en servent.

**États dérivés.** Un parcours passe souvent par un état que les specs n'ont pas dessiné : l'accueil après la première étape faite, un projet tout juste créé et encore vide. Le construire avec les éléments des maquettes voisines (un état vide existant ailleurs, le style « fait » d'un stepper), sans nouveau composant. La fiche de câblage le décrit, et `PROTOTYPE.md` le note dans « Écarts avec les specs » et « À valider », pour qu'il soit maquetté dans les specs si le test le confirme.

## 3. Store et données

| Dans la page | Rôle |
|---|---|
| `$store.app.data` | état simulé, sauvegardé dans le navigateur (`src/data.js`) |
| `$store.app.ui` | état d'interface partagé entre blocs d'une même page, non sauvegardé |
| `$store.app.<action>(…)` | action métier (`src/actions.js`), sauvegardée automatiquement |
| `$store.app.notify('…')` | message de confirmation en bas de l'écran |
| `$store.app.go('e15.html?id=s-1042')` | navigation (sauvegarde avant de partir) |
| `$store.app.param('id')` | paramètre de l'adresse |

L'état local d'une page (onglet ouvert, étape d'un assistant, menu déplié) va dans son `x-data`, pas dans le store.

Toujours prévoir une valeur par défaut quand la page dépend d'un paramètre (`?? 's-1042'`) : la page doit s'ouvrir seule depuis la liste « Tous les écrans ».

## 4. États

```html
<p x-show="session.status === 'waiting'" class="…">En attente de réponse</p>
<p x-show="session.status === 'failed'" class="…">Échec des tests</p>
<template x-if="!project.repositories.length"><div class="…">Aucun dépôt</div></template>
```

- `x-show` pour basculer, `x-if` (dans un `<template>`) quand le bloc n'a pas de sens sans données (évite les erreurs sur `undefined`).
- Classes conditionnelles : `:class="{ 'bg-primary-soft': selected === s.id }"`, en gardant la classe statique de la maquette dans `class`.
- Ajouter `x-cloak` sur ce qui ne doit pas clignoter au chargement (panneaux, messages).

## 5. Listes

Prendre une ligne de la maquette comme modèle, la mettre dans un `<template x-for>`, supprimer les autres lignes en dur :

```html
<template x-for="s in $store.app.data.sessions.filter(s => s.project === 'facturation')" :key="s.id">
  <a :href="'e15.html?id=' + s.id" class="flex h-row items-center gap-3 border-b border-line px-4 hover:bg-surface-alt">
    <span class="font-mono text-xs text-muted" x-text="s.id.toUpperCase()"></span>
    <span class="truncate" x-text="s.title"></span>
  </a>
</template>
```

Les compteurs se calculent (`x-text="sessions.filter(s => s.status === 'waiting').length"`), pour rester justes quand les données changent. Les icônes Lucide dans un `x-for` sont dessinées automatiquement.

## 6. Formulaires

```html
<form x-data="{ name: '', error: '' }" @submit.prevent="name.trim() ? $store.app.go('e5.html?id=' + $store.app.createProject({ name }).id) : (error = 'Donnez un nom au projet')">
  <input x-model="name" class="h-control w-full rounded-control border border-line-strong px-3" :class="error && 'border-danger'">
  <p x-show="error" x-text="error" class="mt-1 text-xs text-danger"></p>
  <button class="h-control rounded-control bg-primary px-4 text-on-primary">Créer le projet</button>
</form>
```

- Valider seulement ce que les specs valident, avec leurs messages exacts (états d'erreur maquettés).
- Préremplir avec les valeurs du fil rouge quand la maquette les montre : le testeur n'a pas à taper « Facturation ».
- Un assistant à étapes : `step` dans le `x-data`, un bloc par étape sous `x-show="step === n"`, « Continuer » fait `step++`.

## 7. Navigation

- Lien simple : `href="e5.html"`. Vers un objet : `:href="'e15.html?id=' + s.id"`.
- Après une action : `$store.app.go(…)` (sauvegarde puis navigue).
- **États internes ouvrables par l'adresse** : un écran à étapes ou à onglets lit un paramètre pour s'ouvrir au bon endroit (`step: Number($store.app.param('step')) || 1`). Les étapes des scénarios s'en servent (`"page": "e4.html?step=2"`). Quand l'étape suivante reste sur le même écran, le panneau change l'adresse sans recharger et envoie l'événement `proto:params` : la page l'écoute pour suivre (`@proto:params.window="step = Number($store.app.param('step')) || 1"`).
- Retour : vers la page parente explicite (`href="e14.html"`), pas `history.back()` (une page ouverte seule n'a pas d'historique).
- Fermer un panneau ouvert sur un écran d'arrière-plan (`data-backdrop`), c'est aller vers la page de cet écran.
- Une destination hors des parcours câblés reste un lien vers sa page statique : le testeur voit la maquette, sans comportement.

## 8. Actions et évolution simulée

Les actions vivent dans `src/actions.js`, écrites par le modèle principal. Le rédacteur les appelle ; s'il en manque une, il la décrit dans son compte rendu au lieu de l'écrire.

```js
window.PROTO_ACTIONS = {
  answerQuestion(sessionId, answer) {
    const s = this.data.sessions.find((s) => s.id === sessionId);
    s.status = 'running';
    s.answer = answer;
    this.notify('Réponse envoyée à l'agent');
    // L'agent reprend, puis ouvre sa PR quelques secondes plus tard
    this.later(6000, () => { s.status = 'review'; s.pr = 'PR #482'; });
  },
};
```

`later()` simule ce qui arrive sans la personne : un agent qui avance, une réponse, un événement reçu. Garder des délais courts (3 à 10 s) : un test ne doit pas attendre. L'effet est sauvegardé ; si la personne a changé de page entre-temps, elle le verra en revenant.

## 9. Calques, menus, onglets

```html
<div x-data="{ open: false }" class="relative">
  <button @click="open = !open" class="…">Actions</button>
  <div x-show="open" x-cloak @click.outside="open = false" @keydown.escape.window="open = false" class="absolute right-0 mt-1 rounded-card border border-line bg-surface shadow-overlay">…</div>
</div>
```

- Modale : même principe, avec le voile de la maquette sous `x-show`. `Échap` ferme si la maquette l'indique.
- Onglets : `tab` dans le `x-data`, `:aria-current="tab === 'sessions' && 'page'"` sur l'onglet, un panneau par onglet sous `x-show`. Reprendre le style actif de la maquette avec `:class`.
- Raccourcis montrés dans la maquette (⌘K, Échap) : les câbler avec `@keydown.window`, s'ils font partie d'un parcours.

## 10. Coquilles et blocs partagés

Les coquilles (`shell-desktop`, `shell-mobile`) et les blocs (`contenu-e2b`) viennent de `src/shells.html` et servent à plusieurs pages.

- **La navigation des coquilles vient de `prototype.json` → `nav`**, que le scaffold propose (chaque entrée `data-nav` mène au premier écran où elle est active dans les maquettes) et que le build applique aux liens sans destination. Pour viser un seul template : `"tpl-entete-projet:sessions"`. `{project}` reprend ce paramètre de la page en cours, avec sa valeur par défaut dans `params` : `"e14.html?project={project}"`. Le modèle principal relit la table avant de lancer les rédacteurs.
- Le reste du câblage partagé (barre latérale tirée des données, en-têtes communs) se fait dans `shells.html`, par le modèle principal. `outline.mjs prototype-ui --shells` donne les templates avec leurs lignes, leurs slots et leurs zones : lire seulement les lignes du template à câbler, jamais le fichier entier.
- Un bloc partagé qui doit changer pour une seule page : copier son contenu dans la page plutôt que modifier le bloc.
- Les compteurs de la coquille (`data-slot-boite="3"`) peuvent rester en dur, sauf si un parcours les fait changer : remplacer alors le `data-slot-…` par un `x-text` dans la coquille.
- Une coquille vivante peut contenir des `<template x-for>` imbriqués dans son `<template id="tpl-…">` : le build les gère.
- **Garder les valeurs maquettées tout en servant les objets créés dans le prototype** : les slots (`data-slot-projet="Espace client"`) sont remplis à l'assemblage, avant Alpine ; un `x-init` les remplace seulement quand il le faut. Exemple dans un en-tête partagé : `<h1 data-slot="projet" x-init="p?.fresh && ($el.textContent = p.name)">`. Les pages statiques gardent ainsi leur contenu, et un projet créé dans le prototype affiche le sien.

## 11. Pièges

- **Guillemets** : une expression Alpine dans un attribut entre `"` utilise des `'` à l'intérieur. Une apostrophe française dans une chaîne JS s'écrit `’` (typographique) ou s'échappe : `'Réponse envoyée à l\'agent'`.
- **Objet introuvable** : `session.title` plante si `session` est `undefined`. Utiliser `x-if` ou une valeur par défaut dans le getter.
- **`x-for` sur un `<template>`** avec un seul élément racine à l'intérieur, et un `:key` stable (l'identifiant).
- **Pas de `x-data` imbriqué inutile** : un bloc enfant voit les variables du parent. Un nouveau `x-data` ne sert que pour un état vraiment local (un menu).
- **Ne rien charger de plus** : pas d'autre bibliothèque, pas de `fetch`. Tout est dans le store.
- **Textes** : ceux des specs, mot pour mot. Une nouvelle phrase (message de confirmation) suit le ton des specs et se signale dans le compte rendu.
- Après câblage : `build.mjs` puis `check.mjs --pages <tes pages>`. Zéro problème avant de rendre la main.

## 12. Compte rendu du rédacteur

En fin de tâche, le sous-agent rend en quelques lignes :

- les pages câblées et les états couverts ;
- les actions ou données manquantes (nom, effet attendu, page) ;
- les écarts ou ambiguïtés trouvés dans la fiche ou les specs, sans les avoir tranchés ;
- le résultat de `check.mjs`.

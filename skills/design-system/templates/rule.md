# Design system ({{app}})

<!-- if:own -->
Conventions de l'interface : tokens, classes sémantiques, composants shadcn/ui sur {{primitives}}, Storybook. Mémoire et
décisions du design system : `{{memory}}`.
<!-- end:own -->
<!-- if:daisyui -->
Conventions de l'interface : tokens, classes de daisyUI réglées par les tokens, composants React sur ces classes
(primitives {{primitives}} au besoin), Storybook. Mémoire et décisions du design system : `{{memory}}`.
<!-- end:daisyui -->
Contrôles du dépôt : le lint et les histoires (`test:stories`). L'audit
(`audit.mjs`) et le rangement des composants (`rehome.mjs`) sont des scripts du skill d'agent `design-system`, qui
n'est pas forcément installé dans le dépôt.

## Trois couches

1. **Tokens** : `{{tokens}}`, source unique des couleurs, polices, tailles de texte, rayons, hauteurs et ombres (bloc
   `@theme` de Tailwind v4). Une valeur se change là, jamais dans un composant.{{tokensSource}}
<!-- if:own -->
2. **Thème et classes** : `{{styles}}/theme.css` (variables de shadcn/ui pointées sur les tokens, mode sombre `.dark`,
   entrées nommées des mises en page, `@custom-variant`) et les classes sémantiques (`@layer components`) : le CSS
   d'un composant **à côté de lui** (`{{ui}}/button/button.css` près de `button.tsx`), les classes sans composant
   React dans `{{styles}}/classes/`, un fichier par famille (`overlay.css` pour les calques) ; `{{styles}}/components.css` les
   importe tous, et une nouvelle feuille s'y ajoute.
3. **Composants** : `{{ui}}` (shadcn/ui sur {{primitives}}), dont les variantes CVA posent les classes sémantiques :
   `<Button variant="primary" size="sm">` rend `btn btn-primary btn-sm`.
<!-- end:own -->
<!-- if:daisyui -->
2. **Thème et classes** : `{{styles}}/theme.css` (thème daisyUI et variables de shadcn/ui pointés sur les tokens, mode
   sombre `.dark`, entrées nommées des mises en page, `@custom-variant`) ; les classes de {{daisyuiVersion}},
   et celles du projet pour ce que daisyUI n'a pas : la feuille d'un composant **à côté de lui**, les classes sans
   composant React dans `{{styles}}/classes/` (`overlay.css` pour les calques), toutes importées par
   `{{styles}}/components.css`.
3. **Composants** : `{{ui}}`, dont les variantes CVA posent les classes de daisyUI : `<Button variant="primary"
   size="sm">` rend `btn btn-primary btn-sm`.
<!-- end:daisyui -->

<!-- if:daisyui -->
## daisyUI

- Les classes sémantiques sont d'abord celles de daisyUI : `btn`, `btn-primary`, `btn-sm`, `card`, `card-body`,
  `badge-success`, `input`, `tabs`, `tab`, `modal`, `menu`… Le projet n'écrit une classe que pour ce que daisyUI n'a
  pas, et ne reprend jamais un nom de daisyUI pour autre chose.
- Les thèmes intégrés de daisyUI sont coupés (`@plugin "daisyui" { themes: false; }` dans `{{entry}}`) : ils sont dans
  la couche `base`, qui l'emporte sur les tokens. Le thème `app` de `{{styles}}/theme.css` pointe chaque variable de
  daisyUI sur un token (`--color-base-100: var(--color-surface)`, `--radius-field: var(--radius-control)`,
  `--size-field` tiré de `--spacing-control`) ; `primary`, `success`, `warning` et `info` sont des tokens et ne s'y
  redéclarent pas. Une couleur se change dans les tokens, jamais dans le thème daisyUI.
- daisyUI range ses classes dans la couche des utilitaires : la règle de base de chaque classe dans la sous-couche
  `daisyui.l1.l2.l3`, ses modificateurs (`btn-sm`, `btn-primary`) dans des sous-couches au-dessus. Un utilitaire du JSX
  l'emporte toujours (`btn px-6`), mais une règle de `@layer components` sur une de ses classes ne s'applique jamais.
- Un réglage global d'une classe de daisyUI passe d'abord par les variables du thème (`--radius-field`, `--size-field`,
  `--border`, `--depth`), sinon par la feuille du composant, dans la sous-couche de base :
  `@layer utilities { @layer daisyui.l1.l2.l3 { .btn { @apply font-medium; } } }`. Ses modificateurs et le JSX
  l'emportent encore. Jamais `@utility btn` : rangé hors des sous-couches, il écrase les modificateurs (`btn-sm`,
  `btn-circle`) et, selon l'ordre de Tailwind, les utilitaires du JSX (`btn font-bold` resterait en medium).
- Une classe du projet posée avec une classe de daisyUI sur le même élément va dans la même sous-couche : dans
  `@layer components`, elle perdrait contre daisyUI. Une classe du projet seule reste dans `@layer components`.
- Dans le JSX, les classes des tokens (`bg-surface`, `text-ink`, `border-line`) plutôt que les couleurs de daisyUI
  (`bg-base-100`, `text-base-content`, `border-base-300`). Les classes de composant gardent les noms de daisyUI
  (`btn-error`, `badge-success`) : le token reste `danger`. `secondary`, `accent` et `neutral` n'ont pas de token
  propre et pointent sur des tokens existants : un composant ne s'en sert pas sans décision notée dans la mémoire.
- daisyUI lit les états ARIA : `aria-selected` (onglets), `aria-checked` (case, interrupteur, radio), `aria-pressed`,
  `aria-current` (menu, onglets, dock), `aria-disabled`, `aria-invalid` (`validator`). Pas de classe d'état
  (`tab-active`, `btn-active`, `menu-active`) quand l'attribut ARIA suffit.
- Le mode sombre est la classe `dark` (bloc `.dark` de `theme.css`), pas `data-theme` : les tokens changent, et daisyUI
  suit.

<!-- end:daisyui -->
## Classes sémantiques

<!-- if:own -->
- Un motif d'interface répété devient un **composant de `{{ui}}`** (ou de `{{components}}` s'il assemble plusieurs
  composants), pas une classe recopiée dans le JSX : `Card` (`CardHeader`, `CardTitle`), `Alert`, `Field`… Avant
  d'écrire un bloc, chercher s'il existe déjà dans `{{ui}}`, puis dans le catalogue de shadcn/ui : un contrôle de
  formulaire (liste, zone de texte, case, bascule…) passe par son composant, ajouté s'il manque, même pour un seul usage.
- Un style répété (au moins deux fois, ou un motif du design system) devient une classe : `btn`, `btn-primary`,
  `btn-sm`, `card`, `alert`, `input`, `field-error`, `badge-success`, `dialog`, `sheet`, `menu`, `tabs-trigger`… Un
  ajustement ponctuel (marge, largeur, position) reste un utilitaire Tailwind dans le JSX.
<!-- end:own -->
<!-- if:daisyui -->
- Un motif d'interface répété devient un **composant de `{{ui}}`** (ou de `{{components}}` s'il assemble plusieurs
  composants), pas une liste de classes recopiée dans le JSX : `Button`, `Card`, `Tabs`, `Modal`… Avant d'écrire un
  bloc, chercher s'il existe déjà dans `{{ui}}`, puis dans daisyUI, puis dans le catalogue de shadcn/ui : un contrôle
  de formulaire (liste, zone de texte, case, bascule…) passe par son composant, ajouté s'il manque, même pour un seul
  usage.
- Un style répété (au moins deux fois, ou un motif du design system) prend la classe de daisyUI qui le décrit
  (`btn btn-primary btn-sm`, `card`, `badge badge-success`, `alert`, `input`, `menu`, `tabs`), sinon une classe du
  projet (`overlay` et `popup` pour les calques). Un ajustement ponctuel (marge, largeur, position) reste un utilitaire
  Tailwind dans le JSX.
<!-- end:daisyui -->
- `@apply` pour les cas simples ; CSS standard pour les sélecteurs complexes et les états. `focus-ring` est un
  `@utility` pour pouvoir être appliqué par `@apply`.
- Couleurs uniquement par les tokens (`bg-surface`, `text-muted`) ou les variables du thème (`bg-background`) :
  jamais de valeur en dur, jamais la palette de Tailwind (`bg-gray-100`, `text-white`). Les couleurs d'état (succès,
  attente, échec, information) ne servent qu'aux états.
- **Aucune valeur arbitraire** de Tailwind (`w-[720px]`, `text-[13px]`, `grid-cols-[…]`, `rounded-[3px]`) ni
  variante arbitraire (`aria-[current=page]:`, `[&>svg]:`) : une taille vient des échelles des tokens (noms de
  Tailwind restreints aux pas retenus : `p-4`, `gap-2`, `text-sm`, listés sur la page Tokens de Storybook) ou d'une
  dimension nommée d'après son usage (`h-control`), une mise en page d'écran d'une entrée nommée du thème
  (`grid-cols-content-aside`, `max-w-measure`), une variante d'un `@custom-variant` (`aria-current:`). Une classe
  hors de l'échelle (`p-5`) n'existe pas : un pas qui manque s'ajoute aux tokens. Dans une feuille de style, du CSS
  standard plutôt qu'un `@apply` à valeur arbitraire.
- Une taille ne change pas selon l'écran dans les tokens : la variation s'écrit dans le JSX (`md:`) ou dans la classe
  d'un composant.
- Une animation d'ouverture s'arrête sous `prefers-reduced-motion`, dans la feuille du composant animé.
- Attention : `muted` est, dans les tokens, la couleur du texte secondaire (`text-muted`) ; l'équivalent shadcn est
  `muted-foreground`. Ne pas redéfinir `--color-muted`, et écrire le fond secondaire `bg-surface-alt`, jamais
  `bg-muted` (qui prendrait la couleur du texte).
- Le lint vérifie les classes du JSX (`eslint-plugin-better-tailwindcss`, qui lit `{{entry}}`) : ordre canonique,
  classes inconnues (classes sémantiques comprises), en double ou en conflit, formes dépréciées, valeurs arbitraires.

## Pas d'attribut data-*

<!-- if:own -->
- Ni `data-slot`, ni `data-variant`, ni `data-size`. Une variante est une classe de modificateur (`btn-primary`,
  `sheet-right`, `menu-item-danger`) ; un test cible un rôle ou un libellé accessible.
<!-- end:own -->
<!-- if:daisyui -->
- Ni `data-slot`, ni `data-variant`, ni `data-size`. Une variante est une classe de modificateur (`btn-primary`,
  `badge-soft`, `menu-horizontal`) ; un test cible un rôle ou un libellé accessible.
<!-- end:daisyui -->
- Un état se lit dans les attributs d'accessibilité ou les pseudo-classes : `[aria-selected='true']`,
  `[aria-expanded='true']`, `[aria-invalid='true']`, `[aria-disabled='true']`, `:focus`, `:disabled`.
{{stateAttributes}}

<!-- if:own -->
## Composants shadcn/ui

- Un dossier par composant, dans `{{ui}}` comme dans `{{components}}` : `<composant>.tsx`, son `.css`, son histoire,
  et un `index.ts` qui ré-exporte ses noms, pour que l'import reste `{{uiAlias}}/<composant>`. Entre deux composants partagés,
  l'import passe par l'alias, jamais par un chemin relatif.
- Ajout par la CLI de shadcn (version épinglée, dans `{{app}}`), qui crée le fichier à plat. Il se range ensuite
  dans son dossier (un fichier par sous-composant, `index.ts`, feuille importée par `components.css`, attributs
  `data-*` retirés), et ses utilitaires deviennent des classes sémantiques : `rehome.mjs` du skill `design-system` le
  fait, sinon à la main sur le modèle d'un composant existant.
- Garder l'API de shadcn (noms des variantes, {{asChild}}, sous-composants) ; on peut ajouter des variantes (`success`,
  `warning`…), pas en retirer. Les textes visibles (« Close » des fenêtres) passent par les messages du projet.
- `cn` vient d'un seul endroit ({{cn}}) ; CVA reste pour les variantes typées.
<!-- end:own -->
<!-- if:daisyui -->
## Composants

- Un dossier par composant, dans `{{ui}}` comme dans `{{components}}` : `<composant>.tsx`, son histoire, un `index.ts`
  qui ré-exporte ses noms (l'import reste `{{uiAlias}}/<composant>`), et sa feuille quand il règle une classe de
  daisyUI ou en ajoute une. Entre deux composants partagés, l'import passe par l'alias, jamais par un chemin relatif.
- Les variantes CVA posent les classes de daisyUI : `variant="destructive"` rend `btn-error`, `size="icon"` rend
  `btn-square`. L'API suit celle de shadcn (`variant`, `size`, {{asChild}}, sous-composants), même écrite à la main.
- Le comportement vient du HTML natif quand il suffit (`<dialog>` et `showModal()` pour `modal`, `<details>` pour
  `collapse`, `<input type="checkbox">` pour `toggle` et `checkbox`), sinon d'une primitive {{primitives}} (menu,
  liste déroulante, onglets au clavier, infobulle), qui reçoit les classes de daisyUI.
- Un composant que daisyUI n'a pas (combobox, calendrier, palette de commandes) s'ajoute par la CLI de shadcn
  (version épinglée), puis se range avec `rehome.mjs` du skill `design-system`, sous des classes du projet qui ne
  reprennent aucun nom de daisyUI.
- Les textes visibles (« Fermer » des fenêtres) passent par les messages du projet.
- `cn` vient d'un seul endroit ({{cn}}) ; CVA reste pour les variantes typées.
<!-- end:daisyui -->

## Storybook

- Chaque composant sans état (ui, bloc commun, mise en page, contenu) a son histoire `*.stories.tsx` à côté de lui,
  en CSF 3 typé (`satisfies Meta<typeof X>`), avec les textes et données du fil rouge du produit. Un composant
  connecté (qui lit des données ou un contexte) n'a pas d'histoire : sa version sans état en a une.
- **Le titre dit où est le fichier** : une section selon le rôle, puis les dossiers en anglais et en PascalCase, puis
  le composant. Six sections, dans cet ordre (`storySort`) :
  - `Design system/<Page>` : pages MDX de `{{docs}}` ;
  - `UI/<Catégorie>/<Composant>` : `{{ui}}`, par catégorie (`Actions`, `Forms`, `Overlays`, `Navigation`,
    `Display`, `Feedback`) ;
  - `Shared/<Composant>` : `{{components}}` ;
  - `Layouts/<Nom>` pour les mises en page partagées, `Layouts/<Fonctionnalité>/<Nom>` pour celles d'une fonctionnalité ;
  - `Features/<Fonctionnalité>/<Groupe>/<Composant>` : contenus d'une fonctionnalité ;
  - `Pages/<Fonctionnalité>/<Écran>` : écrans complets, nommés sans le suffixe `Screen`.
- **Pages** : `<nom>-screen.stories.tsx`, à côté de l'écran, assemble sa mise en page et son contenu avec les données
  du fil rouge, sans rendre l'écran connecté. Une histoire par état de l'écran.
- Noms d'histoires en anglais, un état chacun : `Default`, `Empty`, `Loading`, `NotFound`, `Error`, `Mobile`, ou
  l'état métier. Un squelette n'a pas d'entrée à lui : c'est l'histoire `Loading` de ce qu'il remplace.
- Les données du fil rouge communes à plusieurs histoires et la coquille qui entoure une page sont dans
  `src/stories/`, que seules les histoires importent.
- L'onglet Docs est généré pour toutes les histoires (`autodocs`, une fois dans la configuration). Une histoire qui
  ouvre un calque d'emblée (fenêtre, panneau) s'y affiche dans son propre cadre (`docs.story.inline: false`).
- Les pages de `{{docs}}` (introduction, tokens lus dans le fichier de tokens, classes) suivent toute nouvelle classe
  ou tout nouveau token, dans le même changement. Les exemples HTML des pages MDX sont dans `<Unstyled>`.
- Chaque histoire est rendue dans Chromium avec son contrôle d'accessibilité (axe), en local comme en CI : une
  histoire qui plante ou une violation fait échouer. Une violation se corrige dans le composant, jamais en
  désactivant la règle.

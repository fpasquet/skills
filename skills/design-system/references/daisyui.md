# daisyUI

Avec daisyUI 5 (Tailwind v4), les classes sémantiques du design system sont celles de daisyUI, réglées par les tokens.
`scaffold.mjs` passe dans ce mode quand une feuille de l'application déclare daisyUI (`@plugin "daisyui"`), quand
les specs le déclarent (`--specs <projet>/ui`, dont `sources/site.json` → `daisyui` : leurs maquettes emploient ses
classes, et sa version est installée), ou avec `--classes daisyui`. L'audit l'indique (ligne `daisyui`). Le paquet installé seul ne change pas le mode : sans
greffon, daisyUI ne génère aucune classe, et l'audit n'applique pas ses règles `daisyui-*`.

| Couche | Classes du projet (par défaut) | daisyUI |
|---|---|---|
| Tokens | `tokens.css`, vocabulaire commun avec `specs-ui` | Les mêmes |
| Thème | Variables de shadcn pointées sur les tokens | Les mêmes, plus un thème daisyUI pointé sur les tokens, thèmes intégrés coupés |
| Classes | Écrites par le projet dans `@layer components` | Celles de daisyUI ; le projet n'ajoute que ce qui manque |
| Composants | shadcn/ui, rangés par `rehome.mjs` | Écrits sur les classes de daisyUI ; shadcn pour ce que daisyUI n'a pas |
| Storybook, lint, audit | — | Les mêmes, avec les règles `daisyui-*` de l'audit |

## Mise en place

- `daisyui` s'installe en dépendance de développement, à la version de `templates/versions.json`.
- La feuille d'entrée déclare le greffon après ses `@import` : `@plugin "daisyui" { themes: false; }`.
- `theme.css` reçoit le thème `app`, marqué `default` et pointé sur les tokens (section suivante). Les variables de
  shadcn y restent, pour les composants de shadcn que daisyUI n'a pas, sauf `--border`.
- **`--border`** est l'épaisseur des bordures chez daisyUI (`border: var(--border) solid …`), et la couleur des
  bordures chez shadcn. Le `--border: var(--color-line)` de shadcn, déclaré dans `:root` hors couche, l'emporte sur le
  thème daisyUI : `btn` passe à 3px (`medium`), `input`, `checkbox` et `card-border` perdent leur bordure. En mode
  daisyUI, `theme.css` ne déclare donc pas `--border`, et `--color-border` pointe directement sur le token dans
  `@theme inline` (`border-border` garde sa couleur). L'audit le signale (`daisyui-border`).
- **Pourquoi `themes: false`** : les thèmes intégrés sont dans la couche `base`, qui l'emporte sur la couche `theme`
  des tokens. Avec `@plugin "daisyui";`, `light` remplace `--color-primary` par le sien dans toute l'application, et
  `dark` s'applique dès que le système est en sombre. L'audit le signale (`daisyui-builtin-theme`).
- Les options `prefix`, `include` et `exclude` du greffon restent possibles : les scripts lisent le préfixe.

## Thème daisyUI pointé sur les tokens

Chaque variable de daisyUI pointe sur un token. Une couleur se change dans les tokens, jamais dans le thème daisyUI.

| Variables de daisyUI | Token | Rôle chez daisyUI |
|---|---|---|
| `base-100`, `base-200`, `base-300` | `surface`, `surface-alt`, `line` | Cartes et champs, fonds secondaires, bordures |
| `base-content` | `ink` | Texte |
| `primary` | (token de même nom) | Action principale |
| `primary-content` | `on-primary` | Texte sur `primary` |
| `secondary`, `accent` | `surface-alt` | Comme `secondary` et `accent` de shadcn |
| `neutral`, `neutral-content` | `ink`, `surface` | Infobulles, élément actif des menus |
| `info`, `success`, `warning` | (tokens de même nom) | États |
| `info-content`, `success-content`, `warning-content` | `surface` | Texte sur une couleur d'état |
| `error`, `error-content` | `danger`, `on-danger` | Erreur, suppression |
| `radius-field`, `radius-selector`, `radius-box` | `radius-control`, `radius-control`, `radius-card` | Boutons et champs, cases et badges, cartes et fenêtres |
| `size-field` | `calc(var(--spacing-control) / 10)` | `btn` et `input` font 10 × `size-field` (`btn-sm` 8 ×, `btn-lg` 12 ×) |

- `primary`, `success`, `warning` et `info` sont déjà des tokens. Le thème ne les redéclare pas : une variable qui
  pointe sur elle-même n'a plus de valeur.
- Le texte posé sur une couleur d'état reprend la surface. Un token d'état est une couleur de texte AA sur la surface ;
  le contraste est symétrique, il tient donc en clair comme en sombre.
- `--depth: 0` et `--noise: 0` : pas d'ombre ni de grain hors des tokens d'ombre. `--depth: 1` est un choix de design,
  à noter dans la mémoire.
- Avec les thèmes intégrés coupés, chaque variable lue par les composants doit venir du thème `app` ou des tokens.
  Sinon le composant perd sa couleur ou sa bordure : `border-width: var(--border)` n'a pas de valeur de repli.
- L'audit vérifie le thème : thème intégré actif (`daisyui-builtin-theme`), valeur propre ou token redéclaré
  (`daisyui-theme-value`), variable sans valeur (`daisyui-theme-missing`), couleur sous le nom `--border`
  (`daisyui-border`).

## Partir d'un projet qui utilise déjà daisyUI

1. `audit.mjs <app>` : la ligne `daisyui` dit les thèmes en place (intégrés, ou thème du projet avec ses propres
   couleurs).
2. `scaffold.mjs <app> --mode migrate` pré-remplit `tokens.css` avec le thème qui s'applique : le thème intégré par
   défaut, recouvert par celui du projet, avec les couleurs converties en hexadécimal. Sont repris les fonds, le texte,
   `primary`, les rayons et la hauteur des contrôles. Les couleurs d'état d'un thème intégré ne sont pas reprises : ce
   sont des fonds clairs (`btn-success`, avec `success-content`), alors que le token est une couleur de texte. Vérifier
   les contrastes (`tokens.md`).
3. Passer le greffon en `themes: false` et supprimer l'ancien thème. `theme.css` pointe désormais daisyUI sur les
   tokens.
4. `retoken.mjs <app>` réécrit les couleurs de daisyUI avec les tokens : `bg-base-100` → `bg-surface`,
   `text-base-content` → `text-ink`, `rounded-box` → `rounded-card`. Puis `eslint --fix` remet l'ordre des classes.
5. Mode sombre :
   - Un thème sombre de daisyUI (`prefersdark`, ou `dark` intégré) donne ses valeurs au bloc `.dark` de `theme.css`.
     La classe `dark` se pose sur `<html>`, et Storybook la bascule.
   - Un projet qui change de thème par `data-theme` garde cet attribut : le bloc s'écrit
     `[data-theme='dark'] { … }` et la variante `@custom-variant dark (&:is([data-theme='dark'] *));`.
6. Les règles qui visaient les classes de daisyUI passent dans sa sous-couche de base (section suivante).

## Passer des classes du projet à daisyUI

Un design system à classes du projet (`btn`, `badge`, `card`, `toggle`…) reprend souvent des noms de daisyUI. Dès que
le greffon est déclaré, les deux styles se mêlent sur chaque classe homonyme.

1. Installer daisyUI, puis `scaffold.mjs <app> --mode migrate --classes daisyui` : le greffon s'ajoute à la feuille
   d'entrée. Un `theme.css` existant est gardé : y reporter le thème daisyUI du gabarit, retirer `--border` de
   `:root` et écrire `--color-border: var(--color-line)` dans `@theme inline` (`daisyui-border`).
2. `audit.mjs <app> --rule daisyui-layer --limit 0` liste chaque règle du projet sur un nom de daisyUI. Trois cas :
   - **même composant** (`btn`, `badge`, `card`, `alert`, `checkbox`) : le composant passe sur les classes de daisyUI
     (modèle `templates/ui/button-daisyui/`), et sa feuille ne garde que les écarts du projet, dans la sous-couche de
     base ;
   - **autre composant sous le même nom** : la classe du projet est renommée. Le `Toggle` de shadcn est un bouton
     bascule, le `toggle` de daisyUI un interrupteur : sous `toggle`, le bouton prend la couleur et l'opacité de
     l'interrupteur, et son contraste tombe sous 4,5:1 ;
   - **règle d'un autre composant sur une classe de daisyUI** (`.prompt-tools .btn[aria-pressed='true']`) : elle passe
     dans la sous-couche de base. Elle l'emporte encore sur `btn-ghost`, qui ne change que `--btn-bg`.
3. Les variantes changent de nom : `btn-danger` devient `btn-error`, `btn-icon` devient `btn-square`. Les chercher dans
   le JSX et dans les pages de documentation (`doc-unknown-name`).
4. Un lot par famille, histoires comprises. Tant qu'une famille n'est pas réécrite, ses classes mêlent les deux styles :
   le contrôle d'accessibilité attrape les contrastes, pas la forme. Comparer les histoires à l'œil, avant et après.
5. `eslint --fix` remet l'ordre des classes : celles de daisyUI se rangent parmi les utilitaires.

## La cascade : où écrire une règle

daisyUI range ses classes dans la couche `utilities` de Tailwind. La règle de base de chaque classe est dans la
sous-couche `daisyui.l1.l2.l3`, et ses modificateurs (`btn-sm`, `btn-primary`, `btn-circle`) dans des sous-couches
au-dessus. Les utilitaires du JSX, hors de toute sous-couche, l'emportent sur tout daisyUI : `btn px-6` marche.

| Règle du projet sur `.btn` | Effet (vérifié sur daisyUI 5.7) |
|---|---|
| `@layer components { .btn { … } }` | Ne s'applique jamais : daisyUI l'emporte |
| `.btn { … }` hors couche | Écrase tout, utilitaires du JSX compris |
| `@utility btn { … }`, proposé par la documentation de daisyUI | Écrase les modificateurs (`btn-circle` perd son rayon). Selon l'ordre de Tailwind (nombre de propriétés, puis nom), il écrase aussi le JSX : `btn font-bold` reste en medium |
| `@layer utilities { @layer daisyui.l1.l2.l3 { .btn { … } } }` | Change la base ; les modificateurs et le JSX l'emportent encore |

- Un réglage global passe d'abord par les variables du thème (`--radius-field`, `--size-field`, `--border`,
  `--depth`), puis par la feuille du composant, dans la sous-couche de base (`templates/ui/button-daisyui/button.css`).
- Une classe du projet posée avec une classe de daisyUI sur le même élément va dans la même sous-couche.
- Une classe du projet seule reste dans `@layer components`. Elle peut composer des classes de daisyUI
  (`.price-badge { @apply badge badge-soft; }`) : leurs règles suivent la classe dans `components`.
- Le nom de la sous-couche est interne à daisyUI. L'audit le lit dans la version installée, et signale une règle qui
  vise une classe de daisyUI ailleurs que dans cette sous-couche (`daisyui-layer`). Après une montée de version,
  relancer l'audit.

## Composants

Le modèle est `templates/ui/button-daisyui/`. Ses variantes CVA posent les classes de daisyUI : `destructive` rend
`btn-error`, `icon` rend `btn-square`. Il garde l'API de shadcn (`variant`, `size`, `asChild`). Sa feuille ne garde que
les réglages de base. Un composant de daisyUI tient en trois choix :

| Classes de daisyUI | Comportement | État lu par daisyUI |
|---|---|---|
| `btn`, `badge`, `card`, `alert`, `kbd`, `divider`, `skeleton`, `loading`, `avatar`, `breadcrumbs`, `table`, `stat`, `steps`, `progress`, `link` | Aucun : un composant qui pose les classes | `aria-pressed`, `aria-current`, `aria-disabled` (`btn`) |
| `input`, `textarea`, `select`, `checkbox`, `radio`, `toggle`, `range`, `file-input`, `fieldset` | Contrôle natif dans le `Field` du projet (`components.md`) | `:checked`, `:disabled`, `aria-checked`, `aria-invalid` (`validator`) |
| `tabs`, `tab` | Tabs de Radix ou de Base UI (rôles, clavier) | `aria-selected` : pas de `tab-active` |
| `modal`, `modal-box`, `modal-action` | `<dialog>` natif et `showModal()` (piège du focus, Échap, page inerte) | `[open]` |
| `menu`, `dropdown` | DropdownMenu de Radix ou Menu de Base UI pour le clavier ; `ul.menu` > `li` > élément focalisable, par `asChild` | `aria-current` : pas de `menu-active` |
| `collapse` | `<details>` et `<summary>`, ou Accordion de Radix | `[open]` |
| `tooltip` | Infobulle d'appoint en CSS : le texte de `data-tip` n'est pas annoncé, le bouton garde son `aria-label`. Une infobulle qui porte une information passe par Tooltip de Radix ou de Base UI | Survol et focus |
| `drawer` | Mise en page d'une barre latérale (case à cocher). Un panneau modal est un `<dialog>` ou le Dialog de Radix | — |
| `toast` | Placement seulement ; les messages sont des `alert`, et leur comportement vient du projet | — |

- Un composant que daisyUI n'a pas (combobox, palette de commandes, sélecteur de date) s'ajoute par la CLI de shadcn,
  puis se range avec `rehome.mjs`. daisyUI met en forme `react-day-picker`, la bibliothèque du Calendar de shadcn.
- `rehome.mjs` refuse d'écrire une classe qui reprend un nom de daisyUI (`card`, `card-title`) : dans
  `@layer components`, elle perdrait contre daisyUI, et les deux styles se mêleraient. Quand daisyUI a l'équivalent
  (`dialog` → `modal`, `tabs` → `tabs`), il le signale. `--class <préfixe>` garde le dessin de shadcn sous des classes
  du projet. Les classes de daisyUI d'un composant promu restent dans son JSX.
- Une histoire par variante et par état, comme pour les autres composants (`storybook.md`). daisyUI anime les
  couleurs des boutons (0,2 s) : un test qui lit une couleur après avoir changé de thème attend la fin de la
  transition.

## Lint

Le fragment ESLint marche sans changement. Les classes de daisyUI sont des utilitaires de Tailwind :
`better-tailwindcss` les connaît, signale une classe inventée (`btn-blue`) et ne voit pas de conflit dans
`btn btn-primary btn-sm`. L'ordre canonique range parfois un modificateur après les utilitaires
(`card bg-base-100 card-border`) : `eslint --fix` le remet.

## Mise à jour de daisyUI

Sur une branche, lancer l'audit (`daisyui-layer` vérifie la sous-couche de base, `daisyui-theme-missing` une nouvelle
variable de thème), le build de Storybook et les histoires. Noter ensuite la version dans la mémoire.

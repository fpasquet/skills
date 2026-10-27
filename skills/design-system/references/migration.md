# Migrer un design system existant

Une migration se fait **par lots**. Chaque lot compile, passe le lint et garde les histoires vertes. Il fait un commit, que la personne peut relire. Pendant la migration, le fragment ESLint est en `level: 'warn'` : le code non migré reste lisible dans le rapport sans bloquer la CI. Il repasse en `error` quand l'audit n'a plus d'erreur.

## Inventaire et plan

1. `audit.mjs <app> --json > /tmp/audit.json` : compteurs par règle et emplacements. Noter les compteurs dans la mémoire (« Dernier audit »).
2. Repérer les sources à migrer (sections ci-dessous) : un même projet en mélange souvent plusieurs.
3. Écrire le plan dans la mémoire, section « Migration », avec un lot par ligne :
   - **socle** : `scaffold.mjs`, Tailwind v4 si besoin, tokens, thème, Storybook ;
   - **composants d'interface** : un lot par famille (boutons et badges ; champs et formulaires ; calques : fenêtres, menus, panneaux) ;
   - **blocs partagés et mises en page** ;
   - **une fonctionnalité à la fois** ;
   - **fin** : lint en `error`, `audit --strict` en CI si souhaité.
4. Faire valider le plan et l'ordre par la personne avant le premier lot.

Pour chaque lot : réécrire, puis lancer `eslint <dossiers du lot>`, `audit.mjs <app> --rule <règles visées>`, les histoires touchées et la vérification de types. Mettre ensuite à jour la mémoire (lot terminé, compteurs) et faire un commit, par exemple `refactor(ui): buttons and badges on semantic classes`.

## Depuis shadcn/ui d'origine

C'est le cas le plus fréquent : les composants viennent de la CLI, à plat, avec leurs utilitaires et leurs `data-slot`.

- **Composant non modifié depuis la CLI** :
  1. le déplacer à plat, s'il est déjà dans un dossier ;
  2. le traiter avec `rehome.mjs`, puis le relire (`components.md`).
- **Composant modifié à la main** : `rehome.mjs` le range de la même façon, mais le compte rendu demande une relecture plus attentive. Avec `--keep-classes`, il range seulement, et la réécriture des classes se fait à la main.
- **Sélecteurs sur `data-slot`** ailleurs dans le code (`[data-slot=card-header]`, `*:data-[slot=…]`) : ils deviennent des sélecteurs de classe (`.card-header`). L'audit les liste (`data-attribute`, `data-selector`).
- **Code qui cible les `data-slot` retirés** (`[[data-slot=card-content]_&]:`, `*:data-[slot=…]`) dans un autre composant ou une application : `rehome.mjs` le liste à la fin de son compte rendu. Il passe à la classe (`[.card-content_&]:`), en attendant la migration de ce composant.
- **Tests qui ciblent `data-slot`** ou une classe d'implémentation (`toHaveClass('animate-spin')`) : ils passent aux rôles et libellés accessibles (`getByRole('dialog', { name })`), sinon à la classe sémantique (`toHaveClass('spinner')`).
- **Variables CSS de shadcn** (`--background`, `--primary`…) définies en dur dans la feuille d'entrée (`:root`, `.dark`, `@theme inline`) : leurs valeurs deviennent les tokens, avec les noms du vocabulaire (`--background` → `canvas`, `--card` → `surface`, `--muted` → `surface-alt`, `--muted-foreground` → `muted`, `--border` → `line`, `--input` → `line-strong`). Les variables de shadcn vont dans `theme.css` et pointent sur ces tokens, sans que le rendu change. `scaffold.mjs` pose alors un `tokens.css` séparé : la feuille d'entrée ne garde que ses `@import` et sa couche `base`.
- **`bg-muted` de shadcn** : c'est un fond, alors que `muted` est la couleur du texte dans les tokens. Dans le même commit que les tokens, renommer les fonds dans tout le code qui importe le thème, applications comprises, puis vérifier avec l'audit (`muted-background`) :

  ```sh
  perl -pi -e 's/\b(bg|fill|border|from|via|to|ring|outline|divide|stroke)-muted(?![-\w])/$1-surface-alt/g' $(grep -rlP '\b(bg|fill|border)-muted(?![-\w])' src)
  ```

- **`accent` de shadcn** : il sert au survol des menus. Le pointer sur le token qui a ce rôle dans la maquette (`primary-soft` ou `surface-alt`).
- **Rayons et ombres** : garder l'échelle de shadcn (`--radius-md: calc(var(--radius) - 2px)`) et ramener les ombres de Tailwind aux deux reliefs des tokens (`--shadow-sm: var(--shadow-card)`, `--shadow-lg: var(--shadow-overlay)`), pour que les composants pas encore migrés gardent leur rendu.
- **Composants inutilisés** : avant le premier lot, lister les exports que rien n'importe, même indirectement, et proposer de les retirer avec leurs dépendances. Moins de composants, c'est moins de lots.

## Depuis Tailwind v3

1. Mettre à jour Tailwind : `npx @tailwindcss/upgrade` sur une branche propre, puis relire le diff. Il convertit la configuration, les directives et les classes renommées.
2. La feuille d'entrée passe de `@tailwind base; @tailwind components; @tailwind utilities;` à `@import 'tailwindcss';`, puis aux imports du socle (`setup.md`).
3. `tailwind.config.js` → `theme.extend.colors` et le reste deviennent les tokens (`@theme`) avec les noms du vocabulaire (`tokens.md`), pas une recopie des anciens noms. Les plugins passent par `@plugin`, et `content` par la détection automatique, plus `@source` au besoin.
4. Les composants déclarés par `@layer components` avec `@apply` gardent leur forme. Ils se rangent à côté de leur composant.
5. Les classes dépréciées ou renommées (`shadow-sm` → `shadow-xs`, `ring` → `ring-3`, `outline-none` → `outline-hidden`, `flex-shrink-0` → `shrink-0`…) : le lint les signale (`no-deprecated-classes`, `enforce-canonical-classes`).

## Depuis CSS Modules, Sass ou styled-components

- Les **valeurs** (variables Sass, thème de styled-components, propriétés personnalisées) deviennent des tokens.
- Les **règles d'un composant** :
  - une règle qui décrit le composant devient sa classe sémantique, dans sa feuille ;
  - une règle de placement devient des utilitaires dans le JSX ;
  - les états passent aux attributs ARIA et aux pseudo-classes.
- Les **variantes** (props de styled-components, classes conditionnelles) deviennent des variantes CVA qui posent des classes de modificateur.
- Supprimer le module CSS, ou le `styled`, dans le même lot que sa réécriture, et retirer la dépendance au dernier lot.

## Depuis une bibliothèque de composants (MUI, Chakra, Mantine, Bootstrap, Ant Design)

- Remplacer composant par composant avec l'équivalent de shadcn/ui sur Radix, ajouté par la CLI puis rangé avec `rehome.mjs`. Une table de correspondance dans la mémoire suit l'avancement (`Dialog` → `Dialog`, `TextField` → `Field` + `Input`, `Snackbar` → `Toast`…).
- Le thème de la bibliothèque (palette, typographie, rayons) devient les tokens.
- Les props de style (`sx`, `css`, `variant="contained"`) deviennent des variantes CVA ou des utilitaires de placement.
- Garder l'accessibilité acquise : Radix fournit les rôles, le focus et le clavier. Les histoires et axe vérifient le résultat.
- Les deux bibliothèques cohabitent pendant la migration. Un lot ne mélange pas les deux dans un même composant.

## Depuis des styles en ligne et des valeurs en dur

C'est le mode « créer à partir de l'existant » : tokens tirés du code (`tokens.md`), puis classes et composants tirés des listes répétées (`components.md`), lot par fonctionnalité.

## Fin de migration

- `audit.mjs <app>` : plus aucune erreur. Les avertissements restants sont décidés un par un, et une exception acceptée se note dans la mémoire avec sa raison.
- Le fragment ESLint passe en `level: 'error'`.
- On peut ajouter `audit.mjs <app> --strict` en CI.
- Retirer les dépendances devenues inutiles (ancienne bibliothèque, `tailwind.config.js`, Sass).
- La mémoire passe en mode « maintenir ».

# Journal des versions

## 1.0.0 · 27/10/2026

- Première version, tirée du design system d'un projet Next.js : tokens en source unique, thème shadcn/ui pointé sur les tokens, classes sémantiques posées par les variantes CVA, un dossier par composant, pas d'attribut `data-slot`, Storybook documenté avec accessibilité bloquante, lint des classes Tailwind.
- Trois modes : créer à partir de l'existant, maintenir, migrer (shadcn/ui d'origine, Tailwind v3, CSS Modules, Sass, styled-components, bibliothèques de composants).
- **`audit.mjs`** : état des lieux en lecture seule, compteurs par règle, `--json` et `--strict`.
- **`scaffold.mjs`** : pose le socle sans rien écraser (tokens, thème, classes, Storybook, vitest, ESLint, conventions, mémoire) et affiche les dépendances à installer.
- **`rehome.mjs`** : range un composant ajouté par la CLI de shadcn (un fichier par sous-composant, `index.ts`), retire les `data-*`, remplace les utilitaires par des classes sémantiques et écrit un premier jet de sa feuille.
- Éprouvée aussi sur un monorepo dont les composants vivent dans un paquet partagé, que plusieurs applications consomment :
  - les alias au nom du paquet et les `@import` de paquet sont repérés ;
  - `rehome.mjs` met à jour les `exports` du paquet et signale le code qui ciblait les `data-slot` retirés ;
  - `scaffold.mjs` sait poser les tokens d'un thème shadcn écrit dans la feuille d'entrée, et suit le catalogue pnpm ;
  - l'audit signale `bg-muted` (`muted-background`) ;
  - Storybook rend le JSX même sous `"jsx": "preserve"`, et ses histoires passent dès le premier lancement en CI ;
  - `scaffold.mjs` propose une cible `make storybook` quand le dépôt a un `Makefile` ;
  - `rehome.mjs` lit toutes les chaînes d'un `cn(…)`, garde les marqueurs `group` et `peer` dans le JSX et traduit
    `group-*`, `peer-*`, les propriétés arbitraires, `translate-*`, marges et rayons arbitraires, `calc()` imbriqués ;
    il signale la classe d'une partie visée par la feuille mais posée nulle part ;
  - l'audit accepte les attributs que Radix pose sans équivalent ARIA (`data-side`, `data-placeholder`) et ne compte
    comme classe définie que le sujet d'un sélecteur ;
  - `rehome.mjs` traite les `className={`…`}` et écrit les déclarations avant l'`@apply`, pour qu'un variant
    (`sm:max-w-lg`) les remplace ;
  - gabarit `classes/overlay.css` (`overlay`, `popup`) et token `overlay`, communs aux calques de Radix ;
  - le `viteFinal` du gabarit filtre les avertissements « use client » au build de Storybook ;
  - `rehome.mjs` réécrit les couleurs, ombres et rayons de shadcn avec les tokens, d'après la correspondance de
    `theme.css` ; il ne prend plus les constantes en majuscules pour des composants, réexporte les types avec
    `type` et ignore le contenu des chaînes pour garder un import ;
  - `rehome.mjs` traduit aussi `in-*`, `has-data-[…]`, les ancêtres arbitraires (`[[data-side=left]_&]`), les
    pixels vers l'échelle (`w-[2px]` → `w-0.5`), cible par sa classe la variante qu'un parent posait en `data-variant`
    et fusionne deux conditions sur le même pair ;
  - `rehome.mjs` range un sous-dossier de registre (imports relatifs réécrits d'un niveau), transforme les classes
    conditionnelles de `cn(…)` (`variant === 'grid' && […]`, `isListening && '…'`) en classes de modificateur, laisse
    dans le JSX les marqueurs que le lint du projet déclare (`toaster`, `not-prose`), exporte toujours les types et
    garde `X.displayName` avec son composant.

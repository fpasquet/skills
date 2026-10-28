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
    garde `X.displayName` avec son composant ;
  - `retoken.mjs` : réécrit les classes de shadcn d'une application avec les tokens, sans toucher aux noms qui sont
    aussi des tokens (`muted`) ;
  - `rehome.mjs --keep-classes` découpe un fichier d'application à plusieurs composants (sur place s'il est déjà
    dans son dossier, `index.ts` limité à l'API d'origine), nomme les parties d'après leur rôle (`h4` → `-title`)
    et signale celles qui restent nommées d'après leur balise ;
  - l'audit accepte `--allow-data` pour l'attribut d'une bibliothèque sans classe stable ; le fragment ESLint lint
    les constantes de classes ; variante `can-hover:` dans le thème.
  - promotion de composants de l'application dans le design system : `rehome.mjs` laisse dans le JSX les classes
    que les feuilles du projet définissent déjà (`field-trigger`), ne pose la classe racine que sur le `cn(…)` qui
    transmet `className`, traite `disabled && …` et signale les ternaires de classes.
  - formulaires sur le `Field` de shadcn, avec un contexte qui relie libellé, aide et erreur au contrôle
    (`references/components.md`) ; l'audit vérifie que le tsconfig résout les alias de `components.json`
    (`shadcn-alias`) ; `rehome.mjs` ajoute l'entrée `exports` d'un nouveau composant, vise par sa classe la partie
    d'un groupe nommé (`group/field`), traduit `[&>[data-slot=…]]` et `has-data-[…]`, réécrit `bg-muted` en
    fond du thème, et signale les `data-*` restés dans le JSX et les dépendances que la CLI a réécrites à plat.
  - Storybook : histoires de `UI` par catégorie en anglais (`UI/Forms/Field`), ordre dans le `storySort` du gabarit ;
    bouton icône à la hauteur des contrôles quand `h-control` diffère de celle de shadcn.
  - audit de la documentation : classes et tokens cités en exemple qui n'existent pas (`doc-unknown-name`), texte du
    gabarit laissé à compléter (`doc-placeholder`) ; gabarit des conventions sans chemin du skill à la place d'une
    commande, avec des exemples que le skill produit lui-même (`overlay.css`, `input`, `field-error`).
- Éprouvée aussi sur un blog Vite rendu côté serveur, au design system maison (Atomic design, tokens nommés d'après la
  palette, échelles nommées, Storybook 7), sur Base UI :
  - **échelles restreintes** : les noms de Tailwind (`p-4`, `text-sm`), chaque famille remise à zéro dans les tokens
    puis seuls les pas retenus redéclarés ; pas d'échelle nommée (`p-m`) ni de token qui change selon l'écran
    (`references/tokens.md`) ; la page Tokens liste chaque échelle avec sa classe, un aperçu, sa valeur en rem et en
    pixels ; l'audit signale les pas hors de l'échelle (`off-scale`), les tokens redéfinis à un point de rupture
    (`responsive-token`) et les échelles non restreintes (`unrestricted-scale`) ; `rehome.mjs` met en TODO les
    classes de shadcn qui en sortent ;
  - **Base UI** : style `base-*` de `components.json` repéré, gabarits (conventions, pages, calques) écrits avec
    `render`, `data-open` et `data-closed` ; `rehome.mjs` traduit les variantes de `shadcn/tailwind.css`
    (`data-open:`, `data-horizontal:`, `data-checked:`) et réimporte `cn` depuis la fonction du projet ;
  - **`cn`** : tailwind-merge prenait une taille de texte des tokens pour une couleur (`cn('text-compact',
    'text-ink')` supprimait la taille) ; `references/setup.md` donne la configuration, l'audit la vérifie
    (`merge-config`) ;
  - repérage d'une feuille d'entrée hors des emplacements habituels (`src/styles.css` qui importe la feuille de
    Tailwind) et de tokens rangés dans `theme.css` ; `scaffold.mjs` voit les `@import` d'une feuille importée, ne
    double plus l'import du thème et propose `@base-ui/react` plutôt que `radix-ui` ;
  - l'audit signale une couleur en dur dans une variable locale d'un composant, ignore les noms de paquets cités par
    la documentation, lit le titre d'une histoire dans son meta (pas la prop `title` d'un composant), compte les
    histoires dont l'accessibilité ne bloque pas (`a11y-todo`) et ne demande pas de documenter les classes du HTML
    externe ;
  - migration : accessibilité en `todo` histoire par histoire, jamais globale (vitest n'affiche rien) ; montée de
    Storybook 7, vitest 1 et Vite 5 (`references/migration.md`) ; fragment ESLint avec `externalClasses`, sans lint
    des classes dans les tests ; `rehome.mjs` importe les feuilles dans l'ordre alphabétique ; `--spacing` redéclaré
    hors de `@theme` pour les animations de `tw-animate-css`.
  - recette du blog lancé : les composants actuels de shadcn reçoivent la `ref` en prop (React 19) et la perdent en
    React 18 (règle `react18-ref`, `forwardRef` documenté) ; points de rupture écrits en dur dans les feuilles
    (`breakpoint-literal`) ; donnée exportée par un fichier d'histoires et affichée comme une histoire
    (`story-export`) ; paramètres de Storybook 7 ignorés par la version 10 (`defaultViewport`) ;
  - page Tokens : tokens en `@theme static` (sinon un pas inutilisé s'affiche vide), aperçu de texte borné, colonne
    Sombre seulement avec un mode sombre ; classes génériques importées avant les feuilles des composants ;
  - l'audit ignore les fichiers que le lint ignore (icônes générées), connaît les utilitaires `@utility`, ne demande pas
    les classes des blocs partagés sur la page Classes et trouve `cn` sans `components.json` ; le fragment ESLint lint
    aussi les constantes de classes en camelCase (`menuClassName`) ; `rehome.mjs --keep-classes` range dans son propre
    fichier une table qui cite plusieurs composants (`mdxComponents`), au lieu d'un import circulaire.

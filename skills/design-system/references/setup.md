# Mise en place du socle

`scaffold.mjs` écrit les fichiers et garde ceux qui existent déjà. Cette fiche dit comment brancher ce qu'il ne peut pas brancher seul, et comment comparer un socle existant aux gabarits.

## Dépendances

Les versions de `templates/versions.json` ont été testées ensemble. Le script affiche la commande d'installation pour celles qui manquent, avec le gestionnaire du dépôt (`pnpm`, `yarn`, `bun` ou `npm`). Toujours épingler la version exacte (`-E`).

Une version plus récente s'adopte sur une branche : build de Storybook, histoires et lint au vert, puis noter la version dans la mémoire.

| Rôle | Paquets |
|---|---|
| Composants | `radix-ui` (paquet unique) ou `@base-ui/react` (style `base-*` de `components.json`), `class-variance-authority`, `cn` (paquet officiel de shadcn), `lucide-react` |
| Styles | `tailwindcss`, `tw-animate-css` (animations des composants Radix) ; Next.js : `@tailwindcss/postcss` ; Vite : `@tailwindcss/vite` |
| Storybook | `storybook`, `@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-themes`, `@storybook/addon-vitest` ; Next.js : `@storybook/nextjs-vite` ; Vite : `@storybook/react-vite` |
| Histoires dans le navigateur | `vitest`, `@vitest/browser`, `@vitest/browser-playwright`, `playwright` (ou `@playwright/test`) |
| Lint | `eslint-plugin-better-tailwindcss` |

- **Catalogue pnpm** (`catalog:` dans les `package.json`) : le script liste les versions à ajouter au catalogue de `pnpm-workspace.yaml` au lieu d'une commande `pnpm add`.
- **Version plus ancienne dans le dépôt** : le script la signale. `@storybook/addon-vitest` demande vitest 4 ou plus. Si le reste du dépôt est en vitest 3, les paquets de Storybook prennent leur propre version dans un catalogue nommé, réservé au paquet du design system (`catalogs: { storybook: { vitest: … } }`, puis `"vitest": "catalog:storybook"`).
- Déjà fournis sous une autre forme, donc pas redemandés : `radix-ui` par les paquets `@radix-ui/react-*`, `cn` par la fonction de `aliases.utils`, `@tailwindcss/vite` par une configuration PostCSS, que Vite lit aussi.

La CLI de shadcn se lance à sa version épinglée (`npx shadcn@<version> add …`, version dans `versions.json` → `cli`), notée dans la mémoire.

## Feuille d'entrée

Ordre des imports : Tailwind, animations, tokens, thème, classes. Le script ajoute ceux qui manquent après le dernier `@import` :

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '../styles/tokens.css';        /* ou ../../../../specs/ui/tokens.css */
@import '../styles/theme.css';
@import '../styles/components.css';
```

- **Next.js** : les polices viennent de `next/font`. Les familles des tokens pointent sur ses variables dans un `@theme inline` de la feuille d'entrée (`--font-sans: var(--font-inter), ui-sans-serif, …`), et `body` reçoit `@apply bg-canvas font-sans text-ink antialiased`.
- **Vite** : polices par `@fontsource/*` ou Google Fonts dans `index.html`.
- `@source '../../node_modules/<paquet>/dist/*.js'` pour une bibliothèque qui pose des classes Tailwind elle-même (rendu Markdown…).
- Une entrée Tailwind v3 (`@tailwind base;`) se migre d'abord (`migration.md`) : le script ne la touche pas.

## `cn` et tailwind-merge

`cn` fusionne les classes avec tailwind-merge, qui ne connaît que les noms de Tailwind. Une taille de texte des tokens
(`text-compact`) est prise pour une couleur : `cn('text-compact', 'text-ink')` supprime la taille. Une dimension nommée
(`h-control`) n'entre en conflit avec rien : `cn('h-control', className)` garde les deux hauteurs, et la feuille décide.
La fonction de `aliases.utils` déclare donc les noms des tokens, et les utilitaires de texte (`@utility body-s`) :

```ts
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ['compact'], spacing: ['control', 'row'] },
    classGroups: { 'font-size': ['body-s', 'body-m'] },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

Les noms de Tailwind restreints (`text-sm`, `p-4`) n'ont rien à déclarer. L'audit vérifie la liste (`merge-config`). Le
paquet `cn` de shadcn, que les styles récents de la CLI ajoutent et importent (`import { cn } from "cn"`), n'a pas
cette configuration : `rehome.mjs` réécrit l'import vers la fonction du projet, et le paquet se retire.

## Design system dans un paquet du monorepo

Les composants vivent parfois dans un paquet partagé (`packages/ui`), que les applications importent par son nom (`@acme/ui/components/button`, `@import '@acme/ui/global.css'`). `<app>` est alors **ce paquet** :

- `components.json` y déclare des alias au nom du paquet. Les scripts retrouvent les dossiers par le champ `exports` du `package.json`.
- `audit.mjs` lancé sur une application qui consomme le paquet suit l'`@import` du paquet pour trouver les tokens, et dit où lancer l'audit des composants (ligne `package`).
- La CLI de shadcn résout les alias de `components.json` par les chemins du `tsconfig.json` du paquet. Il faut donc un chemin préfixe, `"@acme/ui/*": ["./src/*"]` : `"@acme/ui/components/*"` ne résout pas `@acme/ui/components`, et la CLI s'arrête sur « Could not resolve the following aliases ». L'audit le vérifie (`shadcn-alias`).
- `rehome.mjs` réécrit l'entrée `exports` du composant (`./src/components/button.tsx` → `./src/components/button/index.ts`), ou l'ajoute pour un nouveau composant, sur le modèle des autres : les imports des applications ne changent pas.
- Storybook et ses histoires vivent dans le paquet, avec `@storybook/react-vite` quand `next` n'y est qu'une dépendance de pair.
- Les polices viennent de chaque application (`next/font` dans l'une, Google Fonts dans l'autre). Les tokens les nomment avec une valeur de repli, `--font-sans: var(--font-inter, "Inter"), ui-sans-serif, …`, pour qu'une application sans la variable garde la bonne famille.
- Les changements du thème touchent toutes les applications : leurs tests et leur lint se lancent avec ceux du paquet.

## `components.json`

- `aliases.ui` est le dossier des composants (par exemple `@/shared/ui`), et `aliases.components` celui des blocs partagés.
- `tailwind.css` pointe sur la feuille d'entrée, avec `cssVariables: true`.
- Si le paquet `cn` est installé, `rehome.mjs` réécrit l'import de `cn` vers lui.
- Un registre de plus (AI Elements…) se déclare dans `registries`.

## Storybook

`scaffold.mjs` écrit `.storybook/main.ts` et `preview.tsx` s'ils n'existent pas. Sinon, comparer avec `templates/storybook/` :

- `tags: ['autodocs']` une fois, dans `preview.tsx` ;
- `a11y: { test: 'error' }` : une violation fait échouer l'histoire ;
- `storySort` dans l'ordre des sections : `Design system`, `UI` (par catégories), `Shared`, `Layouts`, `Features`, `Pages` ;
- `withThemeByClassName({ themes: { Clair: '', Sombre: 'dark' } })` si le mode sombre existe ;
- la feuille d'entrée importée en tête de `preview.tsx`.

À ajouter à la main :

- **Polices** : `.storybook/preview-head.html` charge les familles des tokens (Google Fonts), et redéfinit les variables de `next/font` si la feuille d'entrée en dépend :

  ```html
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
  <style>:root { --font-inter: 'Inter'; }</style>
  ```

- **Messages** : un décorateur enveloppe l'histoire dans le fournisseur du projet. Avec next-intl, c'est `<NextIntlClientProvider locale timeZone formats messages>`, avec tous les messages assemblés comme dans l'application.
- **`viteFinal` du gabarit** : JSX en mode automatique, même quand `tsconfig.json` est en `"jsx": "preserve"` (Next.js, paquet partagé qui en hérite). Sans cela : « React is not defined ». Il pré-optimise aussi le runtime JSX. Sinon, Vite le découvre pendant le premier lancement des histoires, recharge la page, et les tests échouent à chaque cache vide, donc toujours en CI.
- **Avertissements « use client »** des composants Radix et de shadcn au build : le `viteFinal` du gabarit les filtre (`MODULE_LEVEL_DIRECTIVE`, `SOURCEMAP_ERROR`).
- **TypeScript** : Storybook 10 ne se résout qu'en `"moduleResolution": "bundler"` (ou `node16`), et les pages de
  documentation s'écrivent en JSX automatique (`"jsx": "react-jsx"`) : un `tsconfig.json` en `"moduleResolution": "node"`
  ou `"jsx": "react"` se met à jour.
- Les histoires importent le type `Meta` du framework (`@storybook/nextjs-vite` ou `@storybook/react-vite`). Le modèle `templates/ui/button/button.stories.tsx` importe `@storybook/react-vite` : à adapter.

Un dépôt piloté par un `Makefile` reçoit aussi une cible `storybook`, avec sa ligne dans l'aide (`make storybook`, `pnpm --filter=<paquet> storybook` dans un monorepo). `scaffold.mjs` la propose.

Scripts du `package.json` :

```json
"storybook": "storybook dev -p 6006 --no-open",
"build-storybook": "storybook build -o storybook-static --quiet",
"test:stories": "vitest run --project stories"
```

## Vitest : les histoires dans Chromium

`templates/storybook/vitest.config.ts` déclare deux projets, `unit` et `stories`. Le second rend chaque histoire dans Chromium (Playwright) et fait son contrôle axe. Un `vitest.config.*` existant reçoit le projet `stories` à la main (`storybookTest({ configDir })`, `browser.provider: playwright()`).

La première fois, installer le navigateur : `npx playwright install chromium`, et en CI avec `--with-deps`.

## ESLint

`scaffold.mjs` écrit `eslint.design-system.mjs`, sauf si la configuration de l'application, ou une configuration partagée qu'elle importe, utilise déjà `better-tailwindcss`. Il reste à le brancher dans `eslint.config.mjs` :

```js
import { designSystem } from './eslint.design-system.mjs';

export default [
  // … configuration existante (parseur TypeScript, eslint-config-next…)
  ...designSystem({ entryPoint: 'src/app/globals.css' }), // level: 'warn' pendant une migration
];
```

Le fragment pose trois choses :

- les règles de `better-tailwindcss` : ordre, classes inconnues (classes sémantiques comprises, grâce à `detectComponentClasses`), doublons, conflits, formes dépréciées, valeurs et variantes arbitraires, couleurs de la palette ;
- `no-restricted-syntax` sur `data-slot`, `data-variant` et `data-size` ;
- `react/no-multi-comp`.

Points d'attention :

- **Un parseur TypeScript est nécessaire** pour les `.tsx` (`typescript-eslint`, déjà là avec `eslint-config-next`).
- **`react/no-multi-comp`** demande le greffon `react`, que `eslint-config-next` enregistre déjà. Ailleurs, l'enregistrer, ou passer `oneComponentPerFile: false` si la version d'`eslint-plugin-react` n'accepte pas la version d'ESLint.
- **`eslint-plugin-better-tailwindcss` en version 3** : la règle des classes inconnues s'appelle `no-unregistered-classes`, et `detectComponentClasses` est une option de cette règle, pas un réglage partagé. `enforce-canonical-classes` n'existe pas encore. Adapter le fragment, ou monter le greffon en version 4 sur une branche à part.
- **`no-restricted-syntax`** : une configuration qui le définit déjà est remplacée, pas complétée, par le fragment. Fusionner les deux listes de sélecteurs.
- **Monorepo** : le fragment peut vivre dans le paquet de configurations partagé. `audit.mjs` suit les imports de la configuration pour le trouver.

## Conventions et mémoire

- Le document de conventions va dans `.claude/rules/design-system.md` quand le dépôt a ce dossier. Claude Code le charge alors seul quand un fichier de l'interface est ouvert, grâce aux `paths` de son en-tête. Sinon, il va dans `docs/design-system.md`, relié depuis `AGENTS.md` pour que tout agent le lise avant de toucher l'interface.
- Le document se personnalise avec ce que le projet a de propre : sections du fil rouge, système de messages, rôles des dossiers. On garde les règles, et on adapte les exemples.
- La mémoire (`DESIGN-SYSTEM.md`) se remplit dès la fin de l'étape 1 : emplacements, mode, versions.

## CI

Après le lint et les tests :

```yaml
- run: pnpm --filter <app> build-storybook
- run: pnpm --filter <app> exec playwright install --with-deps chromium
- run: pnpm --filter <app> test:stories   # chaque histoire rendue, accessibilité comprise
```

Une fois la migration finie, on peut ajouter `node <chemin du skill>/scripts/audit.mjs <app> --strict`. Le skill doit alors être installé en CI : `skills-lock.json` et un script d'installation, comme pour les autres skills du catalogue.

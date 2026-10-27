# Mise en place du socle

`scaffold.mjs` écrit les fichiers et garde ceux qui existent déjà. Cette fiche dit comment brancher ce qu'il ne peut pas brancher seul, et comment comparer un socle existant aux gabarits.

## Dépendances

Les versions de `templates/versions.json` ont été testées ensemble. Le script affiche la commande d'installation pour celles qui manquent, avec le gestionnaire du dépôt (`pnpm`, `yarn`, `bun` ou `npm`). Toujours épingler la version exacte (`-E`).

Une version plus récente s'adopte sur une branche : build de Storybook, histoires et lint au vert, puis noter la version dans la mémoire.

| Rôle | Paquets |
|---|---|
| Composants | `radix-ui` (paquet unique), `class-variance-authority`, `cn` (paquet officiel de shadcn), `lucide-react` |
| Styles | `tailwindcss`, `tw-animate-css` (animations des composants Radix) ; Next.js : `@tailwindcss/postcss` ; Vite : `@tailwindcss/vite` |
| Storybook | `storybook`, `@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-themes`, `@storybook/addon-vitest` ; Next.js : `@storybook/nextjs-vite` ; Vite : `@storybook/react-vite` |
| Histoires dans le navigateur | `vitest`, `@vitest/browser`, `@vitest/browser-playwright`, `playwright` (ou `@playwright/test`) |
| Lint | `eslint-plugin-better-tailwindcss` |

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

## `components.json`

- `aliases.ui` est le dossier des composants (par exemple `@/shared/ui`), et `aliases.components` celui des blocs partagés.
- `tailwind.css` pointe sur la feuille d'entrée, avec `cssVariables: true`.
- Si le paquet `cn` est installé, `rehome.mjs` réécrit l'import de `cn` vers lui.
- Un registre de plus (AI Elements…) se déclare dans `registries`.

## Storybook

`scaffold.mjs` écrit `.storybook/main.ts` et `preview.tsx` s'ils n'existent pas. Sinon, comparer avec `templates/storybook/` :

- `tags: ['autodocs']` une fois, dans `preview.tsx` ;
- `a11y: { test: 'error' }` : une violation fait échouer l'histoire ;
- `storySort` dans l'ordre des sections : `Design system`, `UI`, `Shared`, `Layouts`, `Features`, `Pages` ;
- `withThemeByClassName({ themes: { Clair: '', Sombre: 'dark' } })` si le mode sombre existe ;
- la feuille d'entrée importée en tête de `preview.tsx`.

À ajouter à la main :

- **Polices** : `.storybook/preview-head.html` charge les familles des tokens (Google Fonts), et redéfinit les variables de `next/font` si la feuille d'entrée en dépend :

  ```html
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
  <style>:root { --font-inter: 'Inter'; }</style>
  ```

- **Messages** : un décorateur enveloppe l'histoire dans le fournisseur du projet. Avec next-intl, c'est `<NextIntlClientProvider locale timeZone formats messages>`, avec tous les messages assemblés comme dans l'application.
- **Avertissement « use client »** des paquets Radix dans le build Vite de Storybook : à filtrer dans `viteFinal` (`rolldownOptions.onLog`, code `MODULE_LEVEL_DIRECTIVE`).
- Les histoires importent le type `Meta` du framework (`@storybook/nextjs-vite` ou `@storybook/react-vite`). Le modèle `templates/ui/button/button.stories.tsx` importe `@storybook/react-vite` : à adapter.

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

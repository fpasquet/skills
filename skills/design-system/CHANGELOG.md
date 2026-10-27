# Journal des versions

## 1.0.0 · 27/10/2026

- Première version, tirée du design system d'un projet Next.js : tokens en source unique, thème shadcn/ui pointé sur les tokens, classes sémantiques posées par les variantes CVA, un dossier par composant, pas d'attribut `data-slot`, Storybook documenté avec accessibilité bloquante, lint des classes Tailwind.
- Trois modes : créer à partir de l'existant, maintenir, migrer (shadcn/ui d'origine, Tailwind v3, CSS Modules, Sass, styled-components, bibliothèques de composants).
- **`audit.mjs`** : état des lieux en lecture seule, compteurs par règle, `--json` et `--strict`.
- **`scaffold.mjs`** : pose le socle sans rien écraser (tokens, thème, classes, Storybook, vitest, ESLint, conventions, mémoire) et affiche les dépendances à installer.
- **`rehome.mjs`** : range un composant ajouté par la CLI de shadcn (un fichier par sous-composant, `index.ts`), retire les `data-*`, remplace les utilitaires par des classes sémantiques et écrit un premier jet de sa feuille.

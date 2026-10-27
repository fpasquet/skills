# design-system

Skill qui crée, maintient ou migre le **design system d'une application React** (Next.js ou Vite) avec Tailwind CSS v4, shadcn/ui sur Radix et Storybook. Il s'organise en trois couches :

1. **Tokens** : couleurs, polices, tailles de texte, rayons, hauteurs et ombres, en source unique (bloc `@theme`).
2. **Classes sémantiques** à la daisyUI (`btn`, `btn-primary`, `card`, `form-input`), dans `@layer components`, le CSS de chaque composant à côté de lui.
3. **Composants shadcn/ui** dont les variantes CVA posent ces classes : `<Button variant="primary" size="sm">` rend `btn btn-primary btn-sm`.

Les conventions viennent d'un projet réel :

- un dossier par composant, avec son CSS, son histoire et un `index.ts` ;
- ni `data-slot` ni `data-variant` : les variantes passent par des classes de modificateur, les états par les attributs ARIA ;
- aucune valeur arbitraire de Tailwind ni couleur de la palette ;
- Storybook documente les tokens, les classes et chaque état, et son contrôle d'accessibilité bloque ;
- le lint vérifie les classes.

## Trois modes

- **Créer à partir de l'existant** : l'audit relève les couleurs en dur et les listes de classes répétées. On en tire les tokens, les classes et les composants, puis on remplace lot par lot.
- **Maintenir** : ajouter un composant de shadcn (rangé et réécrit par script), un token, une classe ou une variante ; mettre à jour shadcn, Storybook ou Tailwind.
- **Migrer** vers ces conventions depuis shadcn/ui d'origine, Tailwind v3, CSS Modules, Sass, styled-components ou une bibliothèque de composants (MUI, Chakra…), par lots, avec le lint en avertissement jusqu'à la fin.

## Installation

```bash
# Dans le projet courant (choix de l'agent en interactif)
npx skills add <source> --skill design-system

# Globalement, pour tous vos projets
npx skills add <source> --skill design-system -g
```

`<source>` vaut `<compte>/skills` depuis GitHub, ou le chemin d'une copie locale du dépôt (`~/www/skills`).

Il fonctionne seul. Avec `specs-ui`, l'application importe les tokens des specs (`specs/ui/tokens.css`) : les maquettes et le code partagent les mêmes valeurs.

## Exemples de demandes

- « Mets en place un design system sur `apps/web` à partir de ce qui existe. »
- « Ajoute le composant Select de shadcn en suivant nos conventions. »
- « On migre de Tailwind v3 et de nos CSS Modules vers des classes sémantiques et Storybook. »
- « Fais l'état des lieux du design system : qu'est-ce qui ne respecte pas les conventions ? »
- « Ajoute un mode sombre. »

## Ce que le skill pose dans le projet

```text
<app>/
├── .storybook/main.ts, preview.tsx      # autodocs, accessibilité bloquante, thèmes, ordre des sections
├── vitest.config.ts                     # projet « stories » : chaque histoire dans Chromium, avec axe
├── eslint.design-system.mjs             # classes Tailwind, data-*, un composant par fichier
└── src/
    ├── styles/tokens.css                # (sans specs) tokens à remplir
    ├── styles/theme.css                 # shadcn → tokens, mode sombre, mises en page nommées
    ├── styles/components.css            # rassemble les feuilles des composants et de classes/
    ├── styles/utilities.css             # focus-ring
    └── design-system/                   # pages Introduction, Tokens, Classes ; DESIGN-SYSTEM.md (mémoire)
.claude/rules/design-system.md           # conventions (ou docs/design-system.md, relié depuis AGENTS.md)
```

Aucun fichier existant n'est écrasé. Les dépendances à installer sont affichées avec leurs versions testées ensemble.

## Contenu

| Chemin | Rôle |
|---|---|
| `SKILL.md` | Méthode : repérer et choisir le mode, socle, tokens, composants, Storybook, migration, maintenance, contrôle |
| `scripts/audit.mjs` | État des lieux, en lecture seule : couleurs en dur, palette, valeurs arbitraires, `data-*`, feuilles non importées, sélecteurs en double, histoires, documentation, classes répétées |
| `scripts/scaffold.mjs` | Socle du design system, sans rien écraser |
| `scripts/rehome.mjs` | Composant ajouté par la CLI de shadcn : rangé dans son dossier, réécrit en classes sémantiques, premier jet de son CSS |
| `references/` | Mise en place, tokens, composants, Storybook, migration |
| `templates/` | Gabarits : tokens, thème, classes, Storybook, pages de documentation, ESLint, conventions, mémoire, composant modèle (`button`) |

Les scripts n'ont aucune dépendance : Node 18 ou plus suffit.

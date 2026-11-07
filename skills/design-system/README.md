# design-system

Skill qui crée, maintient ou migre le **design system d'une application React** (Next.js ou Vite) avec Tailwind CSS v4, shadcn/ui sur Radix et Storybook, ou daisyUI. Il s'organise en trois couches :

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
- **Migrer** vers ces conventions depuis shadcn/ui d'origine, daisyUI et ses thèmes, Tailwind v3, CSS Modules, Sass, styled-components ou une bibliothèque de composants (MUI, Chakra…), par lots, avec le lint en avertissement jusqu'à la fin.

## Avec daisyUI

Un projet qui utilise daisyUI 5 garde ses classes : elles deviennent les classes sémantiques du design system.

- Un thème daisyUI pointe ses variables sur les mêmes tokens (`--color-base-100` sur `surface`, `--radius-field` sur `radius-control`), et les thèmes intégrés sont coupés : ils écraseraient les tokens.
- Les composants React posent les classes de daisyUI (`btn btn-primary btn-sm`). Le comportement vient du HTML natif (`<dialog>`) ou de Radix (onglets, menus) ; seul ce que daisyUI n'a pas vient de shadcn.
- Le réglage d'une classe de daisyUI s'écrit dans sa sous-couche de base. Ses modificateurs (`btn-sm`) et les utilitaires du JSX gardent ainsi le dernier mot, ce que ni `@layer components` ni `@utility` ne permettent.
- L'audit vérifie le thème et la cascade. `scaffold.mjs` reprend dans les tokens les couleurs du thème en place, et `retoken.mjs` réécrit `bg-base-100` en `bg-surface`.

## Installation

```bash
# Dans le projet courant (choix de l'agent en interactif)
npx skills add <source> --skill design-system

# Globalement, pour tous vos projets
npx skills add <source> --skill design-system -g
```

`<source>` vaut `<compte>/skills` depuis GitHub, ou le chemin d'une copie locale du dépôt (`~/www/skills`).

Il fonctionne seul. Avec `specs-ui`, dont les specs vivent dans un dépôt de specs à part, l'application garde une copie de leurs tokens, avec leur provenance : les maquettes et le code partagent les mêmes valeurs, et l'audit signale une copie modifiée à la main.

## Exemples de demandes

- « Mets en place un design system sur `apps/web` à partir de ce qui existe. »
- « Ajoute le composant Select de shadcn en suivant nos conventions. »
- « On migre de Tailwind v3 et de nos CSS Modules vers des classes sémantiques et Storybook. »
- « Fais l'état des lieux du design system : qu'est-ce qui ne respecte pas les conventions ? »
- « Ajoute un mode sombre. »
- « Les couleurs ont changé dans les specs : mets à jour les tokens de l'application. »
- « On utilise daisyUI : branche-le sur nos tokens et fais-en le design system. »

## Ce que le skill pose dans le projet

```text
<app>/
├── .storybook/main.ts, preview.tsx      # autodocs, accessibilité bloquante, thèmes, ordre des sections
├── vitest.config.ts                     # projet « stories » : chaque histoire dans Chromium, avec axe
├── eslint.design-system.mjs             # classes Tailwind, data-*, un composant par fichier
└── src/
    ├── styles/tokens.css                # tokens à remplir, ou copie de ceux des specs
    ├── styles/theme.css                 # shadcn (et daisyUI) → tokens, mode sombre, mises en page nommées
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
| `scripts/audit.mjs` | État des lieux, en lecture seule : couleurs en dur, palette, valeurs arbitraires, `data-*`, feuilles non importées, sélecteurs en double, histoires, documentation, classes répétées, thème et cascade de daisyUI |
| `scripts/scaffold.mjs` | Socle du design system, sans rien écraser ; `--classes daisyui` pour les classes de daisyUI |
| `scripts/rehome.mjs` | Composant ajouté par la CLI de shadcn : rangé dans son dossier, réécrit en classes sémantiques, premier jet de son CSS ; découpe aussi un fichier qui contient plusieurs composants |
| `scripts/retoken.mjs` | Classes de shadcn et couleurs de daisyUI d'une application réécrites avec les tokens du design system |
| `scripts/tokens.mjs` | Copie des tokens des specs avec leur provenance (et bascule l'ancien import de `specs/ui/tokens.css`), contrôle de cette copie (en retard, modifiée à la main) |
| `references/` | Mise en place, tokens, composants, Storybook, migration, daisyUI |
| `templates/` | Gabarits : tokens, thème, classes, Storybook, pages de documentation, ESLint, conventions, mémoire, composant modèle (`button`, et `button-daisyui`) |

Les scripts n'ont aucune dépendance : Node 18 ou plus suffit.

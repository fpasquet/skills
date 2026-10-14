# {{PRODUCT}}: conventions

<!-- Brouillon généré par design-sync-package.mjs. À compléter depuis CONTEXTE.md (2 000 à 4 000 caractères) :
     remplacer chaque {{…}}, garder seulement ce que le design agent peut appliquer sans deviner, puis retirer
     ce commentaire. -->

{{PRODUCT}} is {{one sentence: what the product does, for whom}}. This design system ships **tokens and utility classes only**: there are no components. Build screens with plain React elements styled with the Tailwind-style classes from `styles.css`. Write all UI copy in {{language}}.

## Setup

`styles.css` is all you need. It loads the fonts, defines every token as a CSS variable and contains the compiled utility classes: Tailwind v4 layout and spacing classes (`flex`, `gap-2`, `px-4`, `text-sm`…) plus the token classes below. Use classes first. Fall back to `var(--color-*)` inline only when no class fits. Never hard-code hex values or Tailwind palette colors (`zinc-*`, `blue-*`).

## Token vocabulary (use these names, nothing else)

{{TOKENS}}

{{For each group, say when to use it: e.g. "`bg-primary` + `text-on-primary` for primary buttons", what state colours mean, which font for which content, control and row heights.}}

## Patterns

- **{{Status badge}}**: {{exact classes}}
- **{{App shell}}**: {{navigation, top bar, mobile variant}}
- **{{Page header / main pattern}}**: {{…}}
- **{{Tables and lists}}**: {{…}}

## Example

```jsx
{{one realistic card or row of the product, 10–15 lines, using only the vocabulary above and real copy from the specs}}
```

Where the truth lives: tokens come from the product's UI specs (`tokens.css`). Rebuild this package when they change, never edit `styles.css` by hand.

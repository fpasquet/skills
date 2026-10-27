# Storybook

Storybook est la documentation vivante du design system. Il montre les tokens et les classes, chaque composant dans chacun de ses états, et les écrans assemblés. Chaque histoire est aussi un test : elle est rendue dans Chromium, avec son contrôle d'accessibilité.

## Ce qui a une histoire

| Composant | Histoire |
|---|---|
| Composant d'interface (`<ui>`) | Oui : une par variante ou par état |
| Bloc commun (`<components>`), mise en page, contenu d'une fonctionnalité | Oui, s'il est sans état (il reçoit ses données en props) |
| Composant connecté (lit des données, un contexte, une route) | Non : sa version sans état en a une |
| Écran | Une page `<nom>-screen.stories.tsx` qui assemble la mise en page et le contenu |
| Squelette de chargement | Non : c'est l'histoire `Loading` de ce qu'il remplace |

## Titres : le titre dit où est le fichier

Une section selon le rôle, puis les dossiers en anglais et en PascalCase, puis le composant :

| Section | Dossier | Exemple |
|---|---|---|
| `Design system/<Page>` | pages MDX de `<docs>` | `Design system/Tokens` |
| `UI/<Composant>` | `<ui>` | `UI/Button` |
| `Shared/<Composant>` | `<components>` | `Shared/UserMenu` |
| `Layouts/<Nom>`, `Layouts/<Fonctionnalité>/<Nom>` | mises en page partagées ou d'une fonctionnalité | `Layouts/AppShell` |
| `Features/<Fonctionnalité>/<Groupe>/<Composant>` | contenus d'une fonctionnalité | `Features/Billing/Invoices/InvoiceRow` |
| `Pages/<Fonctionnalité>/<Écran>` | écrans, sans le suffixe `Screen` | `Pages/Billing/InvoiceList` |

`storySort` (dans `preview.tsx`) range les sections dans cet ordre. L'audit vérifie la section de chaque titre (`story-section`).

## Écrire une histoire

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';   // ou @storybook/react-vite
import { Badge } from './badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { children: 'Terminée', variant: 'success' },
  parameters: { docs: { description: { component: 'Rend `badge` + `badge-<variante>`.' } } },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};
export const Variants: Story = { render: (args) => <div className="flex gap-2">…</div> };
```

- CSF 3 typé (`satisfies Meta<typeof X>`).
- Les noms d'histoires sont en anglais, un état chacun : `Default`, `Empty`, `Loading`, `NotFound`, `Error`, `Mobile`, ou l'état métier (`WithoutAccess`).
- Les **textes et données viennent du fil rouge du produit** : le vrai nom d'un projet, une vraie date, un vrai message d'erreur, jamais « Lorem ipsum » ni « Button ».
- Les données communes à plusieurs histoires, et la coquille qui entoure une page, sont dans `src/stories/`, que seules les histoires importent. Une règle du lint (`eslint-plugin-boundaries`) peut l'imposer.
- Une action se simule avec `fn()` de `storybook/test`.
- Une histoire qui ouvre un calque d'emblée (fenêtre, panneau, menu) s'affiche dans son propre cadre dans l'onglet Docs, sinon elle recouvre la page :

  ```tsx
  parameters: { docs: { story: { inline: false, height: '320px' } } }
  ```

- `Mobile` rend l'histoire au format d'un téléphone : `globals: { viewport: { value: 'mobile2', isRotated: false } }`.

## Pages d'écran

`<nom>-screen.stories.tsx`, à côté de l'écran. Elle assemble la mise en page et le contenu sans état, avec les données du fil rouge, sans rendre l'écran connecté. Elle a une histoire par état de l'écran (vide, rempli, chargement, erreur, mobile). Sur une page, `Loading` est l'écran entier en squelette, et `Loading<Partie>` une partie qui attend encore ses données.

## Pages du design system

`<docs>/introduction.mdx`, `tokens.mdx` et `classes.mdx`, posées par `scaffold.mjs` :

- **Introduction** : le parti pris visuel en deux phrases, les trois couches, les règles.
- **Tokens** : lus dans le fichier de tokens et dans le bloc `.dark` du thème (`?raw`). La page suit le fichier sans copie : rien à mettre à jour, sauf un nouveau groupe de tokens, qui demande une nouvelle section.
- **Classes** : une section par famille, avec un exemple HTML dans `<Unstyled>` (sinon les styles de la documentation s'appliquent). Une nouvelle classe s'y ajoute dans le même changement. L'audit liste les oubliées (`undocumented-class`).

## Accessibilité

`a11y: { test: 'error' }` : une violation d'axe fait échouer l'histoire, en local (`test:stories`) comme en CI. Elle se corrige dans le composant, jamais en désactivant la règle :

| Violation | Correction |
|---|---|
| `button-name`, `link-name` | Libellé (`sr-only`) ou `aria-label` sur un bouton icône ; icône en `aria-hidden` |
| `color-contrast` | Token de texte plus contrasté (`text-ink` au lieu de `text-muted` sur `surface-alt`), ou correction du token |
| `label` | `<Label htmlFor>` ou `aria-labelledby` ; un champ de recherche garde son `aria-label` |
| `aria-*` invalides | Laisser la primitive Radix poser les attributs, ne pas les recopier |
| `region`, `landmark-*` | Les pages d'écran gardent `main`, `nav` et les titres de la mise en page |

Le thème sombre se contrôle aussi : rendre l'histoire avec le thème `Sombre` de la barre d'outils.

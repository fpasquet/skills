# Composants

Un composant partagé vit dans son dossier :

```text
<ui>/button/
├── button.tsx            # le composant ; ses variantes CVA posent les classes sémantiques
├── button.css            # ses classes, dans @layer components, importé par components.css
├── button.stories.tsx    # son histoire
└── index.ts              # ré-exporte ses noms : l'import reste @/…/button
```

Un composant à plusieurs parties a un fichier par sous-composant (`dialog-content.tsx`, `dialog-title.tsx`…), tous ré-exportés par `index.ts`. Le modèle complet est dans `templates/ui/button/`.

## Composant de shadcn : relire ce que `rehome.mjs` a produit

`rehome.mjs` fait le travail mécanique et rend un compte rendu. La relecture suit cet ordre :

1. **Noms des classes**. Le script propose `<préfixe>-<partie>` (`dialog-content`, `dialog-content-close`) et `<préfixe>-<valeur>` pour les variantes CVA (`btn-outline`). Les aligner sur les conventions et sur l'existant :
   - un préfixe court et connu (`btn`, `card`, `badge`, `menu`) ;
   - la partie principale porte le nom du composant : la boîte d'une fenêtre est `dialog`, pas `dialog-content` ;
   - une partie nommée d'après sa balise ou numérotée (`tool-header-div`, `step-div-2`) prend un nom de rôle (`step-line`, `step-body`) ; si elle ne fait que placer (`flex items-center gap-2`), elle redevient un utilitaire dans le JSX ;
   - les variantes de couleur portent le nom des tokens d'état : `default` et `primary` → `btn-primary`, `destructive` → `btn-danger` ;
   - la taille par défaut se fusionne dans la classe de base (valeur `''` dans CVA), et les autres tailles restent des modificateurs (`btn-sm`, `btn-lg`, `btn-icon`).

   Renommer dans le `.tsx` et le `.css` ensemble. **Garder les noms de variantes de l'API** (`variant="destructive"`) : seule la classe change.
2. **Couleurs**. Les classes de shadcn (`bg-background`, `text-muted-foreground`, `bg-destructive`) fonctionnent grâce au thème, mais les tokens disent mieux l'intention (`bg-surface`, `text-muted`, `bg-danger`). La palette (`text-white`, `bg-black/50`) devient toujours un token (`text-on-danger`, un `--color-overlay`). On garde la nuance de la maquette, sans forcer l'opacité de shadcn.
3. **Densité**. Les hauteurs passent aux tokens (`h-control`, `rounded-control`), et les tailles de texte à l'échelle ou aux tokens de texte.
4. **TODO** : chaque valeur ou variante arbitraire se réécrit.
   - Une valeur de l'échelle devient sa classe : `ring-[3px]` → `ring-3`.
   - Une valeur de mise en page devient du CSS standard dans la feuille : `width: min(440px, calc(100vw - 2rem))`.
   - Un sélecteur d'enfant devient un sélecteur CSS : `*:data-[slot=select-value]:flex` → `.select-trigger > span { … }`.
   - Une variable de Radix s'écrit en CSS : `height: var(--radix-select-trigger-height)`.
5. **Calques** (fenêtre, panneau, menu, popover, infobulle, liste) : le voile prend la classe `overlay` et le calque flottant la classe `popup` (`<styles>/classes/overlay.css`, posée par `scaffold.mjs`), au lieu de répéter les animations de shadcn dans chaque feuille. La boîte d'une fenêtre est `dialog`, et AlertDialog reprend ses classes.
6. **Classes restées dans le TSX** : une liste conditionnelle (`position === 'popper' && '…'`) devient une classe de modificateur posée par la condition (`position === 'popper' && 'select-content-popper'`). `rehome.mjs` le fait seul pour `variant === 'grid' && …`, `isOpen && …` et les props booléennes courantes (`disabled && …`) ; une ternaire (que le compte rendu signale) ou un objet d'états (`statusStyles[status]`) se réécrit à la main. Une classe tirée d'une prop s'écrit en entier (`{ right: 'sheet-right', left: 'sheet-left' }[side]`) : le lint ne reconnaît pas `` `sheet-${side}` ``.
7. **États** : un sélecteur `[data-disabled]` ou `[data-highlighted]` devient `[aria-disabled='true']`, `:focus` ou `[aria-selected='true']`, selon ce que pose la primitive Radix (le vérifier dans sa documentation). Restent `[data-state='open' | 'closed']` et `[data-side]`, pour les animations, et `[data-placeholder]` du Select, sans équivalent ARIA. Une case ou un interrupteur se lit dans `[aria-checked='true']`. Une classe conditionnelle remplace un attribut que le composant posait lui-même (`data-error` → `form-label-error`).
8. **Focus** : `focus-ring` (utilitaire du design system) au lieu des anneaux de shadcn.
9. **Animations** : le script ajoute la règle `prefers-reduced-motion`. La vérifier, et l'ajouter pour toute animation écrite à la main.
10. **Calques ouverts dans une histoire** : Radix masque le reste de la page (`aria-hidden`), Storybook compris, et axe le signale (`aria-hidden-focus`). Limiter le contrôle de l'histoire au calque (`parameters: { a11y: { context: '[role="listbox"]' } }`) plutôt que désactiver la règle.
11. **Textes** : « Close », « Previous » et « More » passent par les messages du projet (`useTranslations('common')` avec next-intl). Le libellé d'un bouton icône est toujours présent (`sr-only` ou `aria-label`).
12. **Histoire** : une histoire par variante ou par état, avec les textes du produit (`storybook.md`).
13. Formater (Prettier du projet), puis `eslint <ui>/<composant>` et `audit.mjs <app> --rule duplicate-selector`.

La CLI de shadcn crée parfois plusieurs fichiers (un composant et ses dépendances, comme `button` pour `dialog`). Lancer `rehome.mjs` pour chacun. Un composant déjà rangé est simplement réimporté par son alias (`@/shared/ui/button`).

### Mise à jour d'un composant de shadcn

Relancer la CLI : comme le dossier existe, `rehome.mjs` refuse et laisse le fichier à plat. Comparer ce fichier avec les sous-composants rangés, reporter ce qui sert (correctifs d'accessibilité, nouvelle prop), puis le supprimer.

## Composants maison et classes répétées

`audit.mjs <app> --rule repeated-classes --limit 0` donne les listes d'utilitaires qui reviennent, avec leurs emplacements. Pour chacune :

| Ce que c'est | Ce que ça devient |
|---|---|
| Un motif d'interface (carte, encadré, champ avec son libellé et son erreur, étapes numérotées) | Un composant de `<ui>` (ou de `<components>` s'il en assemble plusieurs), avec sa classe |
| Un style répété sans structure (pastille, touche du clavier, lien d'onglet) | Une classe dans `<styles>/classes/<famille>.css`, importée par `components.css` |
| Une liste qui recopie une classe existante (`bg-surface border border-line rounded-card p-4`) | Cette classe (`card p-4`), ou le composant (`<Card>`) |
| Un placement ponctuel (`flex items-center gap-2`, marges) | Il reste en utilitaires dans le JSX |

Un composant maison suit les mêmes règles qu'un composant de shadcn :

- un dossier, `index.ts`, sa feuille et son histoire ;
- des variantes en classes de modificateur ;
- une API qui imite celle de shadcn (`variant`, `size`, `asChild` par `Slot` de Radix quand le composant peut devenir un lien).

## Classes sémantiques : écrire la feuille

```css
@layer components {
  .badge {
    @apply inline-flex items-center gap-1 rounded-control px-1.5 text-caption font-medium;
  }
  .badge-success {
    @apply bg-success-soft text-success;
  }
  .tab[aria-selected='true'] {
    @apply border-primary text-ink;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dialog { animation: none; }
}
```

- `@apply` pour une liste simple de classes, y compris avec des variantes de Tailwind (`hover:`, `focus-visible:`, `aria-invalid:`, `sm:`).
- Du CSS standard pour un sélecteur complexe, un état, une valeur calculée (`width: min(…)`) : jamais un `@apply` à valeur arbitraire.
- Une feuille par composant, ou par famille de classes. Une nouvelle feuille s'ajoute à `components.css` (`rehome.mjs` le fait).
- Un sélecteur déclaré deux fois dans le même contexte : la seconde déclaration gagne sans prévenir. L'audit le signale (`duplicate-selector`).
- Une nouvelle classe s'ajoute à la page Classes de Storybook dans le même changement (`undocumented-class`).

## Interfaces d'agent

Pour une conversation, un message, une saisie, des appels d'outils, une réflexion ou un terminal, partir des patterns [AI Elements](https://ui.shadcn.com/docs/ai-elements) et des composants de shadcn sur lesquels ils reposent, jamais d'un bloc écrit à la main. Un composant absent du style de `components.json` s'ajoute par l'URL de son registre, puis se range et se réécrit comme les autres.

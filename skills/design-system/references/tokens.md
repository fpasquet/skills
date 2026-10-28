# Tokens

Les tokens sont la seule source des valeurs visuelles. Ils forment un bloc `@theme` de Tailwind v4 : chaque token donne ses classes (`--color-surface` → `bg-surface`, `text-surface`, `border-surface` ; `--radius-card` → `rounded-card` ; `--spacing-control` → `h-control`, `size-control`).

## Vocabulaire

Les noms sont sémantiques, communs avec les maquettes du skill `specs-ui` (`templates/styles/tokens.css`) :

| Groupe | Tokens | Usage |
|---|---|---|
| Surfaces | `canvas`, `surface`, `surface-alt` | fond de l'application ; cartes, panneaux ; en-têtes, survol |
| Lignes | `line`, `line-strong` | bordures, séparateurs ; bordures de champs (3:1 sur `surface`) |
| Texte | `ink`, `muted` | texte principal ; texte secondaire, libellés, placeholders |
| Navigation | `nav`, `nav-ink`, `nav-muted`, `nav-active` | barre latérale ou du haut |
| Marque | `primary`, `primary-hover`, `primary-soft`, `on-primary` | actions principales, sélection ; texte posé sur `primary` |
| États | `success`, `warning`, `danger`, `info`, chacun avec `-soft`, plus `on-danger` | la couleur pleine pour le texte ou l'icône, `-soft` pour le fond |
| Échelles | `text-*`, `spacing-*`, `radius-*`, `shadow-*` | noms de Tailwind, restreints aux pas retenus (section suivante) |
| Formes | `radius-control`, `radius-card` | boutons et champs ; cartes, fenêtres, panneaux |
| Dimensions | `spacing-control`, `spacing-row` | hauteur des contrôles ; hauteur des lignes : nommées d'après leur usage |
| Relief | `shadow-card`, `shadow-overlay` | cartes ; menus, fenêtres, panneaux |
| Polices | `font-sans`, `font-display`, `font-mono` | texte, titres, code et identifiants |

Ajouter un token quand une valeur revient et porte un sens (`--color-overlay` pour le voile des fenêtres), pas pour une valeur isolée. Un nom dit l'usage, jamais la valeur (`surface-alt`, pas `gray-50`).

## Échelles restreintes

Les échelles (espaces, tailles de texte, rayons, ombres) gardent les noms de Tailwind, connus de l'équipe, des agents
et des composants de shadcn (`p-4`, `gap-2`, `text-sm`). Mais seuls les pas retenus existent : chaque famille est
remise à zéro puis redéclarée dans les tokens.

```css
@theme {
  --spacing-*: initial;
  --spacing-0: 0px;
  --spacing-px: 1px;
  --spacing-1\.5: 0.375rem;      /* point échappé dans le nom */
  --spacing-4: 1rem;
  --spacing-control: 2.5rem;     /* dimension nommée d'après son usage */
  --text-*: initial;
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.25rem;
}
```

- Le bloc des tokens est un `@theme static` : Tailwind émet alors chaque variable, même inutilisée, et la page Tokens
  peut toutes les afficher (sinon un pas que personne n'utilise encore apparaît vide).
- Une classe hors de l'échelle (`p-5`, `w-64`) n'est plus générée : le lint la signale (classe inconnue). Une valeur
  qui manque s'ajoute aux tokens avec son usage, jamais en valeur arbitraire.
- `p-0` et `inset-0` demandent `--spacing-0` ; `leading-6` disparaît avec `--spacing` (l'interligne vient de la taille
  de texte, ou de `leading-tight`, `leading-normal`).
- `--spacing` (l'unité) disparaît aussi : `tw-animate-css` en a besoin pour ses translations (`slide-in-from-top-2`). `theme.css` la redéclare dans `:root`, hors de `@theme`, pour que Tailwind ne régénère pas toute l'échelle.
- Les largeurs (`max-w-xs`, `w-sm`) restent dans la famille `--container-*` de Tailwind : pas de collision. Une largeur
  d'écran ou de calque est une entrée nommée (`max-w-measure`, `w-popover`).
- `theme.css` ramène les noms de shadcn sur les tokens (`rounded-md` → contrôle, `shadow-lg` → calque) : les
  composants de la CLI gardent leurs classes. `rehome.mjs` signale celles qui sortent de l'échelle.
- On n'invente pas d'échelle nommée (`p-m`, `gap-xs`) : un second vocabulaire, inconnu de shadcn et des agents, qui
  se heurte aux noms de Tailwind (`--spacing-xs` détourne `max-w-xs`). Un projet qui en a une la convertit (pas à pas
  vers les noms de Tailwind), en arrondissant avec l'accord de la personne les pas qui n'existent pas.

**Pas de token responsive.** Une taille ne change pas selon l'écran : `text-heading-xl` qui vaudrait 40 px sur mobile et
64 px sur bureau ne se lit pas dans le JSX, suit la fenêtre et pas la place du composant (un titre de carte étroite
grossit sur bureau), et se combine mal avec `md:`. La variation s'écrit dans le JSX (`text-2xl md:text-4xl`) ou dans
la classe sémantique d'un composant (`.heading-xl { @apply text-4xl md:text-6xl; }`), visible dans sa feuille.

## Tirer les tokens du code existant

1. `audit.mjs <app> --rule hardcoded-color --limit 0 --json`, puis `--rule palette-class`. Le JSON donne chaque occurrence avec son fichier.
2. Regrouper par usage en lisant le contexte des lignes signalées : propriété (`background`, `color`, `border-color`), classe (`bg-`, `text-`, `border-`), composant. Une même couleur peut servir à deux usages (fond de carte et texte inversé) : ce sont deux tokens.
3. Fusionner les valeurs proches : trois gris de bordure presque identiques deviennent `line`. Proposer chaque fusion à la personne (AskUserQuestion, avec les valeurs et le nombre d'occurrences).
4. Écrire les tokens, en hexadécimal, une ligne chacun, avec un commentaire d'usage en fin de ligne. Ajouter la provenance dans l'en-tête du fichier (« valeurs relevées dans le code le JJ/MM/AAAA »).
5. Vérifier les contrastes AA : texte sur fond 4,5:1, grands textes et bordures de contrôles 3:1. Le skill `specs-ui` a `scripts/check-contrast.mjs` s'il est installé. Sinon, calculer et noter le résultat dans l'en-tête.
6. Remplacer les valeurs dans le code, lot par lot (`migration.md`).

Pour les tailles de texte, les rayons et les hauteurs, on part aussi des valeurs arbitraires relevées par `--rule arbitrary-class` :

- une valeur de l'échelle devient sa classe (`text-[14px]` → `text-sm`) ;
- une valeur récurrente hors échelle devient un pas de plus, ou un token nommé d'après son usage (`text-[13px]` → `--text-compact`, `w-[720px]` → `max-w-dialog`) ;
- une valeur isolée se rapproche de l'échelle, avec l'accord de la personne.

## Specs du skill `specs-ui`

Quand `specs/ui/tokens.css` existe, l'application l'importe directement (`@import '../../../../specs/ui/tokens.css'`) et la page Tokens de Storybook le lit. Les maquettes et l'application partagent ainsi les mêmes valeurs. Une couleur, un rayon ou une police se change dans les specs, avec le skill `specs-ui`, jamais dans l'application.

## Thème shadcn/ui

`theme.css` pointe les variables de shadcn sur les tokens (`--background: var(--color-canvas)`, `--primary-foreground: var(--color-on-primary)`…), puis les expose à Tailwind dans un `@theme inline`. Les composants de shadcn gardent ainsi leurs classes (`bg-background`, `text-muted-foreground`) et suivent l'identité.

- **Piège `muted`** : dans les tokens, `muted` est la couleur du texte secondaire (`text-muted`). Pour shadcn, `muted` est un fond, et son texte secondaire s'appelle `muted-foreground`. `theme.css` définit `--muted` (fond) et `--muted-foreground: var(--color-muted)`, mais ne redéfinit jamais `--color-muted`. L'audit le vérifie (`muted-redefined`). Le fond s'écrit `bg-surface-alt`, jamais `bg-muted`, qui prendrait la couleur du texte : l'audit le signale (`muted-background`), et `migration.md` donne la commande pour renommer le code existant.
- `primary` a le même sens des deux côtés : seul `--primary-foreground` est ajouté.
- `--radius` vient de `--radius-card`, et les rayons `sm`, `md`, `lg`, `xl` de shadcn en dérivent.

## Mode sombre

La classe `dark` sur un ancêtre (`@custom-variant dark (&:is(.dark *))`) redéfinit les **mêmes** tokens de couleur dans le bloc `.dark` de `theme.css`. `scaffold.mjs` y liste les tokens de couleur en commentaire, avec leur valeur claire.

- Un composant n'écrit jamais `dark:` pour une couleur : le token change seul. `dark:` reste pour un réglage qui n'est pas une couleur.
- Les contrastes sont vérifiés aussi en sombre.
- Storybook montre les deux thèmes (barre d'outils). La page Tokens affiche les deux colonnes.

## Mises en page nommées

Une grille ou une largeur propre à un écran devient une entrée nommée du thème, dans le `@theme` de `theme.css`, d'après son usage :

```css
@theme {
  --grid-template-columns-content-aside: minmax(0, 1fr) 300px;   /* grid-cols-content-aside */
  --container-measure: 60ch;                                      /* max-w-measure */
  --shadow-attention: inset 2px 0 0 var(--color-warning);         /* shadow-attention */
}
```

Une variante répétée devient un `@custom-variant` (`aria-current:` au lieu de `aria-[current=page]:`).

# Conventions Tailwind des maquettes

Les maquettes sont écrites en Tailwind CSS v4, chargé dans le navigateur. Le but est double : itérer vite dans un seul fichier HTML, et livrer aux développeurs des classes qu'ils reprendront telles quelles. Une maquette dont les classes ne correspondent à rien dans le futur code perd la moitié de son intérêt.

## Sommaire

1. Chargement
2. Vocabulaire des tokens
3. Cadres desktop et mobile
4. Blocs réutilisables (`data-use`)
5. Annotations et action suivante
6. Catalogue de composants
7. Icônes
8. Pièges connus

## 1. Chargement

Dans le `<head>`, avec ces versions exactes (déjà présentes dans les templates) :

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.13"></script>
<script src="https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js"></script>
<style type="text/tailwindcss">
  @theme { /* contenu de tokens.css, injecté par build.mjs */ }
</style>
```

- Les polices viennent de Google Fonts (`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">`), ou de la pile système si le produit n'en charge pas.
- Pas d'autre CDN, pas de CSS écrit à la main pour les maquettes. Seul l'habillage du document (`.anno`, `.next-step`, couleurs `doc-*`) a du CSS dédié, parce qu'il ne fait pas partie du produit.
- Ces contraintes respectent aussi les règles des artifacts claude.ai (scripts versionnés sur un CDN autorisé, mode sombre de l'habillage, navigation collante sous `env(safe-area-inset-top)`, pas de défilement horizontal de la page).

## 2. Vocabulaire des tokens

Toujours les mêmes noms, quelle que soit l'identité. Les maquettes n'utilisent **que** ces couleurs pour le produit : pas de `bg-blue-600` ni de `text-gray-500`. Si une couleur manque, on ajoute un token, on ne code pas une valeur en dur.

| Token | Classe | Rôle |
|---|---|---|
| `--color-canvas` | `bg-canvas` | Fond de l'application |
| `--color-surface` | `bg-surface` | Cartes, panneaux, barres |
| `--color-surface-alt` | `bg-surface-alt` | En-têtes de tableau, zones secondaires, survol |
| `--color-line` | `border-line` | Bordures et séparateurs |
| `--color-line-strong` | `border-line-strong` | Bordures de champs et boutons secondaires |
| `--color-ink` | `text-ink` | Texte principal |
| `--color-muted` | `text-muted` | Texte secondaire, libellés, placeholders |
| `--color-nav`, `nav-ink`, `nav-muted`, `nav-active` | `bg-nav`, `text-nav-ink`, `text-nav-muted`, `bg-nav-active` | Navigation principale : égale à `surface`, ou sombre / colorée selon l'identité |
| `--color-primary` (+ `-hover`, `-soft`) | `bg-primary`, `text-primary`, `bg-primary-soft` | Actions principales, liens, éléments actifs |
| `--color-on-primary` | `text-on-primary` | Texte posé sur `primary` |
| `--color-success` / `warning` / `danger` / `info` (+ `-soft`) | `bg-success-soft text-success`… | États ; `-soft` en fond, couleur pleine en texte |
| `--color-on-danger` | `text-on-danger` | Texte posé sur `danger` (bouton de suppression) |
| `--font-sans` / `display` / `mono` | `font-sans`, `font-display`, `font-mono` | Texte, titres, chiffres et références |
| `--radius-control` / `card` | `rounded-control`, `rounded-card` | Boutons et champs / cartes, modales |
| `--spacing-control` | `h-control` | Hauteur des boutons et champs |
| `--spacing-row` | `h-row` | Hauteur des lignes de tableau et de liste |
| `--shadow-card` / `overlay` | `shadow-card`, `shadow-overlay` | Relief des cartes / des éléments flottants |

Les échelles Tailwind par défaut (espacements `p-4`, tailles `text-sm`, `size-4`…) restent utilisables : elles ne portent pas l'identité.

Seule exception aux tokens : l'habillage du document, qui ne fait pas partie du produit (couleurs `doc-*`, pastilles `anno`, contour de téléphone `ring-zinc-900`).

On peut ajouter des tokens propres au produit (`--color-accent`, `--color-highlight`…). Les noter dans `tokens.css` avec leur rôle.

## 3. Cadres desktop et mobile

Chaque écran est livré deux fois : desktop puis mobile. Les cadres ont une taille fixe pour qu'on juge la densité réelle.

```html
<!-- Desktop -->
<p class="mt-4 mb-1.5 font-mono text-xs text-doc-muted">Desktop · 1280 × 820</p>
<div class="w-fit max-w-full overflow-x-auto rounded-xl border border-doc-line bg-doc-card">
  <div class="relative h-[820px] w-[1280px] overflow-hidden bg-canvas font-sans text-sm text-ink"> … </div>
</div>

<!-- Mobile -->
<p class="mb-1.5 font-mono text-xs text-doc-muted">Mobile · 390 × 844</p>
<div class="overflow-x-auto p-2">
  <div class="relative h-[844px] w-[390px] overflow-hidden rounded-[2rem] bg-canvas font-sans text-sm text-ink ring-8 ring-zinc-900"> … </div>
</div>
```

- `relative` sur le cadre : coquilles, modales, panneaux et toasts se positionnent en `absolute` par rapport à lui.
- `overflow-hidden` : le contenu qui dépasse est coupé, comme sur un vrai écran. Une coupe voulue (liste qui continue, aperçu tronqué) se marque `data-clip-ok` sur le conteneur : `capture.mjs` ne la signale plus. Pour une page longue (site public, formulaire), augmenter la hauteur (`h-[1600px]`) et l'indiquer dans le libellé : « Desktop · 1280 × 1600 (page entière) ».
- Le mobile n'est pas une réduction du desktop. Il faut repenser l'écran : tableau → cartes, panneau latéral → onglet ou écran poussé, barre d'actions → bouton flottant ou barre basse, filtres → feuille modale. Cibles tactiles de 44 px minimum.
- Un site existant garde ses largeurs réelles : utiliser ses points de rupture si 1280 / 390 ne leur correspondent pas.

## 4. Blocs réutilisables (`data-use`)

Les templates incluent un petit script d'assemblage. Il évite de recopier la coquille de l'application (navigation, barre du haut) dans chaque écran et la garde cohérente. Les coquilles vivent dans `specs/ui/sources/shared/shells.html`, communes à tous les lots ; un `<template>` propre à un lot (fond de calque, contenu réutilisé) va dans `sources/<lot>/templates.html`.

```html
<template id="tpl-shell-desktop">
  … <h1 data-slot="title"></h1> … <a data-nav="demandes" class="… aria-[current=page]:bg-primary-soft">…</a> …
  <main data-slot="content" class="relative min-h-0 flex-1 overflow-hidden"></main>
</template>

<div class="relative h-[820px] w-[1280px] …" data-use="shell-desktop" data-active="demandes" data-slot-title="Demandes">
  <!-- contenu propre à l'écran, inséré dans [data-slot="content"] -->
</div>
```

- `data-use="x"` : insère `<template id="tpl-x">`.
- Les enfants de l'hôte vont dans `[data-slot="content"]`.
- `data-slot-<nom>="texte"` remplit `[data-slot="<nom>"]`.
- `data-active="<id>"` pose `aria-current="page"` sur `[data-nav="<id>"]` ; le style actif s'écrit avec la variante `aria-[current=page]:`.
- Les blocs peuvent s'imbriquer, mais les paramètres (`data-slot-*`, `data-active`, `data-omit`, `data-anno-*`) ne s'appliquent qu'au template de l'hôte direct. Pour paramétrer un écran réutilisé qui contient une coquille, garder la coquille sur l'hôte extérieur et mettre le contenu dans un `tpl-contenu-…` inséré à l'intérieur.
- Un `data-slot-<nom>` absent laisse le contenu par défaut du template à cet emplacement (souvent vide) : prévoir dans le template un contenu par défaut lisible, ou toujours fournir le slot.
- `data-backdrop` fonctionne sur n'importe quel conteneur (règle CSS), pas seulement sur un hôte `data-use`.
- Composants partagés entre lots, hors coquille (en-tête de projet avec onglets, en-tête mobile d'écran poussé…) : `sources/shared/components.html`. Tous les fichiers de `sources/shared/` sont disponibles dans chaque page.
- `data-count="<sélecteur>"` affiche le nombre d'éléments correspondants (« Points ouverts · <span data-count="#ouverts tbody tr"></span> ») : pas de compteur tenu à la main.

- `data-omit="views profile"` : retire de la coquille, pour cet écran, les éléments `[data-zone="views"]`, `[data-zone="profile"]` (premier usage sans projets, écran simplifié…). Poser des `data-zone` sur les parties optionnelles de la coquille.
- `data-anno-<zone>="2"` : pose la pastille 2 sur l'élément `[data-zone="<zone>"]` de la coquille (annoter la recherche ⌘K de la barre latérale depuis un écran).
- Zone optionnelle : `data-zone="admin" data-optional` dans la coquille n'apparaît que si l'hôte la demande avec `data-include="admin"` (section réservée à un rôle, bloc propre à un contexte).
- `data-active` accepte plusieurs identifiants : `data-active="projets projet-facturation"` marque l'entrée de navigation et le projet ouvert.

À réserver à ce qui se répète vraiment à l'identique (coquilles, en-têtes de page). Un écran qui s'écarte de la coquille (écran poussé sur mobile, plein écran, page de connexion) s'écrit en entier plutôt que d'ajouter des options au script.

## 5. Annotations et action suivante

```html
<div class="relative …">            <!-- l'élément annoté (ou son parent) est relative -->
  <span class="anno -top-3 -right-3">2</span>
  …
</div>
```

- Placer la pastille dans un coin ou une zone vide, **sans couvrir de texte**. Si le parent coupe le débordement (`overflow-hidden`), la placer à l'intérieur (`top-1 right-1`, `top-1/2 right-4 -translate-y-1/2`…).
- Mêmes numéros sur desktop et mobile pour le même sujet. Un sujet propre au mobile prend le numéro suivant.
- Dans un tableau ou une liste qui coupe le débordement, poser la pastille sur l'intertitre ou l'en-tête de colonne plutôt que dans une cellule.
- 3 à 6 pastilles par écran. Au-delà, l'écran fait sans doute deux choses : le découper.
- `.next-step` (anneau jaune) signale l'action qui mène à l'écran suivant du parcours. Un seul élément par écran.

## 6. Catalogue de composants

Toujours repartir de ces chaînes de classes : les maquettes restent cohérentes entre elles et chacune correspond à un futur composant. Le catalogue fixe le vocabulaire, pas la mise en page : la composition des écrans suit `qualite-ui.md`. Si le produit a ses propres composants (site existant, design system), décrire leurs équivalents dans ce même format au début des specs, puis s'y tenir.

### Boutons

```html
<button type="button" class="inline-flex h-control items-center gap-2 rounded-control bg-primary px-4 font-medium text-on-primary">Principal</button>
<button type="button" class="inline-flex h-control items-center gap-2 rounded-control border border-line-strong bg-surface px-4 font-medium">Secondaire</button>
<button type="button" class="inline-flex h-control items-center gap-2 rounded-control px-3 font-medium text-muted">Discret</button>
<button type="button" class="inline-flex h-control items-center gap-2 rounded-control bg-danger px-4 font-medium text-on-danger">Supprimer</button>
<!-- Désactivé : ajouter opacity-50 et aria-disabled="true" -->
```

**Champs** (des `div` : la maquette ne doit pas réagir à la saisie)

```html
<div><p class="mb-1 text-xs font-medium text-muted">Libellé</p>
  <div class="flex h-control items-center rounded-control border border-line-strong bg-surface px-3">Valeur saisie</div></div>
<!-- Placeholder : text-muted · Erreur : border-danger + <p class="mt-1 text-xs text-danger">Message</p> -->
<!-- Liste déroulante : même champ + <i data-lucide="chevron-down" class="size-4 text-muted"></i> en fin, justify-between -->
<!-- Zone de texte : remplacer h-control par h-24 items-start py-2.5 -->
```

### Case à cocher, interrupteur

```html
<span class="flex size-4 items-center justify-center rounded-[3px] bg-primary text-on-primary"><i data-lucide="check" class="size-3"></i></span>
<span class="size-4 rounded-[3px] border border-line-strong bg-surface"></span>
<span class="flex h-5 w-9 items-center rounded-full bg-primary p-0.5"><span class="ml-auto size-4 rounded-full bg-surface"></span></span>
```

**Badges d'état** : toujours du texte, la couleur seule ne suffit pas.

```html
<span class="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">Publié</span>
<!-- warning / danger / info sur le même modèle ; neutre : bg-surface-alt text-muted -->
```

### Onglets

```html
<div class="flex gap-4 border-b border-line">
  <span class="border-b-2 border-primary py-2.5 font-medium">Actif</span><span class="py-2.5 text-muted">Inactif</span></div>
<!-- Variante segmentée : conteneur rounded-control bg-surface-alt p-1, onglet actif bg-surface shadow-card -->
```

### Carte, tableau

```html
<div class="rounded-card border border-line bg-surface p-4 shadow-card">…</div>

<div class="overflow-hidden rounded-card border border-line bg-surface shadow-card">
  <table class="w-full border-collapse text-left">
    <thead class="bg-surface-alt text-xs text-muted"><tr class="h-10"><th class="pl-5 font-medium">…</th></tr></thead>
    <tbody class="divide-y divide-line"><tr class="h-row"><td class="pl-5">…</td></tr></tbody>
  </table></div>
<!-- Ligne sélectionnée : bg-primary-soft/60 · Ligne atténuée : opacity-50 -->
<!-- Densité compacte (h-row ≤ 2.25rem) : une seule ligne par cellule, truncate sur les textes, info secondaire dans une colonne ou une infobulle -->
```

**Calques** (dans le cadre, qui est `relative`)

```html
<div class="absolute inset-0 bg-ink/30"></div>                                        <!-- voile -->
<div class="absolute inset-y-0 right-0 flex w-[460px] flex-col gap-4 bg-surface p-6 shadow-overlay">…</div>   <!-- panneau latéral -->
<div class="absolute top-1/2 left-1/2 w-[560px] -translate-1/2 rounded-card bg-surface p-6 shadow-overlay">…</div>  <!-- modale -->
<div class="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-control bg-ink px-4 py-2.5 text-surface">…</div>  <!-- toast -->
<div class="absolute inset-x-0 bottom-0 rounded-t-card bg-surface p-4 shadow-overlay">…</div>   <!-- feuille modale mobile -->
```

**Calque au-dessus d'un autre écran** (E3c = panneau au-dessus de E3a) : écrire l'écran de fond une seule fois dans un `<template id="tpl-backdrop-e3a">`, puis le réutiliser sous le calque :

```html
<div data-frame="e3c-desktop" class="relative h-[820px] w-[1280px] …">
  <div data-use="backdrop-e3a" data-backdrop></div>          <!-- pastilles, .next-step et [data-menu] masqués automatiquement -->
  <div class="absolute inset-0 bg-ink/30"></div>
  <div class="absolute inset-y-0 right-0 …">…panneau…</div>
</div>
```

Marquer `data-menu` les menus déroulants ouverts, pour qu'ils disparaissent quand l'écran sert de fond. Si le fond contient une coquille, placer le voile et le panneau **à côté** de l'hôte de la coquille, directement dans le cadre : dans `main`, ils se positionneraient par rapport au contenu et non à l'écran.

**Badges d'écran** (habillage du document) : `bg-doc-new/15 text-doc-new` (Nouveau), `bg-doc-changed/15 text-doc-changed` (Modifié), `bg-doc-line text-doc-muted` (Existant). Jamais de couleur Tailwind brute ni de variante `dark:` dans l'habillage : elles ignorent le sélecteur de thème.

**Liens** : si `primary` est presque noire (thème monochrome), un lien coloré ne se distingue plus du texte : le souligner (`underline underline-offset-2`).

**Assistant à étapes** (création, configuration)

```html
<ol class="flex items-center gap-2 text-sm">
  <li class="flex items-center gap-2 text-muted"><span class="grid size-6 place-items-center rounded-full bg-success-soft text-success"><i data-lucide="check" class="size-3.5"></i></span>Informations</li>
  <li class="h-px w-8 bg-line"></li>
  <li class="flex items-center gap-2 font-medium"><span class="grid size-6 place-items-center rounded-full bg-primary text-xs text-on-primary">2</span>Dépôts</li>
  <li class="h-px w-8 bg-line"></li>
  <li class="flex items-center gap-2 text-muted"><span class="grid size-6 place-items-center rounded-full border border-line-strong text-xs">3</span>Tickets</li>
</ol>
<!-- Pied d'assistant, collé en bas du cadre : -->
<div class="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-line bg-surface px-8 py-4">
  <button type="button" class="… discret">Annuler</button><span class="text-xs text-muted">Brouillon enregistré</span>
  <button type="button" class="ml-auto … secondaire">Précédent</button><button type="button" class="… principal">Continuer</button></div>
```

### Conversation avec un agent

```html
<div class="flex gap-3"><span class="grid size-7 shrink-0 place-items-center rounded-full bg-surface-alt"><i data-lucide="bot" class="size-4"></i></span>
  <div class="min-w-0 flex-1"><p class="text-xs text-muted"><b class="font-medium text-ink">Agent</b> · 14:02</p><p class="mt-1">Message…</p>
    <details class="mt-2 rounded-control border border-line px-3 py-2 text-xs text-muted"><summary>Exploration : 6 fichiers lus</summary>…</details></div></div>
<!-- Question fermée : options en cartes (bordure line-strong), l'option recommandée marquée « Recommandé », raccourcis 1 / 2 en kbd -->
<!-- Saisie : champ multiligne rounded-card border-line-strong, pied avec kbd ⌘↵ et bouton Envoyer -->
```

**Liste de conditions** (éligibilité, contrôles avant lancement)

```html
<ul class="divide-y divide-line rounded-card border border-line bg-surface text-sm">
  <li class="flex items-center gap-2 px-3 py-2"><i data-lucide="check" class="size-4 text-success"></i>Condition remplie<span class="ml-auto font-mono text-xs text-muted">valeur réelle</span></li>
  <li class="flex items-center gap-2 px-3 py-2"><i data-lucide="x" class="size-4 text-danger"></i>Condition non remplie<span class="ml-auto text-xs text-danger">raison</span></li></ul>
```

**Pipeline horizontal** (étapes d'un traitement)

```html
<ol class="grid grid-cols-5 gap-2 text-xs">
  <li class="rounded-control border border-line bg-surface p-2"><p class="font-medium">Étape</p><p class="text-muted">détail</p><div class="mt-2 h-1 rounded-full bg-success"></div></li>
  <!-- étape en cours : barre bg-info ; à venir : bg-line ; en échec : bg-danger -->
</ol>
```

### États d'écran

```html
<!-- Vide -->
<div class="flex flex-col items-center gap-3 py-16 text-center">
  <span class="grid size-12 place-items-center rounded-full bg-primary-soft text-primary"><i data-lucide="inbox" class="size-6"></i></span>
  <b class="font-display text-base font-semibold">Aucune demande à traiter</b>
  <p class="max-w-sm text-muted">Phrase qui explique quoi faire ensuite.</p>
  <button …>Action</button></div>
<!-- Chargement : blocs bg-surface-alt animate-pulse aux dimensions du contenu attendu -->
<!-- Erreur : bandeau rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-danger + action « Réessayer » -->
```

## 7. Icônes

Lucide, aussi disponible pour le code (`lucide-react`, `lucide-vue-next`…) :

```html
<i data-lucide="search" class="size-4"></i>
```

Le script final appelle `lucide.createIcons()`. Noms au format kebab-case du site lucide.dev (`circle-alert`, `chart-column`, `ellipsis-vertical`…). Un nom inconnu n'affiche rien : `scripts/capture.mjs` liste les icônes non rendues, inutile de fouiller la bibliothèque. Si le produit a sa propre bibliothèque d'icônes, garder Lucide pour la maquette et noter l'équivalence dans les points ouverts.

## 8. Pièges connus

- **Valeurs arbitraires** (`w-[1280px]`) : très bien pour les cadres et les cas ponctuels. Une valeur arbitraire qui revient trois fois devient un token.
- **Opacité sur un token** (`bg-primary-soft/60`, `bg-ink/30`) : fonctionne, Tailwind passe par `color-mix`.
- **Classes générées en JavaScript** : le navigateur les détecte, mais elles sont invisibles à la lecture du HTML. Les écrire en clair dans le balisage.
- **Texte qui passe à la ligne** dans un champ ou un bouton étroit : `whitespace-nowrap` + `truncate` sur le texte.
- **Contenus qui débordent du cadre** : réduire le nombre de lignes plutôt que la taille du texte. Une maquette lisible vaut mieux qu'une maquette exhaustive.

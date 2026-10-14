# Partir d'un site ou d'un code existant

À utiliser quand la nouvelle fonctionnalité s'ajoute à un produit qui existe déjà : site public, application, back-office. L'identité n'est pas à inventer, il faut la **reproduire fidèlement**. La question devient : où et comment la fonctionnalité s'intègre-t-elle dans ce qui existe ?

## 1. Ce qu'il faut obtenir

- **Les pages concernées** : la page d'accueil ne suffit pas. Il faut la ou les pages où la fonctionnalité apparaîtra, et une page typique du même gabarit.
- **Le moyen d'accès**, du plus fiable au moins fiable :
  1. **Le code source** (dépôt local) : les valeurs exactes sont dans le code (`@theme`, `tailwind.config.*`, variables CSS, fichiers de tokens, thème MUI ou autre).
  2. **L'URL publique** : analyse des CSS servis et captures automatiques.
  3. **Des captures fournies par la personne** : obligatoire pour les pages derrière une authentification. Demander alors aussi les couleurs et polices si quelqu'un les connaît.
- **Ce qui ne doit pas changer** : composants imposés, zones interdites (en-tête commun à plusieurs sites…), contraintes de marque.

Ne reproduire que le produit de la personne ou de son organisation. Un site tiers cité comme inspiration sert de référence de structure ou d'interaction, jamais de modèle visuel à copier (marque, logo, couleurs).

## 2. Extraire

```bash
# Site en ligne : rapport + captures desktop, desktop page longue, mobile
node <skill>/scripts/extract-identity.mjs https://exemple.fr/espace-client --screenshots specs/ui/captures

# Code source : rapport + liste des fichiers de configuration à lire
node <skill>/scripts/extract-identity.mjs ./chemin/du/front
```

Le rapport donne les couleurs les plus utilisées avec les propriétés où elles apparaissent, les variables CSS, les polices, tailles, rayons, ombres, largeurs de conteneur, points de rupture, les liens de la navigation et des indices de framework.

**Regarder les captures** (outil de lecture d'image) : la fréquence d'une couleur ne dit pas son rôle. Le gris le plus fréquent peut être le texte ou une bordure ; la couleur de marque est souvent rare mais visible sur les boutons et les liens. Croiser rapport et captures.

Avec le code source, lire directement les fichiers signalés (`@theme`, configuration Tailwind, tokens) : ils priment sur le rapport.

Si les CSS ne se téléchargent pas (site rendu côté client, protection anti-robot), s'appuyer sur les captures et sur WebFetch pour le contenu, et le dire.

## 3. Traduire en tokens

Faire correspondre l'existant au vocabulaire commun (voir `tailwind.md`) dans `tokens.css` :

| Token | Où le trouver |
|---|---|
| `primary` | Fond des boutons principaux, liens, élément de navigation actif |
| `ink` / `muted` | Couleur du texte courant / des textes secondaires et libellés |
| `canvas` / `surface` / `surface-alt` | Fond de page / des cartes et blocs / des zones secondaires |
| `line` / `line-strong` | Séparateurs / bordures de champs |
| États | Messages d'erreur, de succès, alertes du site ; sinon à créer (voir plus bas) |
| Polices | `font-family` du corps et des titres, `@font-face`, Google Fonts chargées |
| Rayons, hauteurs, ombres | Boutons et champs existants, mesurés sur les captures ou lus dans le CSS |

- **Reprendre les valeurs exactes**, sans les « améliorer ». Si un contraste est insuffisant, le signaler dans les points ouverts, sans le corriger d'office.
- Commenter l'origine de chaque valeur dans `tokens.css` (`/* var --brand-blue du site */`, `/* mesuré sur le bouton « Valider » */`).
- Si le site utilise déjà Tailwind avec ses propres noms (`bg-brand-500`…), garder ses noms dans les maquettes plutôt que d'imposer le vocabulaire commun : la maquette doit parler la langue du code existant. Noter la correspondance en tête de `tokens.css`.
- Police non disponible sur Google Fonts (police propriétaire) : utiliser la plus proche (même famille de dessin, même chasse), et le noter dans les points ouverts.
- Token manquant (pas de couleur de succès sur le site, par exemple) : le créer dans l'esprit de la palette, le marquer `/* créé, à valider */` et l'ajouter aux points ouverts.

## 4. Caler la reproduction (écran E0)

Avant de dessiner quoi que ce soit de nouveau, reproduire une page existante en Tailwind, desktop et mobile : c'est l'écran **E0 · Existant**, badge « Existant ». Le placer dans les specs à côté de la capture réelle :

```html
<div class="grid gap-4 xl:grid-cols-2">
  <figure><figcaption class="mb-1.5 font-mono text-xs text-doc-muted">Capture du site · 13 oct. 2026</figcaption>
    <img src="captures/desktop.png" alt="Page Mon compte actuelle" class="rounded-xl border border-doc-line"></figure>
  <figure><figcaption class="mb-1.5 font-mono text-xs text-doc-muted">Reproduction Tailwind</figcaption> … cadre desktop … </figure>
</div>
```

La faire valider (« est-ce fidèle ? »). Les écarts relevés corrigent les tokens ou les coquilles, pas seulement E0. Une fois validée, la reproduction fournit les coquilles (`tpl-shell-desktop`, `tpl-shell-mobile`) de tous les écrans suivants : en-tête, navigation, pied de page du vrai site.

Pour publier en artifact avec les captures, passer les images dans `files` (chemin publié = chemin relatif utilisé dans `src`).

## 5. Proposer l'intégration plutôt que l'identité

À la place des trois propositions de l'étape 1A (le thème est celui du site), quand l'emplacement de la fonctionnalité n'est pas évident, proposer **deux ou trois options d'intégration** sur un écran clé : nouvelle page dans la navigation, onglet dans une page existante, panneau latéral, modale, étape ajoutée à un parcours… Même identité, structure différente, avec pour chacune ses points forts, ses points de vigilance et l'effort de développement pressenti. Les présenter dans les specs comme des écrans `E2-A`, `E2-B`, `E2-C`, et garder l'option retenue sous le numéro définitif.

## 6. Dans les specs

- Badge par écran : **Existant** (reproduit pour contexte), **Modifié** (écran existant qui change), **Nouveau**.
- Pour un écran modifié, dire dans la note ce qui change par rapport à l'existant, et entourer les zones modifiées avec une annotation.
- Les règles fonctionnelles distinguent ce qui existe déjà de ce que la fonctionnalité ajoute.

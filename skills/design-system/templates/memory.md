# Design system : mémoire

Mémoire courte du skill `design-system` pour cette application : à lire en premier en reprise, à tenir à jour à la fin
de chaque étape, sous 120 lignes. Les conventions sont dans `{{rule}}`, pas ici.

## Emplacements

| Rôle | Chemin |
|---|---|
| Application | `{{app}}` |
| Feuille d'entrée | `{{entry}}` |
| Tokens | `{{tokens}}` |
| Thème, classes | `{{styles}}/theme.css`, `{{styles}}/components.css` |
| Composants | `{{ui}}`, `{{components}}` |
| Documentation | `{{docs}}` (Storybook) |
| Conventions | `{{rule}}` |

## Mode et état

- Mode : {{mode}} (création à partir de l'existant, maintenance ou migration).
- Dernier audit ({{date}}) : à remplir avec les compteurs d'`audit.mjs` (erreurs, avertissements).

## Décisions

<!-- Une ligne par décision datée : nom d'un token, variante ajoutée, exception acceptée et sa raison. -->

## Migration

<!-- Lots restants (un lot = un dossier ou un composant), lot en cours, lint en warn ou en error. -->

## Versions

<!-- Versions épinglées de shadcn (CLI), Storybook, Tailwind, eslint-plugin-better-tailwindcss. -->

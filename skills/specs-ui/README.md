# specs-ui

Skill pour agents IA (Claude Code…) qui produit des **spécifications UI maquettées en HTML + Tailwind CSS**, pour itérer sur les fonctionnalités et le rendu d'une application avant de lancer les développements.

## Ce que fait ce skill

1. **Cadre** le point de départ : identité visuelle à définir, site existant ou charte fournie.
2. **Identité visuelle**
   - à définir : propose **trois propositions** qui diffèrent par la **disposition** (navigation, organisation de l'écran, manière de travailler) et par le **thème** (palette, typographie, formes, densité), sur le même écran en desktop et mobile. On choisit une proposition ou on combine (« disposition C avec le thème A »), en essayant les thèmes en direct sur la page ;
   - site existant : **extrait** couleurs, polices, rayons et structure (URL ou code source), puis reproduit une page existante pour caler la fidélité.
3. **Inventorie** les écrans et les parcours, et les fait valider avant de dessiner.
4. **Rédige les specs** en sources par écran (`specs/ui/sources/`), construites par `build.mjs` en un site multi-pages (une page par écran). Chaque écran a une maquette desktop (1280 × 820) et mobile (390 × 844), une note, le flux (Depuis / Ensuite) et des annotations numérotées. S'y ajoutent les règles fonctionnelles, les parcours, les points ouverts, le journal des itérations et une annexe sur l'identité.
5. **Itère** sur les retours, sans toucher aux écrans déjà validés.
6. **Publie** le site comme un seul artifact claude.ai multi-pages ; une mise à jour ne republie que les pages modifiées.
7. **Prépare la suite**, en option : Design System pour Claude Design, prototype cliquable (skill `prototype-ui`), cahier des charges (skill `requirements-doc`).
8. **Suit l'implémentation** : les specs vivent dans le dépôt de l'application (`specs/ui/`, site HTML commité), chaque écran porte son statut (À développer, En cours, Livré, Écart), et un écart constaté pendant le développement se reporte dans les specs, puis dans le prototype et le cahier des charges.

La mémoire du projet, `specs/ui/CONTEXTE.md`, permet de reprendre le travail sans relire les specs : les agents lisent et modifient de petits fichiers plutôt que des documents de 300 Ko.

Les tokens (`tokens.css`, bloc `@theme` Tailwind v4) et les classes des maquettes sont repris tels quels pendant les développements.

## Structure

```
specs/ui/
├── SKILL.md                         workflow
├── references/
│   ├── tailwind.md                  tokens, cadres, annotations, catalogue de composants
│   ├── qualite-ui.md                principes de qualité UI et grille de revue
│   ├── propositions.md              construire 3 propositions : disposition + thème
│   ├── site-existant.md             extraire et reproduire l'identité d'un site
│   └── redaction-specs.md           inventaire, anatomie d'un écran, états, itérations
├── templates/
│   ├── propositions.html            3 dispositions × 3 thèmes, combinables en direct
│   ├── specs.html                   document de specs (2 écrans d'exemple)
│   ├── tokens.css                   identité du produit
│   ├── contexte.md                  mémoire du projet (CONTEXTE.md)
│   ├── design-system.html           catalogue de composants exporté vers le Design System
│   └── design-sync/                 modèles du paquet « tokens seuls » pour Claude Design
└── scripts/
    ├── build.mjs                    construit un document depuis ses sources (tokens, coquilles, habillage, typographie)
    ├── split.mjs                    découpe un document existant en sources par écran
    ├── capture.mjs                  contrôles et captures (planche --sheet, --frames, --thumbnails, --themes)
    ├── check-contrast.mjs           contrôle WCAG AA des tokens
    ├── prepare-publish.mjs          pages à publier, --check : artifact en retard sur le site local
    ├── migrate-layout.mjs           range specs-ui/, prototype-ui/, cdc/ dans specs/
    ├── extract-identity.mjs         identité d'un site ou d'un code, captures
    ├── upgrade.mjs                  mise à niveau d'un document ancien sans sources
    ├── typography.mjs               typographie française
    ├── export-design-system.mjs     (facultatif) dossier Design System pour Claude Design
    └── design-sync-package.mjs      (facultatif) paquet « tokens seuls » envoyé par /design-sync
```

## Prérequis

- **Node.js 18+** pour les scripts (aucune dépendance).
- **Chrome ou Chromium** (facultatif) pour les captures de site et la vérification du rendu. Chemin personnalisé : variable `CHROME_PATH`.
- Navigateur avec accès à `cdn.jsdelivr.net` et Google Fonts pour afficher les maquettes (Tailwind et Lucide sont chargés depuis le CDN).

## Exemples de demandes

- « On démarre un back-office pour gérer les abonnements presse, rien n'est encore défini côté UI. Fais-moi des specs UI. »
- « Ajoute une page "Mes alertes" à notre espace client <https://exemple.fr/compte>, en gardant le style du site. »
- « Voici notre charte (bleu #003b71, police Marianne) : maquette le parcours de dépôt de dossier, desktop et mobile. »
- « Sur E3, remplace la modale par un panneau latéral et ajoute un filtre par auteur. »
- « E5 est livré, E6 est en cours ; sur E3 le code n'affiche pas Codex, note l'écart. »

## Installation

```bash
# Dans le projet courant (choix de l'agent en interactif)
npx skills add <source> --skill specs-ui

# Globalement, pour tous vos projets
npx skills add <source> --skill specs-ui -g
```

`<source>` vaut `<compte>/skills` depuis GitHub, ou le chemin d'une copie locale du dépôt (`~/www/skills`).

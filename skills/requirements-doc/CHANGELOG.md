# Journal des versions

## 1.1.0 · 14/10/2026

- **Page HTML pour l'artifact**, à la place du Markdown brut, peu lisible dans l'artifact. Le Markdown reste produit (fichier local et boutons de copie).
  - La conversion se fait au build et sans dépendance (`render.mjs`) : la page est complète dès le chargement, et les diagrammes `mermaid` sont rendus par l'artifact.
  - Contenu de la page (`templates/page.html`) :
    - sommaire latéral qui suit la lecture ;
    - recherche par identifiant ou écran (« CA-SESS-12 », « E13a ») ;
    - pastilles RF / CA / NF / DT / RQ, renvois cliquables vers les définitions ;
    - « Copier le Markdown » pour le document entier ou une partie ;
    - thème clair et sombre aux couleurs du produit, mobile.
  - Deux fichiers HTML : complet pour le local (diagrammes rendus par mermaid), sans enveloppe pour l'outil Artifact (`cdc/publish/`).
- Nom du document tiré du produit (`cdc.json` → `output`).
- Ancres en ASCII (les liens d'artifact ne transmettent que des ancres simples).
- `check.mjs` signale aussi les identifiants cités sans définition, et calcule les ancres comme le build.

## 1.0.0 · 14/10/2026

Première version.

- Extraction des specs (skill specs-ui 2.1 et plus) en Markdown :
  - inventaire des écrans ;
  - par lot, règles RF numérotées, écrans et états, parcours, règles d'écran et portée mobile ;
  - points ouverts ;
  - tokens.
- Une source par partie, avec gabarits ; assemblage par inclusions, ancres explicites et sommaire.
- Architecture déduite des besoins des specs, proposée en options, décisions DT validées. Stack et infrastructure détaillées : hébergement, environnements, réseau, CI/CD, IaC, observabilité, sauvegardes, sécurité, coûts.
- Découpage avec lot 0 « Socle », estimations en fourchettes, hypothèses et planning.
- Critères d'acceptation par lot, rédigés par des sous-agents depuis l'extraction.
- `check.mjs` :
  - parties manquantes, gabarits non remplis, liens cassés ;
  - lots sans fourchette, écrans non couverts ;
  - diagrammes non refermés, identifiants en double.
- Publication en artifact Markdown.

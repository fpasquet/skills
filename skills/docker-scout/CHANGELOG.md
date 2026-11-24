# Journal des versions

## 1.0.0 · 24/11/2026

- Première version : audit d'une image Docker avec Docker Scout, corrections mesurées, CI GitHub Actions, rapport HTML
  publié comme artifact. Éprouvé sur une image Node (Debian) et une image Python (Alpine) construites pour l'occasion,
  avec Docker 29 et Docker Scout 1.30.
- Scripts en TypeScript (`.mts`), exécutés directement par Node 22.18 ou plus, sans compilation ni dépendance :
  - `detect.mts` : état des lieux (Dockerfile, cible, image de base, secrets de build, registres privés, CI), écarts du
    Dockerfile, commande de build et questions à poser ;
  - `init.mts` : espace de travail `.docker-scout/` (configuration, mémoire, analyse), scans et rapport hors de git ;
  - `scan.mts` : une analyse normalisée, avec l'origine de chaque paquet. L'image de base exacte vient de l'attestation
    de provenance du build ; elle est analysée aussi, et un paquet est attribué à la base ou au projet par comparaison ;
  - `list.mts`, `compare.mts` : lecture filtrée d'un scan, écart entre deux scans ;
  - `bases.mts` : images de base candidates comparées ;
  - `vex.mts` : exceptions OpenVEX justifiées, visant une version exacte ;
  - `ci.mts` : workflow GitHub Actions (politiques `fixable`, `new`, `report`), Dependabot, liste des secrets à créer ;
  - `report.mts` : rapport HTML, dont tous les chiffres viennent des scans.
- Faux zéro signalé : dans une image distroless, Scout indexe les paquets Debian sous leur nom binaire (`libc6`) et n'en
  trouve aucune faille. Le scan, la comparaison des bases et le rapport le disent.
- Registre de paquets privé, `.npmrc`, miroir et registre d'images privé : rien par défaut, demandés quand `detect.mts`
  en trouve, et pris en charge du build local à la CI sans qu'une valeur de secret soit lue ni écrite.

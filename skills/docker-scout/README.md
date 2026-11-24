# docker-scout

Skill qui audite une image Docker avec [Docker Scout](https://docs.docker.com/scout/), corrige ses failles CVE, met en place le contrôle en CI et publie un rapport lisible.

Le rapport HTML, publié comme artifact ou ouvert comme un simple fichier, contient :

- la synthèse : failles par sévérité, corrigeables, exploitées (catalogue CISA KEV), politiques et health score ;
- l'origine de chaque faille : image de base, outils qu'elle embarque, paquets ajoutés par le Dockerfile, dépendances de l'application, et l'instruction du Dockerfile en cause ;
- les scénarios avant et après, mesurés par de nouveaux builds ou estimés ;
- les images de base comparées, et l'audit du Dockerfile ;
- le plan d'action, avec les fichiers à changer et les commandes ;
- la commande de build de production, le workflow GitHub Actions et les secrets à créer ;
- le tableau complet des failles, filtrable, et les exceptions acceptées.

## Installation

```bash
# Dans le projet courant (choix de l'agent en interactif)
npx skills add <source> --skill docker-scout

# Globalement, pour tous vos projets
npx skills add <source> --skill docker-scout -g
```

`<source>` vaut `<compte>/skills` depuis GitHub, ou le chemin d'une copie locale du dépôt (`~/www/skills`).

Il faut Docker avec Buildx, le plugin Docker Scout, un compte Docker Hub gratuit (`docker login`) et Node 22.18 ou plus. Le skill s'utilise depuis Claude Code ou un autre agent de code, pas depuis le chat claude.ai : il construit des images.

## Exemples de demandes

- « Audite l'image de production de ce projet avec Docker Scout et fais-moi un rapport. »
- « Corrige les CVE critiques et hautes de mon image, en vérifiant qu'elle démarre toujours. »
- « Quelle image de base choisir pour réduire les failles ? »
- « Mets Docker Scout dans la CI GitHub Actions et bloque les nouvelles failles. »
- « Nos paquets viennent d'un registre npm privé : adapte le build et la CI. »
- « Cette CVE ne nous concerne pas, écarte-la proprement. »
- « Refais l'audit du mois dernier et mets le rapport à jour. »

## Registres privés

Par défaut, le skill suppose que tout est public. S'il trouve un registre privé dans la configuration ou les lockfiles (`.npmrc`, `pip.conf`, `composer.json`…), un secret de build ou une image de base sur un registre non public, il pose les questions utiles, puis adapte la commande de build et le workflow. Il ne lit et n'écrit aucune valeur de secret : c'est vous qui vous connectez et qui créez les secrets GitHub.

## Ce que le skill pose dans le projet

```text
<app>/
├── .docker-scout/
│   ├── scout.json            # image, build, plateforme, URL de l'artifact
│   ├── SCOUT.md              # mémoire de l'audit
│   ├── analysis.json         # partie rédigée du rapport
│   ├── scans/                # analyses (hors de git)
│   └── report.html           # rapport (hors de git)
├── .vex/                     # exceptions justifiées, lues par la CI
└── .github/
    ├── workflows/docker-scout.yml
    └── dependabot.yml        # s'il n'existe pas
```

Les corrections du Dockerfile et des dépendances se font par lots, avec votre accord, chacune mesurée par un nouveau build. Rien n'est poussé ni publié sans votre accord.

## Contenu

| Chemin | Rôle |
|---|---|
| `SKILL.md` | Méthode : repérer, construire, analyser, corriger, exceptions, CI, rapport, reprise |
| `scripts/detect.mts` | État des lieux du projet et du Dockerfile, en lecture seule |
| `scripts/init.mts` | Espace de travail de l'audit |
| `scripts/scan.mts` | Analyse d'une image ou du code source, avec l'origine de chaque paquet |
| `scripts/list.mts`, `compare.mts`, `bases.mts` | Lecture filtrée, écart entre deux scans, images de base comparées |
| `scripts/vex.mts` | Exceptions OpenVEX |
| `scripts/ci.mts` | Workflow GitHub Actions et Dependabot |
| `scripts/report.mts` | Rapport HTML |
| `references/` | Build et registres, corrections par écosystème, GitHub Actions, rapport |
| `templates/` | Style et interactions du rapport, mémoire, analyse, versions des actions |

Les scripts sont en TypeScript, sans compilation ni dépendance : Node retire les types à l'exécution.

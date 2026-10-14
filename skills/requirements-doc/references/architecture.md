# Architecture, stack technique et infrastructure

Méthode pour les parties 6 (architecture), 7 (stack) et 8 (infrastructure). Les specs sont purement fonctionnelles : la technique se **déduit** de ce qu'elles demandent, se **propose** en options, puis se **décide** avec la personne. Rien ne s'écrit comme acquis sans sa validation.

Sommaire : 1. Lire les besoins dans les specs · 2. Les décisions à prendre · 3. Proposer et décider · 4. Rédiger l'architecture · 5. Rédiger la stack · 6. Rédiger l'infrastructure · 7. Diagrammes

## 1. Lire les besoins dans les specs

Partir des règles fonctionnelles (**RF-…**) et des écrans. Chaque besoin technique cite la règle ou l'écran qui le justifie. Signaux fréquents :

| Ce que disent les specs | Besoin technique |
|---|---|
| Mise à jour en direct (« il y a 4 s », état qui change seul, notifications) | Temps réel : WebSocket ou SSE, bus d'événements |
| Événements reçus d'outils externes (webhooks, rattrapage périodique) | Point d'entrée signé, file de messages, tâches planifiées, idempotence |
| Traitements longs (agent qui travaille, clonage, tests) | Workers asynchrones, orchestration de tâches, reprise après erreur |
| Exécution isolée de code ou de commandes | Sandboxes : conteneurs ou micro-VM éphémères, quotas, réseau sortant filtré |
| Connexion avec un compte externe (GitHub, Slack, Jira) | OAuth, stockage chiffré des jetons, renouvellement, révocation |
| Secrets fournis par les utilisateurs | Coffre de secrets, chiffrement, jamais réaffichés, journal d'accès |
| Organisations, équipes, rôles | Multi-tenant, contrôle d'accès par rôle, isolement des données |
| Historique, traçabilité, configuration figée | Journal d'audit, versions immuables, empreintes |
| Recherche, filtres, palette de commandes | Index de recherche ou requêtes plein texte |
| Fichiers, pièces jointes, journaux volumineux | Stockage objet, rétention |
| Mobile « complet pour le suivi » | Front responsive (ou PWA), notifications push si demandées |

Noter aussi les **volumes** (nombre d'utilisateurs, de projets, de tâches par jour), les **contraintes** (souveraineté, RGPD, SSO) et les **compétences de l'équipe**. Ce qu'on ignore se demande (étape 3), sans s'inventer.

## 2. Les décisions à prendre

Chaque décision structurante devient une entrée **DT-xx**. Liste de contrôle, à adapter (ignorer ce qui ne concerne pas le produit) :

- **Application** : monolithe modulaire ou services, rendu (SPA, SSR), style d'API (REST, GraphQL, RPC), temps réel.
- **Données** : base principale, cache, recherche, stockage objet, migrations, multi-tenant (schéma partagé avec clé d'organisation, ou base par client).
- **Asynchrone** : file de messages, workers, planification, idempotence, reprise.
- **Exécution isolée** (si le produit en a) : technologie, durée de vie, quotas, réseau, nettoyage.
- **Identité** : authentification (OAuth fournisseur, SSO), sessions, autorisations, comptes de service.
- **Intégrations** : par service externe (mode, limites d'appels, erreurs, renouvellement).
- **Front** : framework, Tailwind CSS v4 et les tokens des specs (imposés : la parité avec les maquettes en dépend), composants, état côté client, tests.
- **Hébergement** : fournisseur, services managés ou auto-hébergés, régions.
- **Livraison** : dépôts (monorepo ou non), CI/CD, environnements, IaC.
- **Exploitation** : observabilité, sauvegardes, astreinte, coûts.

## 3. Proposer et décider

1. Demander d'abord les **contraintes** (AskUserQuestion, une seule série) : hébergement imposé ou souhaité, langages et frameworks maîtrisés par l'équipe, contraintes de sécurité et de conformité, volumes attendus, budget d'infrastructure. Toujours proposer une option « pas de contrainte ».
2. Pour chaque décision structurante, préparer **2 ou 3 options réalistes** compatibles avec ces contraintes, avec une recommandation. Les présenter par AskUserQuestion, **4 questions au plus par série** et 2 séries au plus. Les décisions secondaires (outillage, bibliothèques) se tranchent par défaut, avec une recommandation notée « à valider » dans `CDC.md`.
3. Chaque option tient en une ligne : ce que c'est, pour quoi elle est bonne, son coût principal. Recommander la plus simple qui couvre les besoins de la partie 1 : pas de microservices ni de Kubernetes sans besoin démontré.
4. Noter chaque décision dans `CDC.md` (« Décisions techniques ») avant de rédiger : `DT-03 · Asynchrone · file X + workers (14/10) · écartés : Y (raison), Z (raison)`.

## 4. Rédiger l'architecture (partie 6)

- **Vue d'ensemble** : diagramme de contexte (acteurs, application, services externes) et un paragraphe.
- **Composants** : diagramme des conteneurs (front, API, workers, base, file, stockage, sandboxes…), puis une ligne par composant : rôle, technologie (renvoi à la stack), lots qui l'utilisent.
- **Flux principaux** : 2 à 4 diagrammes de séquence choisis parmi les flux qui structurent l'architecture (réception d'un événement externe, lancement et suivi d'une tâche longue, connexion OAuth, réponse à une demande).
- **Modèle de données** : entités tirées des objets des specs (mêmes noms que l'interface), relations, cardinalités, règles d'intégrité qui viennent des RF ; `erDiagram` pour le cœur, une liste pour le reste.
- **Intégrations** : tableau par service (usage, mode, limites d'appels, erreurs, renouvellement des accès).
- **Sécurité applicative** : authentification, autorisations (matrice de la partie 2), isolement des organisations, secrets, audit.
- **Décisions** : les entrées **DT-xx**, une par paragraphe court (contexte, décision, options écartées, conséquences).

## 5. Rédiger la stack (partie 7)

Un tableau par couche : **choix, version majeure, justification (liée à un besoin ou une contrainte), alternatives écartées**. Couches : front, back, API, base de données, cache, recherche, file et workers, temps réel, stockage, authentification, SDK d'intégration, tests (unitaires, intégration, bout en bout), qualité (lint, format, typage), organisation du code (monorepo, conventions). Puis un court paragraphe par couche quand un choix appelle des précisions (structure des dossiers, conventions de nommage, gestion des versions).

## 6. Rédiger l'infrastructure (partie 8)

Détailler, chaque fois avec le choix et la raison :

- **hébergement** : fournisseur, régions, services managés, contraintes de localisation des données ;
- **environnements** : dev, recette, préproduction, production ; données de chaque environnement (jeux de test, anonymisation) ; mode de déploiement ;
- **topologie et réseau** : entrées (CDN, répartiteur, WAF), réseaux privés, flux sortants autorisés (essentiel pour des exécutions isolées) ;
- **conteneurs et exécution** : images, orchestration, mise à l'échelle, quotas des tâches isolées ;
- **CI/CD** : étapes (lint, tests, build, analyse de sécurité, déploiement), stratégie de branches, revues, déploiement progressif, retour arrière ;
- **IaC, configuration et secrets** : outil, organisation, rotation des secrets ;
- **observabilité** : logs structurés, métriques, traces, tableaux de bord, alertes, SLO chiffrés (repris des NF) ;
- **sauvegardes et reprise** : fréquence, rétention, RPO et RTO, tests de restauration ;
- **sécurité** : IAM et moindre privilège, chiffrement au repos et en transit, analyses de dépendances et d'images, correctifs ;
- **mise à l'échelle et capacité** : ce qui grossit avec l'usage, limites connues ;
- **coûts** : fourchette mensuelle par poste (calcul, base, stockage, réseau, observabilité, services tiers) pour un volume donné, hypothèses écrites.

## 7. Diagrammes

En blocs ` ```mermaid ` : `flowchart` (contexte, conteneurs, réseau), `sequenceDiagram` (flux), `erDiagram` (données), `gantt` (planning). Libellés en français, noms des objets identiques aux specs, 15 nœuds au plus par diagramme. Chaque diagramme est suivi d'une phrase qui dit ce qu'il montre.

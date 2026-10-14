# CONTEXTE · {{Produit}}

Mémoire du projet de specs UI. À lire en premier à chaque reprise, à mettre à jour à la fin de chaque étape.
Moins de 200 lignes : renvoyer vers les sources plutôt que recopier. Dernière mise à jour : {{JJ/MM/AAAA}}.

## État

Site construit dans `site/`, publié comme un seul artifact : {{URL}} (aussi dans `sources/site.json`).

| Lot | Sources | Écrans | Itération | Statut |
|---|---|---|---|---|
| Propositions et décision | `propositions.html` | écran représentatif | — | Décision du {{date}} |
| 1 · {{nom}} | `sources/{{lot}}/` | E1–E3 | 1 | En relecture |

- **Implémentation** : {{pas commencée | statut suivi dans `lot.json` → status (`site.json` → implementation), dépôt de l'application : …}}

**Prochaine étape** : {{ce qui doit être fait ensuite, et par qui}}

## Décisions

- {{date}} · {{décision}} ({{où elle est reportée : règle, écran}})

## Hypothèses en cours

- {{hypothèse}} ({{écrans concernés}})

## Identité et disposition

- **Thème** : {{nom}}, dans `tokens.css` ({{luminosité, couleur principale, polices, densité}}).
- **Disposition** : {{structure : navigation, organisation des écrans}} ; interactions : {{raccourcis, panneaux…}}.
- **Coquilles** (`sources/shared/shells.html`) : `tpl-shell-desktop` ({{contenu}}), `tpl-shell-mobile` ({{contenu}}).
  - `data-nav` : {{liste des identifiants}}
  - `data-zone` : {{liste des zones retirables}}
- **Polices** (`lot.json` → `fonts`) : {{URL Google Fonts}}

## Personas et fil rouge

- {{Nom}} : {{rôle, droits}}
- Exemple suivi : {{projet, objets, identifiants, dates}}, à garder cohérent d'un écran à l'autre.

## Faits du fil rouge (chaînes exactes)

Tout ce qu'un écran doit reprendre à l'identique : un agent ne doit jamais avoir à chercher ces valeurs dans les sources.
- Identifiants : {{tickets, sessions, PR, commandes…}}
- Libellés et canaux : {{label, statut, canal Slack…}}
- Chronologie : {{qui fait quoi, quand (date, heure)}}
- Réglages : {{règles, limites, abonnements…}}

## Inventaire (référence de numérotation)

| ID | Écran | États (ancres) | Lot / document | Statut |
|---|---|---|---|---|
| E1 | {{écran}} | `#e1a` {{état}}, `#e1b` {{état}} | 1 · {{lot}}.html | Fait (it. 1) |

Ordre des lots : {{1, 5, 3…}}. Nouveaux écrans : numéro libre suivant ou lettre (`E5c`).

## Conventions propres au projet

- Écrans modèles à copier : {{fichier → ce qu'il montre (panneau, page à onglets, conversation…)}}
- Composants partagés (`sources/shared/components.html`) : {{tpl-… → rôle, slots}}
- {{motifs de calque, badges, vocabulaire technique repris}}

## Préférences

- Design System Claude Design : {{oui (dossier `design-system/`, synchronisé avec /design-sync le …) | non | pas encore demandé}}

## Points ouverts (résumé)

- {{question}} · {{qui tranche}} · {{écrans}}

# Le rapport

`report.mts` assemble la page à partir de quatre sources : les scans (tous les chiffres), `analysis.json` (ce qui se rédige), `detect.json` (Dockerfile) et `bases.json` (images comparées). Une section sans matière n'apparaît pas.

| Section | Vient de |
|---|---|
| Synthèse, politiques, origine, instructions, paquets | scan `reference`, et `target` pour l'après |
| Constats | `findings` |
| Scénarios | `scenarios` |
| Images de base | `bases.json` |
| Dockerfile | `detect.json`, `dockerfile` |
| Plan d'action | `actions` |
| Build | `scout.json`, `build` |
| CI | `ci`, et le contenu du workflow |
| Exceptions | `.vex/` |
| Détail filtrable, commandes | scans |

## analysis.json

```json
{
 "title": "Audit Docker Scout de l’image api",
 "pageTitle": "Audit Scout api",
 "lead": "Image `api` construite depuis `main` (commit `abc1234`), cible `production`, le 24 novembre 2026.",
 "context": [["Branche", "main"], ["Commit", "abc1234"]],
 "reference": "current",
 "target": "final",
 "source": "source",
 "scenarios": [
  { "label": "Image actuelle", "scan": "current" },
  { "label": "Image de base à jour", "scan": "base-updated" },
  { "label": "Base à jour, sans npm", "from": "base-updated", "without": { "origins": ["base-tools"] } }
 ],
 "originNotes": { "app-os": "`curl` amène Kerberos et LDAP." },
 "findings": [
  {
   "title": "L’image de base n’est plus reconstruite",
   "level": "error",
   "body": "À elle seule, elle porte {{current.base.total}} failles, dont {{current.base.C}} critiques.",
   "table": { "head": ["", "Actuelle", "À jour"], "rows": [["Failles", "{{current.total}}", "{{base-updated.total}}"]] }
  }
 ],
 "actions": [
  {
   "title": "Mettre à jour l’image de base",
   "status": "done",
   "gain": { "from": "current", "to": "base-updated" },
   "body": "Passer à Node 24 sur Debian 13, épinglé par digest.",
   "code": [{ "title": "Dockerfile", "text": "FROM node:24-trixie-slim@sha256:…" }]
  },
  {
   "title": "Monter les dépendances",
   "gain": { "from": "current", "without": { "packages": ["lodash", "qs"] } },
   "body": "Deux montées mineures.",
   "packages": [{ "name": "qs", "by": "`express` 4.17.1", "fix": "Passer express à 4.22" }]
  }
 ],
 "dockerfile": { "intro": "", "fixed": ["root-user"], "notes": { "wide-copy": "`.git` et les tests partaient dans l’image." } },
 "build": [{ "title": "Secret npm", "body": "Le build attend le fichier `.npmrc` du poste.", "code": [{ "text": "docker build --secret id=npmrc,src=$HOME/.npmrc ." }] }],
 "ci": { "intro": "Le workflow bloque les failles critiques et hautes corrigeables.", "steps": [{ "title": "Premier passage", "body": "…" }] }
}
```

- `level` d'un constat : `error`, `warning`, `info`, `ok`. `status` d'une action : `todo`, `done`, `accepted`.
- `gain` avec `to` est **mesuré** (deux scans), avec `without` **estimé** (scan privé d'origines, de paquets ou de `cves`). Une estimation par origine ignore les paquets présents aussi ailleurs dans l'image.
- Textes : `` `code` ``, `**gras**`, liens `[texte](https://…)`, listes `-`, paragraphes séparés par une ligne vide.
- `packages` d'une action : préciser `version` quand le paquet existe en plusieurs versions (`--check` le signale).
- Champs variables : liste en tête de `report.mts`. `--check` refuse un champ, un scan ou un paquet inconnu, et signale un chiffre écrit à la main ou une CVE absente des scans.
- `ci.mts` remplit `ci.workflow` et `ci.secrets`.

## Rédiger

- **Un constat dit une cause**, pas une liste : miroir périmé, version de moteur abandonnée, outils de build dans l'image. Un à trois constats.
- **Une action est faisable par quelqu'un qui n'a pas suivi l'audit** : fichier, commande exacte, risque, ce qu'il faut tester. Dans l'ordre d'impact.
- Séparer ce qui est **mesuré**, **estimé** et **supposé**.
- Dire aussi ce qui **reste** et pourquoi : pas de correctif, montée majeure à planifier, analyse incomplète.
- Ni jeton, ni adresse interne inutile, ni nom de personne.

## Plusieurs images

`overview.mts .docker-scout` construit `site/index.html` (vue d'ensemble) et `site/<image>.html`. Il lit `.docker-scout/overview.json` :

```json
{
 "title": "Audit Docker Scout du projet", "pageTitle": "Audit Scout projet", "lead": "…",
 "artifact": "", "order": ["api", "web"], "source": "source",
 "findings": [{ "title": "…", "level": "warning", "body": "L’API passe de {{api:current.total}} à {{api:final.total}} failles." }],
 "steps": [{ "title": "Analyser dans le job existant", "body": "…", "code": [{ "title": ".github/workflows/ci.yml", "text": "…" }] }]
}
```

- `source` est un scan de `.docker-scout/scans/`, commun aux images. `package` de chaque `scout.json` (`apps/web`) dit quelles dépendances de production sont celles d'une image.
- `findings` et `steps` portent ce qui est commun ; ce qui ne concerne qu'une image reste dans son `analysis.json`.
- Publication : `file_path`, `root` et `files` affichés par le script, toujours vers la même `url`. Si l'outil refuse un dossier hors du répertoire de travail, copier `site/` dans un dossier autorisé.

## Publier

Outil Artifact, `file_path` : `<dir>/report.html` ; `icon` : `shield` à la première publication ; `url` ensuite. Le titre vient de `pageTitle` (deux à quatre mots). La page fonctionne aussi ouverte comme un fichier : thème clair et sombre, filtres, copie des commandes.

L'artifact est privé. Il décrit des failles ouvertes : le rappeler avant un partage, et préférer un partage nominatif à un lien public.

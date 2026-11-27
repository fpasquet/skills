/**
 * Lecture du projet de specs (skill specs-ui), partagée par les scripts du skill : groupes d'écrans, découpage,
 * statuts d'implémentation, états à livrer, identifiants des règles.
 *
 * Découpage (specs : site.json → grouping) : « lots » par défaut (produit à construire, la partie 9 découpe en lots
 * chiffrés), « features » pour un produit existant ou livré (la partie 9 chiffre les évolutions, et n'existe pas s'il
 * n'y a rien à livrer). Les dossiers des specs et les fichiers du cahier des charges gardent leur nom technique
 * (lot.json, lots/<groupe>-criteres.md, generated/lot-<groupe>.md) dans les deux cas.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORDS = {
  lots: { one: 'lot', plural: 'lots', column: 'Lot', of: 'du lot', each: 'lot par lot' },
  features: { one: 'fonctionnalité', plural: 'fonctionnalités', column: 'Fonctionnalité', of: 'de la fonctionnalité', each: 'fonctionnalité par fonctionnalité' },
};
export const wordsOf = (grouping) => WORDS[grouping] ?? WORDS.lots;

export const STATUS_LABELS = { todo: 'À développer', doing: 'En cours', done: 'Livré', change: 'À faire évoluer', gap: 'Écart' };
const codeOf = (raw) => (typeof raw === 'string' ? raw : raw?.status);

/** site.json, découpage et groupes (dans l'ordre du site) d'un projet de specs. */
export function readSpecs(specsDir) {
  const siteFile = join(specsDir, 'sources', 'site.json');
  const site = existsSync(siteFile) ? JSON.parse(readFileSync(siteFile, 'utf8')) : { lots: [] };
  const grouping = site.grouping === 'features' ? 'features' : 'lots';
  const groups = (site.lots ?? [])
    .filter((name) => existsSync(join(specsDir, 'sources', name, 'lot.json')))
    .map((name) => {
      const lot = JSON.parse(readFileSync(join(specsDir, 'sources', name, 'lot.json'), 'utf8'));
      return { name, label: lot.label ?? name, screens: lot.screens ?? {}, status: lot.status ?? {} };
    });
  return { site, grouping, words: wordsOf(grouping), tracking: site.implementation === true, groups };
}

/** Statut d'un écran (todo par défaut). */
export const screenCode = (group, screen) => codeOf(group.status[screen]) ?? 'todo';

/** Statut d'un état : le sien, sinon celui de l'écran ; les états d'un écran « À faire évoluer » sans statut propre sont livrés. */
export function stateCode(group, state, screen) {
  if (group.status[state] !== undefined) return codeOf(group.status[state]);
  const code = screenCode(group, screen);
  return code === 'change' ? 'done' : code;
}

/**
 * Écrans qui ont quelque chose à livrer : statut de l'écran autre que « Livré », ou un état marqué autrement.
 * Sans suivi de l'implémentation (site.json → implementation), tous les écrans le sont.
 */
export function deliverableScreens({ groups, tracking }) {
  return groups.flatMap((group) =>
    Object.keys(group.screens)
      .filter((screen) => !tracking || screenCode(group, screen) !== 'done' || Object.entries(group.status).some(([key, raw]) => key !== screen && key.match(/^e\d+/i)?.[0].toLowerCase() === screen && codeOf(raw) !== 'done'))
      .map((screen) => ({ group, screen })),
  );
}

/**
 * Identifiants des règles d'un groupe, dans l'ordre : une règle marquée data-rf="CONN-03" (posé par regroup.mjs du
 * skill specs-ui quand elle change de groupe) garde le sien ; les autres sont numérotées avec le préfixe du groupe (4
 * premières lettres du dossier), en sautant les numéros déjà pris. Sans marque, c'est la numérotation d'origine.
 */
export function ruleIds(marks, groupName) {
  const prefix = groupName.toUpperCase().slice(0, 4);
  const taken = new Set(marks.filter(Boolean));
  let n = 0;
  return marks.map((mark) => {
    if (mark) return `RF-${mark}`;
    let id;
    do id = `${prefix}-${String(++n).padStart(2, '0')}`;
    while (taken.has(id));
    return `RF-${id}`;
  });
}

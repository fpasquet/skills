/**
 * Assemblage des sources du cahier des charges, partagé par build.mjs (document complet) et export.mjs (fichiers
 * pour le dépôt de l'application) : inclusions, ancres des titres, sources dans l'ordre.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Ancres de titres façon GitHub : minuscules, sans ponctuation, espaces → tirets
export const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

/** Sources des parties (00-titre.md, 10-presentation.md…), dans l'ordre de leur préfixe numérique. */
export const sourceFiles = (sourcesDir) =>
  readdirSync(sourcesDir)
    .filter((f) => /^\d+-.*\.md$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

/**
 * Remplace chaque <!-- include: generated/lot-sessions.md [shift=N] --> par le fichier indiqué (chemin relatif à
 * sources/), sans son commentaire d'en-tête. Les chemins introuvables vont dans `missing`.
 */
export function include(sourcesDir, text, missing = [], depth = 0) {
  return text.replace(/<!--\s*include:\s*([^\s>]+)(?:\s+shift=(\d+))?\s*-->/g, (_, path, shiftArg) => {
    const file = join(sourcesDir, path);
    if (!existsSync(file) || depth > 3) {
      missing.push(path);
      return `> **Fichier manquant** : \`${path}\``;
    }
    let content = include(sourcesDir, readFileSync(file, 'utf8').replace(/^<!--[\s\S]*?-->\s*/, ''), missing, depth + 1);
    const shift = shiftArg === undefined ? 0 : Number(shiftArg);
    if (shift) content = content.replace(/^(#{1,5}) /gm, (m, hashes) => `${'#'.repeat(Math.min(hashes.length + shift, 6))} `);
    return content.trim();
  });
}

/**
 * Titres des niveaux donnés (hors blocs de code) : ancre explicite <a id> devant le texte, quel que soit le moteur
 * de rendu Markdown. Renvoie le texte et la liste des titres ({ level, text, id }).
 */
/** Blocs de code délimités par ``` en début de ligne, capturés pour que split les garde aux rangs impairs. */
export const CODE_BLOCKS = /(^ {0,3}```[^\n]*\n[\s\S]*?^ {0,3}```[^\n]*$)/gm;

export function anchorHeadings(doc, minLevel = 2, maxLevel = 3) {
  const headings = [];
  const pattern = new RegExp(`^(#{${minLevel},${maxLevel}}) (?!<a id=)(.+)$`, 'gm');
  const text = doc
    // Blocs de code : une clôture en début de ligne ; trois accents graves dans une phrase n'en ouvrent pas
    .split(CODE_BLOCKS)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(pattern, (_, hashes, title) => {
            const id = slug(title);
            headings.push({ level: hashes.length, text: title.trim(), id });
            return `${hashes} <a id="${id}"></a>${title}`;
          }),
    )
    .join('');
  return { text, headings };
}

#!/usr/bin/env node
/**
 * Résume les pages d'un prototype pour écrire les fiches de câblage sans lire tout leur HTML.
 *
 * Usage : node outline.mjs prototype-ui e3 [e4 …] [--chars 700] [--specs]
 *         node outline.mjs prototype-ui --shells
 *
 * Pour chaque état d'une page générée (sections data-state) : ses lignes dans le fichier (à lire avec
 * offset / limit plutôt que la page entière), le texte de la version desktop (tronqué à --chars
 * caractères), les actions (boutons, liens), les champs, les blocs partagés utilisés (data-use) et la
 * présence d'une version mobile. Une page déjà câblée (sans sections) est résumée d'un bloc.
 * --specs lit src/_from-specs/ (version des specs à reporter).
 * --shells résume src/shells.html : chaque template avec ses lignes, sa taille, ses entrées de navigation,
 * ses emplacements (data-slot), ses zones et s'il est déjà vivant (directives Alpine).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const chars = Number(args.includes('--chars') ? args[args.indexOf('--chars') + 1] : 700);
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--chars');
const [input, ...screens] = positional;
const root = input && resolve(input);
const dir = root && join(root, 'src', args.includes('--specs') ? '_from-specs' : 'pages');
const shellsMode = args.includes('--shells');
if (!root || (!screens.length && !shellsMode) || !existsSync(dir)) {
  console.error('Usage: node outline.mjs prototype-ui e3 [e4 …] [--chars 700] [--specs] | prototype-ui --shells');
  process.exit(2);
}
const lineOf = (html, index) => html.slice(0, index).split('\n').length;

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<template[\s\S]*?<\/template>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const unique = (list) => [...new Set(list.filter(Boolean))];

function describe(html) {
  // Version mobile : à partir du premier bloc « lg:hidden » (desktop avant)
  const mobileAt = html.search(/<div[^>]*class="lg:hidden\b/);
  const desktop = mobileAt > 0 ? html.slice(0, mobileAt) : html;
  const actions = unique([...desktop.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => text(m[2])).filter((t) => t.length <= 48));
  const fields = unique([...desktop.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)].map((m) => {
    const placeholder = m[0].match(/placeholder="([^"]*)"/)?.[1];
    const value = m[0].match(/\svalue="([^"]*)"/)?.[1];
    const type = m[0].match(/type="([^"]*)"/)?.[1];
    return [type && type !== 'text' ? type : null, placeholder && `« ${decode(placeholder)} »`, value && `= ${decode(value)}`].filter(Boolean).join(' ') || 'champ';
  }));
  const blocks = unique([...html.matchAll(/data-use="([^"]+)"/g)].map((m) => m[1]));
  const body = text(desktop);
  return [
    `  texte : ${body.length > chars ? body.slice(0, chars) + ' …' : body}`,
    actions.length ? `  actions : ${actions.join(' · ')}` : null,
    fields.length ? `  champs : ${fields.join(' · ')}` : null,
    blocks.length ? `  blocs : ${blocks.join(', ')}` : null,
    `  mobile : ${mobileAt > 0 ? `oui (${text(html.slice(mobileAt)).length} caractères)` : 'non (version desktop à toutes les tailles)'}`,
  ].filter(Boolean).join('\n');
}

if (shellsMode) {
  const html = readFileSync(join(root, 'src', 'shells.html'), 'utf8');
  console.log(`== src/shells.html (${Math.round(html.length / 1024)} Ko, ${html.split('\n').length} lignes)`);
  // Seuls les templates de premier niveau ont un id (les <template x-for> imbriqués n'en ont pas)
  for (const start of html.matchAll(/<template id="([^"]+)">/g)) {
    let depth = 0;
    let end = html.length;
    for (const m of html.slice(start.index).matchAll(/<template\b|<\/template>/g)) {
      depth += m[0] === '</template>' ? -1 : 1;
      if (depth === 0) {
        end = start.index + m.index + 11;
        break;
      }
    }
    const t = html.slice(start.index, end);
    const list = (rx) => unique([...t.matchAll(rx)].map((m) => m[1])).join(', ');
    const nav = list(/data-nav="([^"]+)"/g);
    const slots = list(/data-slot="([^"]+)"/g);
    const zones = list(/data-zone="([^"]+)"/g);
    const live = /\sx-(data|for|show|text|init)\b|:href=/.test(t);
    console.log(`- ${start[1]} · lignes ${lineOf(html, start.index)}–${lineOf(html, end)} · ${Math.round(t.length / 1024)} Ko${live ? ' · vivant' : ''}`);
    if (nav) console.log(`  nav : ${nav}`);
    if (slots) console.log(`  slots : ${slots}`);
    if (zones) console.log(`  zones : ${zones}`);
  }
  process.exit(0);
}

for (const screen of screens) {
  const file = join(dir, `${screen.toLowerCase().replace(/\.html$/, '')}.html`);
  if (!existsSync(file)) {
    console.log(`== ${screen} : introuvable (${file})\n`);
    continue;
  }
  const html = readFileSync(file, 'utf8');
  const title = html.match(/^<!--\s*\n\s*(.+)/)?.[1]?.trim() ?? screen.toUpperCase();
  const sections = [...html.matchAll(/<section data-state="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  const wired = !html.includes('data-proto-static');
  console.log(`== ${title}${wired ? ' (câblée)' : ''} · ${Math.round(html.length / 1024)} Ko, ${html.split('\n').length} lignes`);
  if (sections.length) {
    for (const m of sections) {
      const [, state, content] = m;
      console.log(`- état ${state} (?state=${state}) · lignes ${lineOf(html, m.index)}–${lineOf(html, m.index + m[0].length)}\n${describe(content)}`);
    }
  } else {
    console.log(describe(html.replace(/^<!--[\s\S]*?-->/, '')));
  }
  console.log('');
}

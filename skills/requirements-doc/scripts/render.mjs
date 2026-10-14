/**
 * Conversion Markdown → HTML du cahier des charges, sans dépendance.
 *
 * Couvre ce que produisent les sources et l'extraction : titres (avec <a id> explicite), paragraphes,
 * listes imbriquées (puces et numéros, paragraphes de suite indentés), tableaux (\| échappé), blocs de
 * code (```mermaid → <pre class="mermaid">), citations, gras, italique, code, liens, commentaires HTML.
 * Les identifiants en gras (RF-…, CA-…, NF-…, DT-…, RQ-…) deviennent des pastilles.
 */
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(escape(c)) - 1}\u0000`);
  // Ancres explicites <a id="…"></a> et <br>, seules balises gardées
  const anchors = [];
  s = s.replace(/<a id="([^"]+)"><\/a>/g, (_, id) => `\u0001${anchors.push(id) - 1}\u0001`).replace(/<br\s*\/?>/g, '\u0002');
  s = escape(s);
  s = s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href.replace(/"/g, '%22')}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`)
    .replace(/\*\*([^*]+?)\*\*/g, (_, t) => {
      // « **DT-02 · Sandboxes…** » : pastille pour l'identifiant, le reste en gras
      const titled = t.match(/^((RF|CA|NF|DT|RQ)-[A-Z0-9-]+?)\s+·\s+([\s\S]+)$/);
      if (titled) return `<strong class="id id-${titled[2].toLowerCase()}" id="${titled[1].toLowerCase()}">${titled[1]}</strong> <strong>${titled[3]}</strong>`;
      const id = t.match(/^(RF|CA|NF|DT|RQ)-[A-Z0-9-]+$/);
      return id ? `<strong class="id id-${id[1].toLowerCase()}" id="${t.toLowerCase()}">${t}</strong>` : `<strong>${t}</strong>`;
    })
    .replace(/~~([^~]+?)~~/g, '<del>$1</del>')
    .replace(/(^|[\s(«])\*([^*\s][^*]*?)\*(?=[\s).,;:!?»]|$)/g, '$1<em>$2</em>')
    .replace(/\u0001(\d+)\u0001/g, (_, i) => `<span id="${anchors[i]}" class="anchor"></span>`)
    .replace(/\u0002/g, '<br>')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  return linkIds(s);
}

// Renvois à un identifiant dans le texte (« RF-SESS-06 ») : lien vers sa définition, hors balises,
// hors liens existants et hors pastilles de définition
function linkIds(html) {
  let skip = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<(a\b|strong class="id|code\b)/.test(part)) skip++;
        else if (/^<\/(a|strong|code)>/.test(part) && skip) skip--;
        return part;
      }
      return skip ? part : part.replace(/(?<![\w-])((?:RF|CA|NF|DT|RQ)-[A-Z]{0,4}-?\d{2})(?![\w-])/g, (id) => `<a class="ref" href="#${id.toLowerCase()}">${id}</a>`);
    })
    .join('');
}

const indentOf = (line) => line.match(/^ */)[0].length;
const marker = /^( *)([-*]|\d+\.) +(.*)$/;
const splitRow = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

export function render(markdown) {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  return blocks(lines);
}

function blocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // Bloc de code
    const fence = line.match(/^\s*```\s*(\w*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const code = escape(body.join('\n'));
      out.push(fence[1] === 'mermaid' ? `<div class="diagram"><pre class="mermaid">${code}</pre></div>` : `<pre class="code"><code${fence[1] ? ` class="language-${fence[1]}"` : ''}>${code}</code></pre>`);
      continue;
    }
    // Titre
    const heading = line.match(/^(#{1,6}) +(.*)$/);
    if (heading) {
      const level = heading[1].length;
      let text = heading[2].trim();
      const anchor = text.match(/^<a id="([^"]+)"><\/a>/);
      if (anchor) text = text.slice(anchor[0].length);
      out.push(`<h${level}${anchor ? ` id="${anchor[1]}"` : ''}>${inline(text)}</h${level}>`);
      i++;
      continue;
    }
    // Tableau
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      const emptyHead = head.every((c) => !c);
      out.push(
        `<div class="table"><table>${emptyHead ? '' : `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`}<tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    // Citation
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*> ?/, ''));
      out.push(`<blockquote>${blocks(body)}</blockquote>`);
      continue;
    }
    // Liste
    const m = line.match(marker);
    if (m) {
      const base = m[1].length;
      const ordered = /\d/.test(m[2]);
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const mm = l.match(marker);
        if (mm && mm[1].length === base && /\d/.test(mm[2]) === ordered) {
          items.push({ start: mm[2], content: [mm[3]] });
          i++;
          continue;
        }
        if (!items.length) break;
        if (!l.trim()) {
          // Ligne vide : la liste continue si la suite est indentée ou un nouvel élément du même niveau
          const next = lines.slice(i + 1).find((x) => x.trim());
          const nm = next?.match(marker);
          if (next !== undefined && (indentOf(next) > base || (nm && nm[1].length === base && /\d/.test(nm[2]) === ordered))) {
            items[items.length - 1].content.push('');
            i++;
            continue;
          }
          break;
        }
        if (indentOf(l) > base) {
          items[items.length - 1].content.push(l.slice(Math.min(indentOf(l), base + 2)));
          i++;
          continue;
        }
        break;
      }
      const start = ordered ? parseInt(items[0].start, 10) : 1;
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items
          .map((it) => {
            const simple = it.content.every((c) => !marker.test(c) && c.trim()) && !it.content.some((c) => /^\s*(```|\|)/.test(c));
            return `<li>${simple ? inline(it.content.join(' ')) : blocks(it.content).replace(/^<p>([\s\S]*?)<\/p>/, '$1')}</li>`;
          })
          .join('')}</${tag}>`,
      );
      continue;
    }
    // Paragraphe
    const body = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6} |\s*```|\s*\||\s*>)/.test(lines[i]) && !marker.test(lines[i])) body.push(lines[i++].trim());
    out.push(`<p>${inline(body.join(' '))}</p>`);
  }
  return out.join('\n');
}

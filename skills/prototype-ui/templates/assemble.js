/*
 * Assemble les blocs réutilisables repris des specs (mêmes conventions que specs-ui) :
 * <div data-use="x"> reçoit le contenu de <template id="tpl-x"> ; ses enfants vont dans [data-slot="content"] ;
 * data-slot-<nom>="texte" remplit [data-slot="<nom>"] ; data-active="id1 id2" marque [data-nav] comme page courante ;
 * data-omit="zone" retire [data-zone="zone"] ; une zone data-optional n'apparaît qu'avec data-include="zone".
 * S'exécute avant l'initialisation d'Alpine : les directives x-… des blocs assemblés sont donc prises en compte.
 */
function assemble() {
  let hosts;
  while ((hosts = document.querySelectorAll('[data-use]')).length) {
    hosts.forEach((host) => {
      const name = host.dataset.use;
      host.removeAttribute('data-use');
      const tpl = document.getElementById('tpl-' + name);
      if (!tpl) return console.warn('Template not found: tpl-' + name);
      const fragment = tpl.content.cloneNode(true);
      const slot = fragment.querySelector('[data-slot="content"]');
      if (slot) slot.append(...host.childNodes);
      for (const { name: attr, value } of [...host.attributes]) {
        if (attr.startsWith('data-slot-')) fragment.querySelectorAll(`[data-slot="${attr.slice(10)}"]`).forEach((el) => (el.textContent = value));
      }
      (host.dataset.active || '').split(/\s+/).filter(Boolean).forEach((id) => fragment.querySelectorAll(`[data-nav="${id}"]`).forEach((el) => el.setAttribute('aria-current', 'page')));
      (host.dataset.omit || '').split(/\s+/).filter(Boolean).forEach((zone) => fragment.querySelectorAll(`[data-zone="${zone}"]`).forEach((el) => el.remove()));
      const included = (host.dataset.include || '').split(/\s+/);
      fragment.querySelectorAll('[data-optional]').forEach((el) => {
        if (!included.includes(el.dataset.zone)) el.remove();
      });
      host.append(fragment);
    });
  }
}
assemble();
if (window.lucide) lucide.createIcons();

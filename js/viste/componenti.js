// Frammenti di interfaccia riutilizzati dalle viste.

import { esc } from '../util.js';
import { luogoDi, codicePercorso } from '../dati.js';
import { testoQuantita, classeStato, STATI, NOMI_TIPO } from '../modello.js';

const svg = (d) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONE = {
  fotocamera: svg('<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>'),
  galleria: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>'),
  foto: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>'),
  freccia: svg('<path d="m9 6 6 6-6 6"/>'),
  piu: svg('<path d="M12 5v14M5 12h14"/>'),
};

/** Gruppo di pulsanti a scelta singola (radio stilizzati). */
export function segmentato(nome, opzioni, valore) {
  return `<div class="segmentato" role="radiogroup">${opzioni
    .map(
      ([v, etichetta]) =>
        `<label><input type="radio" name="${esc(nome)}" value="${esc(v)}"${v === valore ? ' checked' : ''}><span>${esc(etichetta)}</span></label>`
    )
    .join('')}</div>`;
}

/** I quattro stati come pulsanti colorati a scelta singola. */
export function sceltaStato(nome, valore) {
  return `<div class="stati" role="radiogroup">${STATI.map(
    (s) =>
      `<label class="${classeStato(s)}"><input type="radio" name="${esc(nome)}" value="${esc(s)}"${s === valore ? ' checked' : ''}><span>${esc(s)}</span></label>`
  ).join('')}</div>`;
}

/** Pulsanti "Scatta" (fotocamera posteriore) e "Galleria" (scelta multipla). */
export function pulsantiFoto() {
  return `<div class="riga-pulsanti">
    <label class="pulsante">${ICONE.fotocamera}<span>Scatta</span><input type="file" accept="image/*" capture="environment" data-scelta-foto hidden></label>
    <label class="pulsante secondario">${ICONE.galleria}<span>Galleria</span><input type="file" accept="image/*" multiple data-scelta-foto hidden></label>
  </div>`;
}

export function badgeQuantita(articolo, giacenza) {
  const t = testoQuantita(articolo, giacenza);
  if (!t) return '';
  const cls = articolo.modo_quantita === 'stati' ? classeStato(giacenza.stato) : 'st-num';
  return `<span class="badge ${cls}">${esc(t)}</span>`;
}

/** Riga di un articolo negli elenchi: miniatura, nome, dove, quantità. */
export function rigaArticolo(d, a, { giacenzaEvidenziata } = {}) {
  const giac = d.giacenzePerArticolo.get(a.id) || [];
  const g = giacenzaEvidenziata || giac[0];
  const u = g && d.ubi.get(g.id_ubicazione);
  const luogo = u && luogoDi(d, u);
  const altre = giac.length > 1 ? ` <span class="tenue">+${giac.length - 1}</span>` : '';
  const foto = (d.fotoPerArticolo.get(a.id) || [])[0];
  const img = foto
    ? `<img class="miniatura" alt="" data-miniatura="${esc(foto.id)}">`
    : `<span class="miniatura vuota">${ICONE.foto}</span>`;
  const dove = u
    ? `${luogo && luogo !== u ? `${esc(luogo.descrizione || luogo.codice)} · ` : ''}<span class="codice">${esc(codicePercorso(d, u))}</span>${altre}`
    : '<span class="tenue">senza ubicazione</span>';
  return `<a class="riga-articolo" href="#/articolo/${esc(a.id)}">
    ${img}
    <span class="testo"><strong>${esc(a.nome)}</strong><span class="sotto">${dove}</span></span>
    ${g ? badgeQuantita(a, g) : ''}
  </a>`;
}

/** Riga di un'ubicazione: codice, descrizione, tipo. */
export function rigaUbicazione(d, u, conteggio) {
  return `<a class="riga-ubicazione" href="#/ubicazione/${esc(u.id)}">
    <span class="tipo-ubi t-${esc(u.tipo)}">${esc(NOMI_TIPO[u.tipo]?.[0] || '?')}</span>
    <span class="testo"><strong class="codice">${esc(u.codice)}</strong><span class="sotto">${esc(u.descrizione || '')}</span></span>
    ${conteggio ? `<span class="conteggio">${conteggio}</span>` : ''}
    ${ICONE.freccia}
  </a>`;
}

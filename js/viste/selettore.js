// Foglio a tutto schermo per scegliere un'ubicazione.

import { esc, normalizza } from '../util.js';
import { alberoPiatto, luogoDi, ubicazioniRecenti } from '../dati.js';
import { TIPI_UBICAZIONE, NOMI_TIPO } from '../modello.js';

/**
 * Restituisce l'id scelto, oppure null se l'utente chiude.
 * tipiAmmessi: tipi selezionabili (gli altri restano visibili come struttura).
 * escludi: ids non selezionabili (es. l'ubicazione stessa).
 */
export async function scegliUbicazione(d, { titolo = 'Scegli ubicazione', tipiAmmessi = TIPI_UBICAZIONE, escludi = new Set() } = {}) {
  const recenti = (await ubicazioniRecenti()).map((id) => d.ubi.get(id)).filter(Boolean);
  const albero = alberoPiatto(d);
  const selezionabile = (u) => tipiAmmessi.includes(u.tipo) && !escludi.has(u.id);

  return new Promise((risolvi) => {
    const foglio = document.createElement('div');
    foglio.className = 'foglio';
    foglio.setAttribute('role', 'dialog');
    foglio.setAttribute('aria-modal', 'true');
    foglio.innerHTML = `
      <div class="foglio-testa">
        <h2>${esc(titolo)}</h2>
        <button type="button" class="pulsante-testo" data-chiudi>Chiudi</button>
      </div>
      <div class="foglio-corpo"><div class="elenco-scelta"></div></div>
      <div class="foglio-piede">
        <input type="search" class="filtro" placeholder="Filtra per codice o descrizione" autocomplete="off" enterkeyhint="search">
      </div>`;
    const elenco = foglio.querySelector('.elenco-scelta');
    const filtro = foglio.querySelector('.filtro');

    const voce = (u, livello, conLuogo) => {
      const luogo = conLuogo ? luogoDi(d, u) : null;
      const sotto = [u.descrizione, luogo && luogo !== u ? luogo.descrizione || luogo.codice : '']
        .filter(Boolean)
        .join(' · ');
      return `<button type="button" class="voce-scelta" data-id="${esc(u.id)}" style="--livello:${livello}"${selezionabile(u) ? '' : ' disabled'}>
        <span class="tipo-ubi t-${esc(u.tipo)}">${esc(NOMI_TIPO[u.tipo][0])}</span>
        <span class="testo"><strong class="codice">${esc(u.codice)}</strong><span class="sotto">${esc(sotto)}</span></span>
      </button>`;
    };

    const disegna = () => {
      const q = normalizza(filtro.value.trim());
      if (q) {
        const trovate = albero.filter(({ u }) => normalizza(`${u.codice} ${u.descrizione || ''}`).includes(q));
        elenco.innerHTML = trovate.length
          ? trovate.map(({ u }) => voce(u, 0, true)).join('')
          : '<p class="vuoto">Nessuna ubicazione trovata.</p>';
        return;
      }
      const rec = recenti.filter(selezionabile);
      elenco.innerHTML =
        (rec.length
          ? `<h3 class="titoletto">Usate di recente</h3>${rec.map((u) => voce(u, 0, true)).join('')}<h3 class="titoletto">Tutte</h3>`
          : '') + albero.map(({ u, livello }) => voce(u, livello, false)).join('');
    };

    const chiudi = (valore) => {
      foglio.remove();
      document.body.classList.remove('bloccato');
      risolvi(valore);
    };

    foglio.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-chiudi]')) return chiudi(null);
      const b = ev.target.closest('.voce-scelta');
      if (b && !b.disabled) chiudi(b.dataset.id);
    });
    filtro.addEventListener('input', disegna);
    disegna();
    document.body.classList.add('bloccato');
    document.body.append(foglio);
  });
}

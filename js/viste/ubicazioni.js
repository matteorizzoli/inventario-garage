// Ubicazioni: albero luoghi → mobili → posizioni → contenitori (SPEC §5.6).

import { esc, normalizza } from '../util.js';
import { carica, alberoPiatto, discendenti, luogoDi } from '../dati.js';
import { NOMI_TIPO } from '../modello.js';
import { ICONE } from './componenti.js';

export const scheda = 'ubicazioni';
export const titolo = 'Ubicazioni';

// Rami aperti, conservati durante la sessione. All'inizio è aperto il garage.
const aperti = new Set();
let primaVolta = true;
let testoFiltro = '';

/** Numero di articoli distinti in un'ubicazione e nei suoi sottolivelli. */
function contaArticoli(d, id) {
  const ids = new Set();
  for (const u of discendenti(d, id)) for (const g of d.giacenzePerUbicazione.get(u) || []) ids.add(g.id_articolo);
  return ids.size;
}

export async function mostra(el) {
  const d = await carica();
  if (primaVolta) {
    for (const u of d.figli.get('') || []) if (u.codice === 'GAR') aperti.add(u.id);
    primaVolta = false;
  }

  el.innerHTML = `
    <div id="albero" class="albero"></div>
    <div class="azioni-fisse barra-cerca">
      <div class="riga-pulsanti">
        <a class="pulsante secondario" href="#/ubicazione-nuova?tipo=luogo">${ICONE.piu}<span>Luogo</span></a>
        <a class="pulsante secondario" href="#/ubicazione-nuova?tipo=contenitore">${ICONE.piu}<span>Contenitore</span></a>
      </div>
      <input type="search" id="filtro" value="${esc(testoFiltro)}" placeholder="Filtra per codice o descrizione" autocomplete="off" autocapitalize="none" enterkeyhint="search" aria-label="Filtra ubicazioni">
    </div>`;
  const box = el.querySelector('#albero');
  const filtro = el.querySelector('#filtro');

  const nodo = (u, livello, conLuogo) => {
    const figli = d.figli.get(u.id) || [];
    const n = contaArticoli(d, u.id);
    const luogo = conLuogo ? luogoDi(d, u) : null;
    const sotto = [u.descrizione, luogo && luogo !== u ? luogo.descrizione || luogo.codice : ''].filter(Boolean).join(' · ');
    const espandi = figli.length && !conLuogo
      ? `<button type="button" class="espandi${aperti.has(u.id) ? ' aperto' : ''}" data-espandi="${esc(u.id)}" aria-label="${aperti.has(u.id) ? 'Chiudi' : 'Apri'} ${esc(u.codice)}" aria-expanded="${aperti.has(u.id)}">${ICONE.freccia}</button>`
      : '<span class="espandi-vuoto"></span>';
    return `<div class="nodo" style="--livello:${livello}">
      ${espandi}
      <a href="#/ubicazione/${esc(u.id)}" class="nodo-link">
        <span class="tipo-ubi t-${esc(u.tipo)}" title="${esc(NOMI_TIPO[u.tipo])}">${esc(NOMI_TIPO[u.tipo][0])}</span>
        <span class="testo"><strong class="codice">${esc(u.codice)}</strong><span class="sotto">${esc(sotto)}</span></span>
        ${n ? `<span class="conteggio" title="Articoli">${n}</span>` : ''}
      </a>
    </div>`;
  };

  const disegna = () => {
    const q = normalizza(testoFiltro.trim());
    if (q) {
      const trovate = alberoPiatto(d).filter(({ u }) => normalizza(`${u.codice} ${u.descrizione || ''}`).includes(q));
      box.innerHTML = trovate.length ? trovate.map(({ u }) => nodo(u, 0, true)).join('') : '<p class="vuoto">Nessuna ubicazione trovata.</p>';
      return;
    }
    const righe = [];
    const visita = (idPadre, livello) => {
      for (const u of d.figli.get(idPadre) || []) {
        righe.push(nodo(u, livello, false));
        if (aperti.has(u.id)) visita(u.id, livello + 1);
      }
    };
    visita('', 0);
    box.innerHTML = righe.length ? righe.join('') : '<p class="vuoto">Nessuna ubicazione. Crea un luogo.</p>';
  };

  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-espandi]');
    if (!b) return;
    const id = b.dataset.espandi;
    if (aperti.has(id)) aperti.delete(id);
    else aperti.add(id);
    disegna();
  });
  filtro.addEventListener('input', () => {
    testoFiltro = filtro.value;
    disegna();
  });
  disegna();
}

/** Apre i rami fino all'ubicazione indicata (usato dopo una creazione). */
export function apriFino(ids) {
  for (const id of ids) aperti.add(id);
}

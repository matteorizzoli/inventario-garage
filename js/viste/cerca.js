// Cerca (schermata iniziale, SPEC §5.1).
// Campo unico su nome, tag, attributi, marca, modello e codici di ubicazione
// (inclusi i codici dei livelli superiori). Filtri rapidi in basso, a portata di pollice.

import { esc, normalizza } from '../util.js';
import { carica, antenati } from '../dati.js';
import { CATEGORIE, TIPI_ARTICOLO, STATI_DA_RIFORNIRE } from '../modello.js';
import { riempiImmagini } from '../foto.js';
import { rigaArticolo, ICONE } from './componenti.js';

export const scheda = 'cerca';
export const titolo = 'Cerca';

const MAX_RISULTATI = 150;

// Conservato tra una visita e l'altra (tornando indietro da una scheda articolo).
const filtri = { testo: '', tipo: '', categoria: '', rifornire: false, luogo: '' };

function indicizza(d) {
  const indice = [];
  for (const a of d.articoli.values()) {
    const giac = d.giacenzePerArticolo.get(a.id) || [];
    const codici = new Set();
    const luoghi = new Set();
    for (const g of giac) {
      const u = d.ubi.get(g.id_ubicazione);
      if (!u) continue;
      for (const x of antenati(d, u)) {
        codici.add(x.codice);
        if (x.tipo === 'luogo') luoghi.add(x.id);
      }
    }
    const testo = normalizza([a.nome, a.tag, a.attributi, a.marca, a.modello, ...codici].join(' '));
    indice.push({ a, testo, luoghi, giac });
  }
  return indice;
}

function filtra(d, indice) {
  const parole = normalizza(filtri.testo).split(/\s+/).filter(Boolean);
  let ris = indice.filter(({ a, testo, luoghi, giac }) => {
    if (filtri.tipo && a.tipo !== filtri.tipo) return false;
    if (filtri.categoria && a.categoria !== filtri.categoria) return false;
    if (filtri.luogo && !luoghi.has(filtri.luogo)) return false;
    if (filtri.rifornire && !(a.modo_quantita === 'stati' && giac.some((g) => STATI_DA_RIFORNIRE.includes(g.stato)))) {
      return false;
    }
    return parole.every((p) => testo.includes(p));
  });
  if (parole.length) {
    const p0 = parole[0];
    ris.sort((x, y) => {
      const px = normalizza(x.a.nome).startsWith(p0) ? 0 : 1;
      const py = normalizza(y.a.nome).startsWith(p0) ? 0 : 1;
      return px - py || x.a.nome.localeCompare(y.a.nome, 'it');
    });
  } else {
    ris.sort((x, y) => String(y.a.aggiornato_il).localeCompare(String(x.a.aggiornato_il)));
  }
  return ris;
}

function opzioniCategoria() {
  const elenco = filtri.tipo ? CATEGORIE[filtri.tipo] : [...new Set([...CATEGORIE.materiale, ...CATEGORIE.attrezzo])];
  if (filtri.categoria && !elenco.includes(filtri.categoria)) filtri.categoria = '';
  return `<option value="">Categoria</option>${elenco
    .map((c) => `<option value="${esc(c)}"${c === filtri.categoria ? ' selected' : ''}>${esc(c)}</option>`)
    .join('')}`;
}

export async function mostra(el) {
  const d = await carica();
  const indice = indicizza(d);
  const luoghi = (d.figli.get('') || []).filter((u) => u.tipo === 'luogo');
  if (filtri.luogo && !d.ubi.has(filtri.luogo)) filtri.luogo = '';

  el.innerHTML = `
    <div id="risultati"></div>
    <div class="azioni-fisse barra-cerca">
      <div class="filtri" role="group" aria-label="Filtri">
        <button type="button" class="chip" data-tipo="">Tutti</button>
        ${Object.entries(TIPI_ARTICOLO)
          .map(([v, e]) => `<button type="button" class="chip" data-tipo="${v}">${e === 'Materiale' ? 'Materiali' : 'Attrezzi'}</button>`)
          .join('')}
        <button type="button" class="chip" data-rifornire title="Stato in esaurimento o finito">In esaurimento</button>
        <select class="chip" id="f-luogo" aria-label="Luogo">
          <option value="">Luogo</option>
          ${luoghi.map((u) => `<option value="${esc(u.id)}"${u.id === filtri.luogo ? ' selected' : ''}>${esc(u.codice)} · ${esc(u.descrizione || '')}</option>`).join('')}
        </select>
        <select class="chip" id="f-categoria" aria-label="Categoria">${opzioniCategoria()}</select>
      </div>
      <input type="search" id="q" value="${esc(filtri.testo)}" placeholder="Cerca nome, tag, misura, codice…"
        autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" aria-label="Cerca">
    </div>`;

  const risultati = el.querySelector('#risultati');
  const q = el.querySelector('#q');
  const selCat = el.querySelector('#f-categoria');

  const aggiornaChip = () => {
    el.querySelectorAll('[data-tipo]').forEach((b) => b.classList.toggle('attivo', b.dataset.tipo === filtri.tipo));
    el.querySelector('[data-rifornire]').classList.toggle('attivo', filtri.rifornire);
    el.querySelector('#f-luogo').classList.toggle('attivo', !!filtri.luogo);
    selCat.classList.toggle('attivo', !!filtri.categoria);
  };

  const disegna = () => {
    aggiornaChip();
    if (!d.articoli.size) {
      risultati.innerHTML = `<div class="vuoto grande">
        <p>Nessun articolo ancora.</p>
        <a class="pulsante" href="#/aggiungi">${ICONE.piu}<span>Aggiungi il primo</span></a>
      </div>`;
      return;
    }
    const ris = filtra(d, indice);
    const attivi = filtri.testo.trim() || filtri.tipo || filtri.categoria || filtri.luogo || filtri.rifornire;
    const intestazione = attivi
      ? `${ris.length} ${ris.length === 1 ? 'risultato' : 'risultati'}`
      : 'Modificati di recente';
    risultati.innerHTML = `<h2 class="titoletto">${intestazione}${ris.length > MAX_RISULTATI ? ` (primi ${MAX_RISULTATI})` : ''}</h2>
      ${ris.length ? `<div class="elenco">${ris.slice(0, MAX_RISULTATI).map(({ a }) => rigaArticolo(d, a)).join('')}</div>` : '<p class="vuoto">Nessun articolo corrisponde.</p>'}`;
    riempiImmagini(risultati);
  };

  q.addEventListener('input', () => {
    filtri.testo = q.value;
    disegna();
  });
  el.querySelector('.filtri').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('tipo' in b.dataset) {
      filtri.tipo = b.dataset.tipo;
      selCat.innerHTML = opzioniCategoria();
    }
    if ('rifornire' in b.dataset) filtri.rifornire = !filtri.rifornire;
    disegna();
  });
  el.querySelector('#f-luogo').addEventListener('change', (ev) => {
    filtri.luogo = ev.target.value;
    disegna();
  });
  selCat.addEventListener('change', () => {
    filtri.categoria = selCat.value;
    disegna();
  });

  disegna();
}

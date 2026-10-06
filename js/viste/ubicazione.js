// Scheda di un'ubicazione: contenuto, sottolivelli, azioni.

import { esc, avviso, mostraErrore, vai } from '../util.js';
import { salva, scrivi } from '../db.js';
import { carica, antenati, discendenti, registraUbicazioneUsata } from '../dati.js';
import { NOMI_TIPO, PADRI_AMMESSI, figliAmmessi, padreModificabile } from '../modello.js';
import { riempiImmagini } from '../foto.js';
import { rigaArticolo, rigaUbicazione, ICONE } from './componenti.js';
import { scegliUbicazione } from './selettore.js';
import { apriFino } from './ubicazioni.js';

export const scheda = 'ubicazioni';
export const titolo = 'Ubicazione';

export async function mostra(el, { param }) {
  const d = await carica();
  const u = d.ubi.get(param);
  if (!u) {
    el.innerHTML = '<div class="vuoto grande"><p>Ubicazione non trovata o eliminata.</p><a class="pulsante" href="#/ubicazioni">Torna alle ubicazioni</a></div>';
    return;
  }
  const catena = antenati(d, u);
  const figli = d.figli.get(u.id) || [];
  const giac = (d.giacenzePerUbicazione.get(u.id) || [])
    .map((g) => ({ g, a: d.articoli.get(g.id_articolo) }))
    .sort((x, y) => x.a.nome.localeCompare(y.a.nome, 'it'));
  const contaSotto = (id) => {
    const art = new Set();
    for (const x of discendenti(d, id)) for (const g of d.giacenzePerUbicazione.get(x) || []) art.add(g.id_articolo);
    return art.size;
  };
  const foto = u.id_foto && d.foto.get(u.id_foto);

  el.innerHTML = `
    <div class="pagina">
      <section class="passo testa-ubicazione">
        <nav class="briciole" aria-label="Percorso">
          ${catena.slice(0, -1).map((x) => `<a href="#/ubicazione/${esc(x.id)}" class="codice">${esc(x.codice)}</a>`).join('<span>›</span>')}
        </nav>
        <p class="tipo-esteso">${esc(NOMI_TIPO[u.tipo])}</p>
        <h2 class="codice-grande">${esc(u.codice)}</h2>
        ${u.descrizione ? `<p>${esc(u.descrizione)}</p>` : ''}
        ${foto ? `<img class="foto-ubicazione" alt="" data-foto="${esc(foto.id)}">` : ''}
      </section>

      <section class="passo">
        <h2>Contenuto <span class="tenue">(${giac.length})</span></h2>
        ${giac.length ? `<div class="elenco">${giac.map(({ g, a }) => rigaArticolo(d, a, { giacenzaEvidenziata: g })).join('')}</div>` : '<p class="vuoto">Nessun articolo registrato direttamente qui.</p>'}
      </section>

      ${
        figliAmmessi(u.tipo).length
          ? `<section class="passo">
        <h2>Sottolivelli <span class="tenue">(${figli.length})</span></h2>
        ${figli.length ? `<div class="elenco">${figli.map((f) => rigaUbicazione(d, f, contaSotto(f.id))).join('')}</div>` : ''}
        <div class="riga-pulsanti">
          ${figliAmmessi(u.tipo)
            .map((t) => `<a class="pulsante secondario" href="#/ubicazione-nuova?tipo=${t}&padre=${esc(u.id)}">${ICONE.piu}<span>${esc(NOMI_TIPO[t])}</span></a>`)
            .join('')}
        </div>
      </section>`
          : ''
      }

      <section class="passo riga-pulsanti">
        <a class="pulsante secondario" href="#/ubicazione-modifica/${esc(u.id)}">Modifica</a>
        ${padreModificabile(u.tipo) ? '<button type="button" class="pulsante secondario" id="sposta">Sposta</button>' : ''}
        <button type="button" class="pulsante pericolo" id="elimina">Elimina</button>
      </section>
    </div>
    <div class="azioni-fisse"><a class="pulsante" href="#/aggiungi?u=${esc(u.id)}">${ICONE.piu}<span>Aggiungi articolo qui</span></a></div>`;

  riempiImmagini(el);

  el.querySelector('#sposta')?.addEventListener('click', async () => {
    // Un contenitore non può finire dentro se stesso; si esclude anche il padre attuale.
    const escludi = discendenti(d, u.id);
    escludi.add(u.id_padre);
    const nuovo = await scegliUbicazione(d, { titolo: `Sposta ${u.codice} in…`, tipiAmmessi: PADRI_AMMESSI[u.tipo], escludi });
    if (!nuovo) return;
    try {
      await salva('ubicazioni', { ...u, id_padre: nuovo });
      await registraUbicazioneUsata(nuovo);
      apriFino(antenati(d, d.ubi.get(nuovo)).map((x) => x.id));
      avviso(`${u.codice} spostato in ${d.ubi.get(nuovo).codice}.`, 'ok');
      vai(`#/ubicazione/${u.id}`);
    } catch (e) {
      mostraErrore(e);
    }
  });

  el.querySelector('#elimina').addEventListener('click', async () => {
    if (figli.length || giac.length) {
      const cosa = [
        figli.length ? `${figli.length} ${figli.length === 1 ? 'sottolivello' : 'sottolivelli'}` : '',
        giac.length ? `${giac.length} ${giac.length === 1 ? 'articolo' : 'articoli'}` : '',
      ].filter(Boolean).join(' e ');
      avviso(`${u.codice} contiene ${cosa}: spostali o eliminali prima.`, 'errore');
      return;
    }
    if (!confirm(`Eliminare ${u.codice}?`)) return;
    try {
      const ops = [{ archivio: 'ubicazioni', record: { ...u, eliminato: true } }];
      if (foto) {
        ops.push({ archivio: 'foto', record: { ...foto, eliminato: true } });
        ops.push({ archivio: 'file', eliminaChiave: foto.id });
      }
      await scrivi(ops);
      avviso(`${u.codice} eliminato.`, 'ok');
      vai(u.id_padre && d.ubi.has(u.id_padre) ? `#/ubicazione/${u.id_padre}` : '#/ubicazioni');
    } catch (e) {
      mostraErrore(e);
    }
  });
}

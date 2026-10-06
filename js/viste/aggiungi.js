// Aggiungi articolo (SPEC §5.3).
// Sequenza minima: foto → nome → ubicazione → stato o quantità.
// Tutto il resto è facoltativo, in un riquadro chiuso.

import { esc, uuid, oggiISO, avviso, mostraErrore, urlTemporaneo, vai } from '../util.js';
import { scrivi } from '../db.js';
import { carica, codicePercorso, luogoDi, ubicazioniRecenti, ubicazioneIniziale, registraUbicazioneUsata } from '../dati.js';
import { UNITA } from '../modello.js';
import { preparaFoto, recordFile } from '../foto.js';
import { pulsantiFoto, sceltaStato, segmentato } from './componenti.js';
import { campoTipo, campoCategoria, campoModo, campiFacoltativi, collegaCampi, leggiArticolo, leggiNumero } from './campi-articolo.js';
import { scegliUbicazione } from './selettore.js';

export const scheda = 'aggiungi';
export const titolo = 'Aggiungi articolo';

// Tipo e categoria restano quelli dell'ultimo inserimento ("Salva e nuovo"):
// durante il carico iniziale si inseriscono molti articoli simili di fila.
const ultimo = { tipo: 'materiale', categoria: '' };

export function descriviUbicazione(d, u) {
  if (!u) return '<span class="tenue">Nessuna ubicazione</span>';
  const luogo = luogoDi(d, u);
  const sotto = [u.descrizione, luogo && luogo !== u ? luogo.descrizione || luogo.codice : ''].filter(Boolean).join(' · ');
  return `<strong class="codice">${esc(codicePercorso(d, u))}</strong><span class="sotto">${esc(sotto)}</span>`;
}

export async function mostra(el, { query }) {
  const d = await carica();
  const recenti = await ubicazioniRecenti();
  let ubicazione = (query.u && d.ubi.get(query.u)) || ubicazioneIniziale(d, recenti);
  const foto = []; // { blob, miniatura, url }
  let inElaborazione = 0;
  let salvataggioInCorso = false;
  const base = { ...ultimo };

  el.innerHTML = `
    <form id="modulo" class="pagina" novalidate>
      <section class="passo">
        <h2><span class="num">1</span> Foto</h2>
        <div class="anteprime" id="anteprime"></div>
        ${pulsantiFoto()}
      </section>
      <section class="passo">
        <h2><span class="num">2</span> Nome</h2>
        <input name="nome" required autocomplete="off" autocapitalize="sentences" enterkeyhint="done" placeholder="es. Viti testa svasata M6×20" aria-label="Nome">
      </section>
      <section class="passo">
        <h2><span class="num">3</span> Ubicazione</h2>
        <button type="button" class="campo-ubicazione" id="ubicazione"></button>
      </section>
      <section class="passo">
        <h2><span class="num">4</span> Quantità</h2>
        ${campoModo({ modo_quantita: 'stati' })}
        <div data-se-modo="stati">${sceltaStato('stato', '')}</div>
        <div data-se-modo="esatta" class="riga-quantita">
          <input name="quantita" inputmode="decimal" autocomplete="off" placeholder="Quantità" aria-label="Quantità">
          ${segmentato('unita', UNITA.map((u) => [u, u]), 'pz')}
        </div>
        <p data-se-modo="nessuna" class="nota">Nessuna quantità: si registra solo dove è riposto.</p>
      </section>
      <details class="passo">
        <summary>Altri dettagli <span class="tenue" id="riassunto"></span></summary>
        ${campoTipo(base)}
        ${campoCategoria(base)}
        ${campiFacoltativi({})}
      </details>
    </form>
    <div class="azioni-fisse due">
      <button type="button" class="pulsante secondario" id="salva">Salva</button>
      <button type="button" class="pulsante" id="salva-nuovo">Salva e nuovo</button>
    </div>`;

  const form = el.querySelector('#modulo');
  const anteprime = el.querySelector('#anteprime');
  const btnUbi = el.querySelector('#ubicazione');
  collegaCampi(form);
  const riassunto = el.querySelector('#riassunto');
  const aggiornaRiassunto = () => {
    const f = form.elements;
    riassunto.textContent = `(${[f.tipo.value, f.categoria.value].filter(Boolean).join(' · ')})`;
  };
  form.addEventListener('change', aggiornaRiassunto);
  aggiornaRiassunto();

  const disegnaUbicazione = () => {
    btnUbi.innerHTML = `<span class="testo">${descriviUbicazione(d, ubicazione)}</span><span class="azione">Cambia</span>`;
  };
  const disegnaAnteprime = () => {
    anteprime.innerHTML =
      foto
        .map(
          (f, i) => `<div class="anteprima"><img src="${f.url}" alt="Foto ${i + 1}">
          ${i === 0 ? '<span class="etichetta-principale">principale</span>' : ''}
          <button type="button" class="rimuovi" data-rimuovi="${i}" aria-label="Rimuovi foto ${i + 1}">×</button></div>`
        )
        .join('') + (inElaborazione ? '<div class="anteprima in-corso">Elaboro…</div>' : '');
  };
  disegnaUbicazione();

  form.addEventListener('change', async (ev) => {
    if (!ev.target.matches('[data-scelta-foto]')) return;
    const file = [...ev.target.files];
    ev.target.value = '';
    inElaborazione += file.length;
    disegnaAnteprime();
    // Una foto alla volta: su iPhone la memoria per i canvas è limitata.
    for (const f of file) {
      try {
        const pronta = await preparaFoto(f);
        foto.push({ ...pronta, url: urlTemporaneo(pronta.miniatura) });
      } catch (e) {
        mostraErrore(e);
      } finally {
        inElaborazione--;
        disegnaAnteprime();
      }
    }
  });

  anteprime.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-rimuovi]');
    if (!b) return;
    foto.splice(Number(b.dataset.rimuovi), 1);
    disegnaAnteprime();
  });

  btnUbi.addEventListener('click', async () => {
    const id = await scegliUbicazione(d, { titolo: 'Dove si trova?' });
    if (id) {
      ubicazione = d.ubi.get(id);
      disegnaUbicazione();
    }
  });

  const salva = async (eNuovo) => {
    if (salvataggioInCorso) return;
    if (inElaborazione) return avviso('Attendi la fine dell’elaborazione delle foto.');
    const art = leggiArticolo(form);
    if (!art.nome) {
      avviso('Il nome è obbligatorio.', 'errore');
      form.elements.nome.focus();
      return;
    }
    if (!ubicazione) return avviso('Scegli un’ubicazione.', 'errore');
    const quantita = art.modo_quantita === 'esatta' ? leggiNumero(form.elements.quantita.value) : '';
    if (quantita === null) {
      avviso('Quantità non valida.', 'errore');
      form.elements.quantita.focus();
      return;
    }

    art.id = uuid();
    const ops = [
      { archivio: 'articoli', record: art },
      {
        archivio: 'giacenze',
        record: {
          id: uuid(),
          id_articolo: art.id,
          id_ubicazione: ubicazione.id,
          stato: art.modo_quantita === 'stati' ? form.elements.stato.value || '' : '',
          quantita,
          verificato_il: oggiISO(),
        },
      },
    ];
    foto.forEach((f, i) => {
      const id = uuid();
      ops.push({ archivio: 'foto', record: { id, id_articolo: art.id, ordine: i + 1, didascalia: '', id_file_drive: '' } });
      ops.push({ archivio: 'file', record: recordFile(id, f) });
    });

    salvataggioInCorso = true;
    try {
      await scrivi(ops);
      await registraUbicazioneUsata(ubicazione.id);
      ultimo.tipo = art.tipo;
      ultimo.categoria = art.categoria;
      avviso(`Salvato: ${art.nome}`, 'ok');
      if (eNuovo) {
        await mostra(el, { query: { u: ubicazione.id } });
        window.scrollTo(0, 0);
      } else {
        vai(`#/articolo/${art.id}`);
      }
    } catch (e) {
      mostraErrore(e);
    } finally {
      salvataggioInCorso = false;
    }
  };
  el.querySelector('#salva').addEventListener('click', () => salva(false));
  el.querySelector('#salva-nuovo').addEventListener('click', () => salva(true));
  form.addEventListener('submit', (ev) => ev.preventDefault());
}

// Creazione e modifica di un'ubicazione, con la convenzione dei codici (SPEC §4.1).

import { esc, uuid, avviso, mostraErrore, vai, urlTemporaneo } from '../util.js';
import { scrivi } from '../db.js';
import { carica, antenati, codicePercorso, luogoDi, ubicazioniRecenti, ubicazioneIniziale } from '../dati.js';
import {
  TIPI_UBICAZIONE, NOMI_TIPO, LETTERE_MOBILE, LETTERE_POSIZIONE, PADRI_AMMESSI,
  prossimoCodice, verificaCodice,
} from '../modello.js';
import { preparaFoto, recordFile, riempiImmagini } from '../foto.js';
import { pulsantiFoto } from './componenti.js';
import { scegliUbicazione } from './selettore.js';
import { apriFino } from './ubicazioni.js';

export const scheda = 'ubicazioni';
export const titolo = 'Ubicazione';

const SEGNAPOSTO = {
  luogo: 'es. Garage',
  mobile: 'es. Armadio grigio a destra dell’ingresso',
  posizione: 'es. 3° ripiano',
  contenitore: 'es. Cassetta trasparente viti piccole',
};

export async function mostra(el, { param, query }) {
  const d = await carica();
  const esistente = param ? d.ubi.get(param) : null;
  if (param && !esistente) {
    el.innerHTML = '<div class="vuoto grande"><p>Ubicazione non trovata.</p></div>';
    return;
  }
  const tipo = esistente?.tipo || query.tipo;
  if (!TIPI_UBICAZIONE.includes(tipo)) {
    el.innerHTML = '<div class="vuoto grande"><p>Tipo di ubicazione non valido.</p></div>';
    return;
  }
  const nuovo = !esistente;
  const lettere = tipo === 'mobile' ? LETTERE_MOBILE : tipo === 'posizione' ? LETTERE_POSIZIONE : null;
  const haFigli = !!esistente && (d.figli.get(esistente.id) || []).length > 0;
  const codiceModificabile = nuovo || !haFigli;

  let padre = null;
  if (tipo !== 'luogo') {
    if (esistente) padre = d.ubi.get(esistente.id_padre) || null;
    else if (query.padre) padre = d.ubi.get(query.padre) || null;
    if (padre && !PADRI_AMMESSI[tipo].includes(padre.tipo)) padre = null;
    if (!padre && nuovo) {
      const iniziale = ubicazioneIniziale(d, await ubicazioniRecenti());
      if (iniziale && PADRI_AMMESSI[tipo].includes(iniziale.tipo)) padre = iniziale;
    }
  }
  let lettera = query.lettera && lettere?.[query.lettera] ? query.lettera : lettere ? Object.keys(lettere)[0] : '';
  let codiceToccato = false;
  // Foto: undefined = invariata, null = rimossa, oggetto = nuova
  let nuovaFoto;
  const fotoAttuale = esistente?.id_foto && d.foto.get(esistente.id_foto);

  const suggerisci = () => prossimoCodice(tipo, padre, lettera, d.tutteUbicazioni);

  el.innerHTML = `
    <form class="pagina" id="modulo" novalidate>
      <h2 class="titolo-scheda">${nuovo ? `Nuovo ${esc(NOMI_TIPO[tipo].toLowerCase())}` : `Modifica ${esc(esistente.codice)}`}</h2>
      ${
        tipo !== 'luogo'
          ? `<section class="passo"><h2>Si trova in</h2>
              ${nuovo ? '<button type="button" class="campo-ubicazione" id="padre"></button>' : '<div class="campo-ubicazione statico" id="padre"></div>'}
              ${!nuovo && tipo === 'contenitore' ? '<p class="nota">Per cambiarlo usa “Sposta” nella scheda.</p>' : ''}
            </section>`
          : ''
      }
      ${
        lettere && nuovo
          ? `<section class="passo"><h2>Tipo di ${tipo === 'mobile' ? 'mobile' : 'posizione'}</h2>
              <div class="scelta-lettera" role="radiogroup">
                ${Object.entries(lettere)
                  .map(([l, e]) => `<label><input type="radio" name="lettera" value="${l}"${l === lettera ? ' checked' : ''}><span><b>${l}</b> ${esc(e)}</span></label>`)
                  .join('')}
              </div></section>`
          : ''
      }
      <section class="passo">
        <label class="campo"><span class="etichetta">Codice</span>
          <input name="codice" class="codice" value="${esc(esistente?.codice || suggerisci())}" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false"
            ${tipo === 'luogo' ? 'maxlength="3" placeholder="es. GAR"' : ''}${codiceModificabile ? '' : ' readonly'}>
        </label>
        <p class="nota">${
          !codiceModificabile
            ? 'Il codice non si può cambiare perché ha sottolivelli che lo contengono.'
            : tipo === 'luogo'
              ? 'Sigla di 3 caratteri.'
              : tipo === 'contenitore'
                ? 'Progressivo globale: non dipende da dove si trova, così spostandolo l’etichetta resta valida.'
                : 'Proposto automaticamente: progressivo per lettera, in senso orario dall’ingresso (mobili), dal basso (ripiani), dall’alto (cassetti), da sinistra (settori).'
        }</p>
        <label class="campo"><span class="etichetta">${tipo === 'luogo' ? 'Nome' : 'Descrizione'}</span>
          <input name="descrizione" value="${esc(esistente?.descrizione || '')}" placeholder="${esc(SEGNAPOSTO[tipo])}" autocomplete="off" autocapitalize="sentences">
        </label>
      </section>
      <section class="passo">
        <h2>Foto <span class="tenue">(facoltativa)</span></h2>
        <div class="anteprime" id="anteprima"></div>
        ${pulsantiFoto()}
      </section>
    </form>
    <div class="azioni-fisse${nuovo ? ' due' : ''}">
      ${nuovo ? '<button type="button" class="pulsante secondario" id="salva-nuovo">Salva e nuovo</button>' : ''}
      <button type="button" class="pulsante" id="salva">Salva</button>
    </div>`;

  const form = el.querySelector('#modulo');
  const campoCodice = form.elements.codice;
  const boxPadre = el.querySelector('#padre');
  const boxFoto = el.querySelector('#anteprima');

  const disegnaPadre = () => {
    if (!boxPadre) return;
    const luogo = padre && luogoDi(d, padre);
    boxPadre.innerHTML = padre
      ? `<span class="testo"><strong class="codice">${esc(codicePercorso(d, padre))}</strong><span class="sotto">${esc([padre.descrizione, luogo && luogo !== padre ? luogo.descrizione : ''].filter(Boolean).join(' · '))}</span></span>${nuovo ? '<span class="azione">Cambia</span>' : ''}`
      : '<span class="testo tenue">Scegli…</span><span class="azione">Scegli</span>';
  };
  const aggiornaSuggerimento = () => {
    if (nuovo && !codiceToccato && tipo !== 'luogo') campoCodice.value = suggerisci();
  };
  const disegnaFoto = () => {
    let img = '';
    if (nuovaFoto) img = `<img src="${urlTemporaneo(nuovaFoto.miniatura)}" alt="">`;
    else if (nuovaFoto === undefined && fotoAttuale) img = `<img alt="" data-miniatura="${esc(fotoAttuale.id)}">`;
    boxFoto.innerHTML = img ? `<div class="anteprima">${img}<button type="button" class="rimuovi" data-rimuovi aria-label="Rimuovi foto">×</button></div>` : '';
    riempiImmagini(boxFoto);
  };
  disegnaPadre();
  disegnaFoto();

  if (boxPadre && nuovo) {
    boxPadre.addEventListener('click', async () => {
      const id = await scegliUbicazione(d, { titolo: `Dove si trova il ${NOMI_TIPO[tipo].toLowerCase()}?`, tipiAmmessi: PADRI_AMMESSI[tipo] });
      if (!id) return;
      padre = d.ubi.get(id);
      disegnaPadre();
      aggiornaSuggerimento();
    });
  }

  form.addEventListener('change', async (ev) => {
    if (ev.target.name === 'lettera') {
      lettera = ev.target.value;
      aggiornaSuggerimento();
    } else if (ev.target.matches('[data-scelta-foto]')) {
      const f = ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      try {
        nuovaFoto = await preparaFoto(f);
        disegnaFoto();
      } catch (e) {
        mostraErrore(e);
      }
    }
  });
  boxFoto.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-rimuovi]')) return;
    nuovaFoto = null;
    disegnaFoto();
  });
  campoCodice.addEventListener('input', () => {
    codiceToccato = true;
    const pos = campoCodice.selectionStart;
    campoCodice.value = campoCodice.value.toUpperCase().replace(/\s+/g, '');
    campoCodice.setSelectionRange(pos, pos);
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());

  const salva = async (eNuovo) => {
    const codice = campoCodice.value.trim().toUpperCase();
    const errore = verificaCodice(tipo, codice, padre, [...d.ubi.values()], esistente?.id);
    if (errore) {
      avviso(errore, 'errore');
      campoCodice.focus();
      return;
    }
    const record = esistente
      ? { ...esistente, codice, descrizione: form.elements.descrizione.value.trim() }
      : {
          id: uuid(),
          tipo,
          codice,
          descrizione: form.elements.descrizione.value.trim(),
          id_padre: padre ? padre.id : '',
          id_foto: '',
        };
    const ops = [{ archivio: 'ubicazioni', record }];
    if (nuovaFoto !== undefined && fotoAttuale) {
      ops.push({ archivio: 'foto', record: { ...fotoAttuale, eliminato: true } });
      ops.push({ archivio: 'file', eliminaChiave: fotoAttuale.id });
      record.id_foto = '';
    }
    if (nuovaFoto) {
      const idFoto = uuid();
      ops.push({ archivio: 'foto', record: { id: idFoto, id_articolo: '', ordine: 1, didascalia: '', id_file_drive: '' } });
      ops.push({ archivio: 'file', record: recordFile(idFoto, nuovaFoto) });
      record.id_foto = idFoto;
    }
    try {
      await scrivi(ops);
      apriFino(padre ? antenati(d, padre).map((x) => x.id) : []);
      avviso(`${codice} salvato.`, 'ok');
      if (eNuovo) {
        const q = new URLSearchParams({ tipo, ...(padre ? { padre: padre.id } : {}), ...(lettera ? { lettera } : {}) });
        vai(`#/ubicazione-nuova?${q}`, { sostituisci: true });
      } else {
        vai(`#/ubicazione/${record.id}`);
      }
    } catch (e) {
      mostraErrore(e);
    }
  };
  el.querySelector('#salva').addEventListener('click', () => salva(false));
  el.querySelector('#salva-nuovo')?.addEventListener('click', () => salva(true));
}

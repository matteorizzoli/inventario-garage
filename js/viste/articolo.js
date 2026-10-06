// Scheda articolo: foto, dove si trova (giacenze), dati modificabili.

import { esc, uuid, oggiISO, formattaData, avviso, mostraErrore, vai } from '../util.js';
import { scrivi, salva, leggi } from '../db.js';
import { carica, registraUbicazioneUsata } from '../dati.js';
import { preparaFoto, recordFile, riempiImmagini } from '../foto.js';
import { pulsantiFoto, sceltaStato } from './componenti.js';
import { campoTipo, campoCategoria, campoModo, campoUnita, campiFacoltativi, collegaCampi, leggiArticolo, leggiNumero } from './campi-articolo.js';
import { scegliUbicazione } from './selettore.js';
import { descriviUbicazione } from './aggiungi.js';

export const scheda = 'cerca';
export const titolo = 'Articolo';

export async function mostra(el, { param }) {
  let d = await carica();
  const id = param;
  if (!d.articoli.has(id)) {
    el.innerHTML = '<div class="vuoto grande"><p>Articolo non trovato o eliminato.</p><a class="pulsante" href="#/cerca">Torna a Cerca</a></div>';
    return;
  }
  const art = () => d.articoli.get(id);
  const ricarica = async () => {
    d = await carica();
  };

  el.innerHTML = `
    <div class="pagina">
      <h2 class="titolo-scheda" id="nome-titolo"></h2>
      <section class="passo">
        <h2>Foto</h2>
        <div class="striscia-foto" id="foto"></div>
        ${pulsantiFoto()}
      </section>
      <section class="passo">
        <h2>Dove si trova</h2>
        <div id="giacenze"></div>
        <button type="button" class="pulsante secondario largo" id="nuova-giacenza">Aggiungi un’altra ubicazione</button>
      </section>
      <form class="passo" id="modulo" novalidate>
        <h2>Dati</h2>
        <label class="campo"><span class="etichetta">Nome</span><input name="nome" required value="${esc(art().nome)}" autocomplete="off" autocapitalize="sentences"></label>
        ${campoTipo(art())}
        ${campoCategoria(art())}
        ${campoModo(art())}
        ${campoUnita(art())}
        ${campiFacoltativi(art())}
      </form>
      <section class="passo">
        <p class="nota" id="aggiornato"></p>
        <button type="button" class="pulsante pericolo largo" id="elimina">Elimina articolo</button>
      </section>
    </div>
    <div class="azioni-fisse"><button type="button" class="pulsante" id="salva" disabled>Salva modifiche</button></div>`;

  const form = el.querySelector('#modulo');
  const btnSalva = el.querySelector('#salva');
  const boxFoto = el.querySelector('#foto');
  const boxGiac = el.querySelector('#giacenze');
  collegaCampi(form, { modoFisso: true });

  const disegnaTesta = () => {
    el.querySelector('#nome-titolo').textContent = art().nome;
    el.querySelector('#aggiornato').textContent = `Ultima modifica: ${new Date(art().aggiornato_il).toLocaleString('it-IT')}`;
  };

  // ---------- Foto ----------
  const disegnaFoto = () => {
    const foto = d.fotoPerArticolo.get(id) || [];
    boxFoto.innerHTML = foto.length
      ? foto
          .map(
            (f, i) => `<figure class="foto-scheda">
              <button type="button" class="apri-foto" data-apri="${esc(f.id)}" aria-label="Apri foto ${i + 1}"><img alt="" data-miniatura="${esc(f.id)}"></button>
              <figcaption>
                ${i === 0 ? '<span class="etichetta-principale">principale</span>' : `<button type="button" class="pulsante-testo" data-principale="${esc(f.id)}">Rendi principale</button>`}
                <button type="button" class="pulsante-testo pericolo" data-elimina-foto="${esc(f.id)}">Elimina</button>
              </figcaption>
            </figure>`
          )
          .join('')
      : '<p class="vuoto">Nessuna foto.</p>';
    riempiImmagini(boxFoto);
  };

  el.addEventListener('change', async (ev) => {
    if (!ev.target.matches('[data-scelta-foto]')) return;
    const file = [...ev.target.files];
    ev.target.value = '';
    let ordine = Math.max(0, ...(d.fotoPerArticolo.get(id) || []).map((f) => Number(f.ordine) || 0));
    for (const f of file) {
      try {
        const pronta = await preparaFoto(f);
        const idFoto = uuid();
        await scrivi([
          { archivio: 'foto', record: { id: idFoto, id_articolo: id, ordine: ++ordine, didascalia: '', id_file_drive: '' } },
          { archivio: 'file', record: recordFile(idFoto, pronta) },
        ]);
      } catch (e) {
        mostraErrore(e);
      }
    }
    await ricarica();
    disegnaFoto();
  });

  boxFoto.addEventListener('click', async (ev) => {
    const apri = ev.target.closest('[data-apri]');
    if (apri) return mostraFoto(apri.dataset.apri);
    const princ = ev.target.closest('[data-principale]');
    const elim = ev.target.closest('[data-elimina-foto]');
    try {
      if (princ) {
        const foto = d.fotoPerArticolo.get(id) || [];
        const scelta = foto.find((f) => f.id === princ.dataset.principale);
        const ordinate = [scelta, ...foto.filter((f) => f !== scelta)];
        await scrivi(ordinate.map((f, i) => ({ archivio: 'foto', record: { ...f, ordine: i + 1 } })));
      } else if (elim) {
        if (!confirm('Eliminare questa foto?')) return;
        const f = d.foto.get(elim.dataset.eliminaFoto);
        await scrivi([
          { archivio: 'foto', record: { ...f, eliminato: true } },
          { archivio: 'file', eliminaChiave: f.id },
        ]);
      } else return;
      await ricarica();
      disegnaFoto();
    } catch (e) {
      mostraErrore(e);
    }
  });

  // ---------- Giacenze ----------
  const disegnaGiacenze = () => {
    const a = art();
    const giac = d.giacenzePerArticolo.get(id) || [];
    boxGiac.innerHTML = giac.length
      ? giac
          .map((g) => {
            const u = d.ubi.get(g.id_ubicazione);
            let quantita = '';
            if (a.modo_quantita === 'stati') quantita = sceltaStato(`stato-${g.id}`, g.stato);
            if (a.modo_quantita === 'esatta') {
              quantita = `<div class="contatore">
                <button type="button" class="pulsante secondario" data-delta="-1" aria-label="Meno uno">−</button>
                <input inputmode="decimal" data-quantita value="${esc(g.quantita)}" aria-label="Quantità">
                <span class="unita">${esc(a.unita || '')}</span>
                <button type="button" class="pulsante secondario" data-delta="1" aria-label="Più uno">+</button>
              </div>`;
            }
            return `<div class="giacenza" data-giacenza="${esc(g.id)}">
              ${u ? `<a class="dove" href="#/ubicazione/${esc(u.id)}">${descriviUbicazione(d, u)}</a>` : '<p class="tenue">Ubicazione eliminata</p>'}
              ${quantita}
              <div class="riga-verifica">
                <span class="tenue">Verificato il ${esc(formattaData(g.verificato_il) || '—')}</span>
                <button type="button" class="pulsante-testo" data-verificato>Verificato oggi</button>
              </div>
              <div class="riga-azioni">
                <button type="button" class="pulsante-testo" data-sposta>Sposta</button>
                <button type="button" class="pulsante-testo pericolo" data-rimuovi>Rimuovi</button>
              </div>
            </div>`;
          })
          .join('')
      : '<p class="vuoto">Non è indicato dove si trova.</p>';
  };

  const aggiornaGiacenza = async (gid, modifiche) => {
    try {
      const g = await leggi('giacenze', gid);
      await salva('giacenze', { ...g, ...modifiche });
      await ricarica();
      disegnaGiacenze();
    } catch (e) {
      mostraErrore(e);
    }
  };

  // Aggiornare stato o quantità vale anche come verifica.
  boxGiac.addEventListener('change', (ev) => {
    const box = ev.target.closest('[data-giacenza]');
    if (!box) return;
    if (ev.target.type === 'radio') {
      aggiornaGiacenza(box.dataset.giacenza, { stato: ev.target.value, verificato_il: oggiISO() });
    } else if (ev.target.matches('[data-quantita]')) {
      const n = leggiNumero(ev.target.value);
      if (n === null) return avviso('Quantità non valida.', 'errore');
      aggiornaGiacenza(box.dataset.giacenza, { quantita: n, verificato_il: oggiISO() });
    }
  });

  boxGiac.addEventListener('click', async (ev) => {
    const box = ev.target.closest('[data-giacenza]');
    if (!box) return;
    const gid = box.dataset.giacenza;
    const b = ev.target.closest('button');
    if (!b) return;
    if ('delta' in b.dataset) {
      const input = box.querySelector('[data-quantita]');
      const n = Math.max(0, (Number(leggiNumero(input.value)) || 0) + Number(b.dataset.delta));
      aggiornaGiacenza(gid, { quantita: n, verificato_il: oggiISO() });
    } else if ('verificato' in b.dataset) {
      aggiornaGiacenza(gid, { verificato_il: oggiISO() });
      avviso('Segnato come verificato oggi.', 'ok');
    } else if ('sposta' in b.dataset) {
      const giaUsate = new Set((d.giacenzePerArticolo.get(id) || []).map((g) => g.id_ubicazione));
      const nuova = await scegliUbicazione(d, { titolo: 'Sposta in…', escludi: giaUsate });
      if (!nuova) return;
      await registraUbicazioneUsata(nuova);
      aggiornaGiacenza(gid, { id_ubicazione: nuova });
    } else if ('rimuovi' in b.dataset) {
      if (!confirm('Rimuovere questa ubicazione dall’articolo?')) return;
      aggiornaGiacenza(gid, { eliminato: true });
    }
  });

  el.querySelector('#nuova-giacenza').addEventListener('click', async () => {
    const giaUsate = new Set((d.giacenzePerArticolo.get(id) || []).map((g) => g.id_ubicazione));
    const u = await scegliUbicazione(d, { titolo: 'Aggiungi ubicazione', escludi: giaUsate });
    if (!u) return;
    try {
      await salva('giacenze', { id: uuid(), id_articolo: id, id_ubicazione: u, stato: '', quantita: '', verificato_il: oggiISO() });
      await registraUbicazioneUsata(u);
      await ricarica();
      disegnaGiacenze();
    } catch (e) {
      mostraErrore(e);
    }
  });

  // ---------- Dati ----------
  form.addEventListener('input', () => (btnSalva.disabled = false));
  form.addEventListener('change', () => (btnSalva.disabled = false));
  form.addEventListener('submit', (ev) => ev.preventDefault());
  btnSalva.addEventListener('click', async () => {
    const campi = leggiArticolo(form);
    if (!campi.nome) {
      avviso('Il nome è obbligatorio.', 'errore');
      form.elements.nome.focus();
      return;
    }
    try {
      await salva('articoli', { ...art(), ...campi });
      await ricarica();
      btnSalva.disabled = true;
      disegnaTesta();
      disegnaGiacenze(); // il modo di quantità può essere cambiato
      avviso('Modifiche salvate.', 'ok');
    } catch (e) {
      mostraErrore(e);
    }
  });

  el.querySelector('#elimina').addEventListener('click', async () => {
    if (!confirm(`Eliminare “${art().nome}” con le sue foto e ubicazioni?`)) return;
    const ops = [{ archivio: 'articoli', record: { ...art(), eliminato: true } }];
    for (const g of d.giacenzePerArticolo.get(id) || []) ops.push({ archivio: 'giacenze', record: { ...g, eliminato: true } });
    for (const f of d.fotoPerArticolo.get(id) || []) {
      ops.push({ archivio: 'foto', record: { ...f, eliminato: true } });
      ops.push({ archivio: 'file', eliminaChiave: f.id });
    }
    try {
      await scrivi(ops);
      avviso('Articolo eliminato.', 'ok');
      vai('#/cerca');
    } catch (e) {
      mostraErrore(e);
    }
  });

  disegnaTesta();
  disegnaFoto();
  disegnaGiacenze();
}

/** Foto a tutto schermo; si chiude toccando. */
function mostraFoto(idFoto) {
  const v = document.createElement('div');
  v.className = 'visore';
  v.innerHTML = `<img alt="" data-foto="${esc(idFoto)}"><button type="button" class="pulsante-testo chiudi">Chiudi</button>`;
  v.addEventListener('click', () => {
    v.remove();
    document.body.classList.remove('bloccato');
  });
  document.body.classList.add('bloccato');
  document.body.append(v);
  riempiImmagini(v);
}

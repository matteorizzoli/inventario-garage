// Impostazioni: backup JSON, spazio locale, sincronizzazione (Fase 3), aggiornamenti.

import { esc, formattaByte, avviso, mostraErrore, vai } from '../util.js';
import { conta, cancellaTutto, leggiImpostazione, scriviImpostazione } from '../db.js';
import { creaBackup, nomeFileBackup, ripristinaBackup } from '../backup.js';
import { statoSincronizzazione } from '../sync.js';
import { versioneApp, cercaAggiornamenti } from '../pwa.js';

export const scheda = 'impostazioni';
export const titolo = 'Impostazioni';

export async function mostra(el) {
  const [nArticoli, nUbicazioni, nFile, sinc, ultimoBackup, versione] = await Promise.all([
    conta('articoli'),
    conta('ubicazioni'),
    conta('file'),
    statoSincronizzazione(),
    leggiImpostazione('ultimo_backup', ''),
    versioneApp(),
  ]);
  const puoCondividere = typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [new File(['{}'], 'prova.json', { type: 'application/json' })] });

  el.innerHTML = `
    <div class="pagina">
      <section class="passo">
        <h2>Backup dei dati</h2>
        <p class="nota">Finché non c’è la sincronizzazione con Google, questo file è l’unica copia esterna dei dati. Fallo spesso.</p>
        <p>Ultimo backup: <strong>${ultimoBackup ? esc(new Date(ultimoBackup).toLocaleString('it-IT')) : 'mai'}</strong></p>
        <label class="spunta"><input type="checkbox" id="includi-foto" checked> Includi le foto (file più grande)</label>
        <div class="riga-pulsanti">
          ${puoCondividere ? '<button type="button" class="pulsante" id="condividi">Salva su File / Condividi</button>' : ''}
          <button type="button" class="pulsante${puoCondividere ? ' secondario' : ''}" id="scarica">Scarica backup</button>
        </div>
        <h3 class="titoletto">Ripristino</h3>
        <p class="nota">Unisce il backup ai dati presenti: per ogni riga vince la versione modificata più di recente. Nulla viene cancellato.</p>
        <label class="pulsante secondario largo"><span>Importa da file JSON…</span><input type="file" accept="application/json,.json" id="importa" hidden></label>
      </section>

      <section class="passo">
        <h2>Archivio su questo dispositivo</h2>
        <dl class="dati">
          <dt>Articoli</dt><dd>${nArticoli}</dd>
          <dt>Ubicazioni</dt><dd>${nUbicazioni}</dd>
          <dt>File (foto)</dt><dd>${nFile}</dd>
          <dt>Spazio usato</dt><dd id="spazio">…</dd>
          <dt>Persistente</dt><dd id="persistente">…</dd>
        </dl>
        <p class="nota">Il conteggio include anche le righe eliminate (le eliminazioni sono logiche).</p>
        <button type="button" class="pulsante secondario largo" id="persisti" hidden>Chiedi archiviazione persistente</button>
      </section>

      <section class="passo disattivata">
        <h2>Sincronizzazione Google <span class="tenue">(Fase 3)</span></h2>
        <p class="nota">Non ancora disponibile. URL della web app e token verranno chiesti qui e salvati solo su questo dispositivo.</p>
        <label class="campo"><span class="etichetta">URL web app Apps Script</span><input disabled placeholder="https://script.google.com/macros/s/…/exec"></label>
        <label class="campo"><span class="etichetta">Token</span><input disabled type="password"></label>
        <p>Modifiche registrate in attesa di invio: <strong>${sinc.inAttesa}</strong></p>
      </section>

      <section class="passo">
        <h2>App</h2>
        <dl class="dati"><dt>Versione</dt><dd>${esc(versione || 'sconosciuta')}</dd><dt>Modalità</dt><dd>${matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'installata' : 'nel browser'}</dd></dl>
        <button type="button" class="pulsante secondario largo" id="aggiorna">Cerca aggiornamenti</button>
      </section>

      <section class="passo">
        <h2>Zona pericolosa</h2>
        <button type="button" class="pulsante pericolo largo" id="cancella">Cancella tutti i dati locali</button>
      </section>
    </div>`;

  // Spazio occupato e persistenza
  if (navigator.storage?.estimate) {
    navigator.storage.estimate().then(({ usage, quota }) => {
      el.querySelector('#spazio').textContent = `${formattaByte(usage)} su ${formattaByte(quota)} disponibili`;
    });
  } else el.querySelector('#spazio').textContent = 'non rilevabile';
  const btnPersisti = el.querySelector('#persisti');
  const aggiornaPersistenza = async () => {
    const p = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    el.querySelector('#persistente').textContent = p === null ? 'non rilevabile' : p ? 'sì' : 'no (il sistema potrebbe liberare spazio)';
    btnPersisti.hidden = p !== false || !navigator.storage?.persist;
  };
  aggiornaPersistenza();
  btnPersisti.addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    avviso(ok ? 'Archiviazione persistente concessa.' : 'Richiesta non concessa dal browser.', ok ? 'ok' : 'errore');
    aggiornaPersistenza();
  });

  // Esportazione
  const prepara = async () => {
    avviso('Preparo il backup…');
    const blob = await creaBackup({ includiFoto: el.querySelector('#includi-foto').checked });
    return new File([blob], nomeFileBackup(), { type: 'application/json' });
  };
  const registraBackup = async () => {
    await scriviImpostazione('ultimo_backup', new Date().toISOString());
    vai('#/impostazioni', { sostituisci: true });
  };
  el.querySelector('#scarica').addEventListener('click', async () => {
    try {
      const file = await prepara();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      avviso(`Backup creato (${formattaByte(file.size)}).`, 'ok');
      await registraBackup();
    } catch (e) {
      mostraErrore(e);
    }
  });
  // Safari consente la condivisione solo a ridosso del tocco: se la preparazione
  // del file ha richiesto troppo tempo, si chiede un secondo tocco.
  let pronto = null;
  const btnCondividi = el.querySelector('#condividi');
  btnCondividi?.addEventListener('click', async () => {
    const giaPronto = !!pronto;
    let file = pronto;
    pronto = null;
    try {
      if (!file) file = await prepara();
      await navigator.share({ files: [file], title: file.name });
      avviso(`Backup condiviso (${formattaByte(file.size)}).`, 'ok');
      await registraBackup();
    } catch (e) {
      if (e?.name === 'NotAllowedError' && file && !giaPronto) {
        pronto = file;
        btnCondividi.textContent = 'File pronto: tocca per salvare';
      } else if (e?.name !== 'AbortError') {
        mostraErrore(e);
      }
    }
  });

  // Importazione
  el.querySelector('#importa').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (!confirm(`Importare “${file.name}” unendolo ai dati presenti?`)) return;
    try {
      avviso('Importazione in corso…');
      const esito = await ripristinaBackup(file);
      avviso(`Importazione completata: ${esito.righe} righe e ${esito.file} foto aggiornate.`, 'ok');
      if (esito.codiciDuplicati.length) {
        avviso(`Codici presenti due volte, da sistemare in Ubicazioni: ${esito.codiciDuplicati.join(', ')}.`, 'errore');
      }
      vai('#/impostazioni', { sostituisci: true });
    } catch (e) {
      mostraErrore(e);
    }
  });

  el.querySelector('#aggiorna').addEventListener('click', async () => {
    try {
      const esito = await cercaAggiornamenti();
      avviso(esito, 'ok');
    } catch (e) {
      mostraErrore(e);
    }
  });

  el.querySelector('#cancella').addEventListener('click', async () => {
    const r = prompt('Verranno cancellati TUTTI i dati e le foto su questo dispositivo. Scrivi CANCELLA per confermare.');
    if (r !== 'CANCELLA') return;
    try {
      await cancellaTutto();
      avviso('Dati cancellati.', 'ok');
      location.reload();
    } catch (e) {
      mostraErrore(e);
    }
  });
}

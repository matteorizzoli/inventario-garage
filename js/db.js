// Archivio locale IndexedDB.
//
// Tabelle dati (stesse schede del futuro Google Sheet, SPEC §4):
//   ubicazioni, articoli, giacenze, foto, documenti
// Colonne comuni: id (UUID), aggiornato_il (ISO 8601), eliminato (booleano).
// Le eliminazioni sono sempre logiche.
//
// Archivi di servizio:
//   file          blob locali di foto (e in futuro PDF); chiave = id della riga foto/documento
//   coda          una voce per riga modificata, da inviare al foglio (Fase 3)
//   impostazioni  coppie chiave/valore solo locali (mai esportate)

import { uuid, adessoISO } from './util.js';

const NOME_DB = 'inventario-garage';
const VERSIONE_DB = 1;

export const TABELLE = ['ubicazioni', 'articoli', 'giacenze', 'foto', 'documenti'];

let connessione = null;

export function apri() {
  if (connessione) return connessione;
  connessione = new Promise((risolvi, rifiuta) => {
    if (!('indexedDB' in window)) {
      rifiuta(new Error('IndexedDB non disponibile in questo browser.'));
      return;
    }
    const rich = indexedDB.open(NOME_DB, VERSIONE_DB);
    rich.onupgradeneeded = (ev) => migra(rich.result, ev.oldVersion);
    rich.onsuccess = () => {
      const db = rich.result;
      // Un'altra scheda sta aggiornando lo schema: chiudere e ricaricare.
      db.onversionchange = () => {
        db.close();
        location.reload();
      };
      risolvi(db);
    };
    rich.onerror = () => rifiuta(rich.error);
    rich.onblocked = () =>
      rifiuta(new Error("Archivio bloccato: chiudi le altre finestre dell'app e riprova."));
  });
  connessione.catch(() => {
    connessione = null;
  });
  return connessione;
}

// Le migrazioni future si aggiungono come blocchi `if (daVersione < N)`.
function migra(db, daVersione) {
  if (daVersione < 1) {
    const ubi = db.createObjectStore('ubicazioni', { keyPath: 'id' });
    ubi.createIndex('id_padre', 'id_padre');
    ubi.createIndex('codice', 'codice');
    db.createObjectStore('articoli', { keyPath: 'id' });
    const gia = db.createObjectStore('giacenze', { keyPath: 'id' });
    gia.createIndex('id_articolo', 'id_articolo');
    gia.createIndex('id_ubicazione', 'id_ubicazione');
    db.createObjectStore('foto', { keyPath: 'id' }).createIndex('id_articolo', 'id_articolo');
    db.createObjectStore('documenti', { keyPath: 'id' }).createIndex('id_articolo', 'id_articolo');
    db.createObjectStore('file', { keyPath: 'id' });
    db.createObjectStore('coda', { keyPath: 'chiave' });
    db.createObjectStore('impostazioni', { keyPath: 'chiave' });
  }
}

function richiesta(r) {
  return new Promise((ok, ko) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(traduciErrore(r.error));
  });
}

function completa(tx) {
  return new Promise((ok, ko) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ko(traduciErrore(tx.error));
    tx.onabort = () => ko(traduciErrore(tx.error));
  });
}

export function traduciErrore(e) {
  if (e && e.name === 'QuotaExceededError') {
    return new Error(
      'Spazio di archiviazione esaurito sul dispositivo. Esporta un backup ed elimina le foto non necessarie.'
    );
  }
  return e || new Error("Errore dell'archivio locale.");
}

export async function tutti(archivio) {
  const db = await apri();
  return richiesta(db.transaction(archivio).objectStore(archivio).getAll());
}

export async function leggi(archivio, id) {
  const db = await apri();
  return richiesta(db.transaction(archivio).objectStore(archivio).get(id));
}

export async function leggiMolti(archivio, ids) {
  const db = await apri();
  const st = db.transaction(archivio).objectStore(archivio);
  return Promise.all(ids.map((id) => richiesta(st.get(id))));
}

export async function conta(archivio) {
  const db = await apri();
  return richiesta(db.transaction(archivio).objectStore(archivio).count());
}

/**
 * Scrive più record in un'unica transazione (tutto o niente).
 * operazioni: [{ archivio, record }] oppure, solo per gli archivi di servizio
 * (es. `file`), [{ archivio, eliminaChiave }] per una cancellazione fisica.
 * Per le tabelle dati imposta id (se manca), aggiornato_il ed eliminato,
 * e registra la modifica nella coda di sincronizzazione.
 * Il record passato viene modificato e restituito.
 */
export async function scrivi(operazioni) {
  const db = await apri();
  const archivi = [...new Set(operazioni.map((o) => o.archivio))];
  const conCoda = archivi.some((a) => TABELLE.includes(a));
  const tx = db.transaction(conCoda ? [...archivi, 'coda'] : archivi, 'readwrite');
  const ora = adessoISO();
  for (const { archivio, record, eliminaChiave } of operazioni) {
    const st = tx.objectStore(archivio);
    if (!TABELLE.includes(archivio)) {
      if (eliminaChiave !== undefined) st.delete(eliminaChiave);
      else st.put(record);
      continue;
    }
    if (!record.id) record.id = uuid();
    record.aggiornato_il = ora;
    record.eliminato = !!record.eliminato;
    const esistente = st.get(record.id);
    esistente.onsuccess = () => {
      const op = record.eliminato ? 'elimina' : esistente.result ? 'modifica' : 'crea';
      st.put(record);
      accoda(tx, archivio, record.id, op, ora);
    };
  }
  await completa(tx);
  return operazioni.map((o) => o.record);
}

export async function salva(archivio, record) {
  const [r] = await scrivi([{ archivio, record }]);
  return r;
}

/** Eliminazione logica di una riga. */
export async function eliminaLogico(archivio, id) {
  const r = await leggi(archivio, id);
  if (!r) return;
  r.eliminato = true;
  await salva(archivio, r);
}

// Una sola voce per riga: la coda dice "questa riga va inviata", il contenuto
// si rilegge dalla tabella al momento dell'invio. Una creazione non ancora
// inviata resta 'crea' anche se la riga viene poi modificata.
function accoda(tx, archivio, id, operazione, il) {
  const coda = tx.objectStore('coda');
  const chiave = `${archivio}:${id}`;
  const r = coda.get(chiave);
  r.onsuccess = () => {
    const prec = r.result;
    const op = prec && prec.operazione === 'crea' && operazione === 'modifica' ? 'crea' : operazione;
    coda.put({ chiave, tabella: archivio, id, operazione: op, il });
  };
}

/**
 * Importazione con fusione: una riga entra solo se manca o se la copia
 * importata ha aggiornato_il più recente (stessa regola dei conflitti, SPEC §3.2).
 * Restituisce il numero di righe scritte.
 */
export async function fondiRecord(archivio, righe) {
  if (!righe?.length) return 0;
  const db = await apri();
  const tx = db.transaction([archivio, 'coda'], 'readwrite');
  const st = tx.objectStore(archivio);
  let scritte = 0;
  for (const riga of righe) {
    if (!riga || typeof riga.id !== 'string') continue;
    const r = st.get(riga.id);
    r.onsuccess = () => {
      const locale = r.result;
      if (locale && String(locale.aggiornato_il) >= String(riga.aggiornato_il)) return;
      riga.eliminato = riga.eliminato === true || riga.eliminato === 'VERO';
      st.put(riga);
      accoda(tx, archivio, riga.id, riga.eliminato ? 'elimina' : locale ? 'modifica' : 'crea', riga.aggiornato_il);
      scritte++;
    };
  }
  await completa(tx);
  return scritte;
}

/** Aggiunge i file mancanti (quelli già presenti non vengono toccati). */
export async function aggiungiFileMancanti(righe) {
  if (!righe.length) return 0;
  const db = await apri();
  const tx = db.transaction('file', 'readwrite');
  const st = tx.objectStore('file');
  let scritti = 0;
  for (const riga of righe) {
    const r = st.getKey(riga.id);
    r.onsuccess = () => {
      if (r.result !== undefined) return;
      st.put(riga);
      scritti++;
    };
  }
  await completa(tx);
  return scritti;
}

export async function leggiImpostazione(chiave, predefinito = null) {
  const r = await leggi('impostazioni', chiave);
  return r ? r.valore : predefinito;
}

export async function scriviImpostazione(chiave, valore) {
  await scrivi([{ archivio: 'impostazioni', record: { chiave, valore } }]);
}

/** Svuota completamente l'archivio locale (dati, file, coda, impostazioni). */
export async function cancellaTutto() {
  const db = await apri();
  const nomi = [...db.objectStoreNames];
  const tx = db.transaction(nomi, 'readwrite');
  for (const n of nomi) tx.objectStore(n).clear();
  await completa(tx);
}

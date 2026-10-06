// Esportazione e importazione in JSON: backup provvisorio finché non c'è la
// sincronizzazione con il foglio (Fase 3).
//
// Formato (versione 1):
// {
//   "app": "inventario-garage", "formato": 1, "esportato_il": "<ISO>",
//   "tabelle": { "ubicazioni": [...], "articoli": [...], "giacenze": [...], "foto": [...], "documenti": [...] },
//   "file": [ { "id", "tipo_mime", "caricato", "dati": "data:...base64", "miniatura": "data:...base64" } ]
// }
// Le righe eliminate logicamente sono incluse. Le impostazioni locali e la
// coda di sincronizzazione NON sono esportate (in futuro conterranno URL e token).

import { TABELLE, tutti, apri, scrivi, fondiRecord, aggiungiFileMancanti } from './db.js';

const FORMATO = 1;

function blobInDataUrl(blob) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.readAsDataURL(blob);
  });
}

function dataUrlInBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const tipo = m[1] || 'application/octet-stream';
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: tipo });
  const bin = atob(m[3]);
  const byte = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) byte[i] = bin.charCodeAt(i);
  return new Blob([byte], { type: tipo });
}

/** Legge i file uno alla volta per non tenere in memoria tutti i blob insieme. */
async function* scorriFile() {
  const db = await apri();
  const chiavi = await new Promise((ok, ko) => {
    const r = db.transaction('file').objectStore('file').getAllKeys();
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  for (const k of chiavi) {
    const f = await new Promise((ok, ko) => {
      const r = db.transaction('file').objectStore('file').get(k);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    if (f) yield f;
  }
}

/**
 * Crea il file di backup. Il JSON è assemblato a pezzi in un Blob per non
 * costruire un'unica stringa enorme (importante su iPhone).
 */
export async function creaBackup({ includiFoto = true } = {}) {
  const pezzi = [
    `{"app":"inventario-garage","formato":${FORMATO},"esportato_il":${JSON.stringify(new Date().toISOString())},"tabelle":{`,
  ];
  for (const [i, t] of TABELLE.entries()) {
    pezzi.push(`${i ? ',' : ''}${JSON.stringify(t)}:${JSON.stringify(await tutti(t))}`);
  }
  pezzi.push('},"file":[');
  if (includiFoto) {
    let primo = true;
    for await (const f of scorriFile()) {
      const voce = {
        id: f.id,
        tipo_mime: f.tipo_mime || f.blob?.type || '',
        caricato: !!f.caricato,
        dati: f.blob ? await blobInDataUrl(f.blob) : '',
        miniatura: f.miniatura ? await blobInDataUrl(f.miniatura) : '',
      };
      pezzi.push((primo ? '' : ',') + JSON.stringify(voce));
      primo = false;
    }
  }
  pezzi.push(']}');
  return new Blob(pezzi, { type: 'application/json' });
}

export function nomeFileBackup() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `inventario-garage-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/**
 * Ripristina da un file di backup fondendo con i dati presenti:
 * per ogni riga vince la versione con aggiornato_il più recente;
 * i file (foto) vengono aggiunti solo se mancano.
 */
export async function ripristinaBackup(file) {
  let dati;
  try {
    dati = JSON.parse(await file.text());
  } catch {
    throw new Error('Il file non è un JSON valido.');
  }
  if (dati?.app !== 'inventario-garage' || !dati.tabelle) {
    throw new Error('Il file non è un backup di Inventario Garage.');
  }
  if (dati.formato > FORMATO) {
    throw new Error('Backup creato da una versione più recente dell’app: aggiorna l’app e riprova.');
  }
  const esito = { righe: 0, file: 0 };
  for (const t of TABELLE) {
    if (Array.isArray(dati.tabelle[t])) esito.righe += await fondiRecord(t, dati.tabelle[t]);
  }
  const file_ = (Array.isArray(dati.file) ? dati.file : [])
    .filter((f) => f && typeof f.id === 'string' && f.dati)
    .map((f) => ({
      id: f.id,
      tipo_mime: f.tipo_mime || '',
      caricato: !!f.caricato,
      blob: dataUrlInBlob(f.dati),
      miniatura: f.miniatura ? dataUrlInBlob(f.miniatura) : null,
    }));
  esito.file = await aggiungiFileMancanti(file_);
  esito.codiciDuplicati = await risolviCodiciDuplicati(dati.tabelle.ubicazioni || []);
  return esito;
}

/**
 * Le ubicazioni hanno id diversi su dispositivi diversi (es. i luoghi
 * predefiniti creati al primo avvio): dopo l'importazione lo stesso codice può
 * comparire due volte. La copia locale, se vuota, si elimina; altrimenti il
 * codice viene segnalato perché va sistemato a mano.
 */
async function risolviCodiciDuplicati(importate) {
  const idImportati = new Set(importate.map((u) => u?.id));
  const [ubicazioni, giacenze] = await Promise.all([tutti('ubicazioni'), tutti('giacenze')]);
  const attive = ubicazioni.filter((u) => !u.eliminato);
  const usate = new Set([
    ...attive.map((u) => u.id_padre),
    ...giacenze.filter((g) => !g.eliminato).map((g) => g.id_ubicazione),
  ]);
  const perCodice = new Map();
  for (const u of attive) perCodice.set(u.codice, [...(perCodice.get(u.codice) || []), u]);
  const daEliminare = [];
  const irrisolti = [];
  for (const [codice, gruppo] of perCodice) {
    if (gruppo.length < 2) continue;
    for (const u of gruppo.filter((x) => !idImportati.has(x.id))) {
      if (usate.has(u.id)) irrisolti.push(codice);
      else daEliminare.push({ archivio: 'ubicazioni', record: { ...u, eliminato: true } });
    }
  }
  if (daEliminare.length) await scrivi(daEliminare);
  return [...new Set(irrisolti)];
}

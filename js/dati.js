// Lettura dei dati in memoria e funzioni di navigazione della gerarchia.
// I volumi previsti (centinaia o poche migliaia di righe) permettono di
// caricare tutto a ogni vista: più semplice e sempre coerente.

import { tutti, scrivi, leggiImpostazione, scriviImpostazione } from './db.js';
import { LUOGHI_PREDEFINITI, LUOGO_PREDEFINITO, confrontaUbicazioni } from './modello.js';

function aggiungi(mappa, chiave, valore) {
  const l = mappa.get(chiave);
  if (l) l.push(valore);
  else mappa.set(chiave, [valore]);
}

/**
 * Restituisce:
 *  tutteUbicazioni   anche eliminate (per non riusare i codici)
 *  ubi               Map id → ubicazione attiva
 *  figli             Map id_padre ('' per i luoghi) → [ubicazioni] ordinate
 *  articoli          Map id → articolo attivo
 *  giacenzePerArticolo, giacenzePerUbicazione   Map → [giacenze attive]
 *  fotoPerArticolo   Map id_articolo → [foto] ordinate per `ordine`
 *  foto              Map id → foto attiva
 */
export async function carica() {
  const [ubicazioni, articoli, giacenze, foto] = await Promise.all(
    ['ubicazioni', 'articoli', 'giacenze', 'foto'].map((t) => tutti(t))
  );
  const d = {
    tutteUbicazioni: ubicazioni,
    ubi: new Map(),
    figli: new Map(),
    articoli: new Map(),
    giacenzePerArticolo: new Map(),
    giacenzePerUbicazione: new Map(),
    fotoPerArticolo: new Map(),
    foto: new Map(),
  };
  for (const u of ubicazioni) if (!u.eliminato) d.ubi.set(u.id, u);
  for (const u of d.ubi.values()) {
    // Un padre eliminato o mancante non deve far sparire il ramo: lo si mostra alla radice.
    const padre = u.id_padre && d.ubi.has(u.id_padre) ? u.id_padre : '';
    aggiungi(d.figli, padre, u);
  }
  for (const l of d.figli.values()) l.sort(confrontaUbicazioni);

  for (const a of articoli) if (!a.eliminato) d.articoli.set(a.id, a);
  for (const g of giacenze) {
    if (g.eliminato || !d.articoli.has(g.id_articolo)) continue;
    aggiungi(d.giacenzePerArticolo, g.id_articolo, g);
    aggiungi(d.giacenzePerUbicazione, g.id_ubicazione, g);
  }
  for (const f of foto) {
    if (f.eliminato) continue;
    d.foto.set(f.id, f);
    if (f.id_articolo) aggiungi(d.fotoPerArticolo, f.id_articolo, f);
  }
  for (const l of d.fotoPerArticolo.values()) l.sort((a, b) => Number(a.ordine) - Number(b.ordine));
  return d;
}

/** Catena dal luogo fino all'ubicazione indicata (inclusa). */
export function antenati(d, u) {
  const catena = [];
  const visti = new Set();
  let cur = u;
  while (cur && !visti.has(cur.id)) {
    visti.add(cur.id);
    catena.unshift(cur);
    cur = cur.id_padre ? d.ubi.get(cur.id_padre) : null;
  }
  return catena;
}

export function luogoDi(d, u) {
  const a = antenati(d, u);
  return a.length && a[0].tipo === 'luogo' ? a[0] : null;
}

/**
 * Codice leggibile del posto. Mobili e posizioni contengono già il codice
 * del padre; per i contenitori (codice indipendente) si antepone il padre.
 */
export function codicePercorso(d, u) {
  if (!u) return '';
  if (u.tipo === 'contenitore' && u.id_padre && d.ubi.has(u.id_padre)) {
    return `${d.ubi.get(u.id_padre).codice} › ${u.codice}`;
  }
  return u.codice;
}

/** Ids dell'ubicazione e di tutti i suoi discendenti. */
export function discendenti(d, id) {
  const ris = new Set([id]);
  const pila = [id];
  while (pila.length) {
    for (const f of d.figli.get(pila.pop()) || []) {
      if (!ris.has(f.id)) {
        ris.add(f.id);
        pila.push(f.id);
      }
    }
  }
  return ris;
}

/** Elenco piatto in ordine di albero, con il livello di profondità. */
export function alberoPiatto(d) {
  const out = [];
  const visita = (idPadre, livello) => {
    for (const u of d.figli.get(idPadre) || []) {
      out.push({ u, livello });
      visita(u.id, livello + 1);
    }
  };
  visita('', 0);
  return out;
}

/** Crea i luoghi predefiniti al primo avvio (una sola volta). */
export async function inizializza() {
  if (await leggiImpostazione('luoghi_predefiniti_creati', false)) return;
  const esistenti = await tutti('ubicazioni');
  const codici = new Set(esistenti.map((u) => u.codice));
  const ops = LUOGHI_PREDEFINITI.filter(([c]) => !codici.has(c)).map(([codice, descrizione]) => ({
    archivio: 'ubicazioni',
    record: { tipo: 'luogo', codice, descrizione, id_padre: '', id_foto: '' },
  }));
  if (ops.length) await scrivi(ops);
  await scriviImpostazione('luoghi_predefiniti_creati', true);
}

// ---------- Ubicazioni usate di recente (per l'inserimento veloce) ----------

const MAX_RECENTI = 6;

export async function ubicazioniRecenti() {
  return leggiImpostazione('ubicazioni_recenti', []);
}

export async function registraUbicazioneUsata(id) {
  const l = (await ubicazioniRecenti()).filter((x) => x !== id);
  l.unshift(id);
  await scriviImpostazione('ubicazioni_recenti', l.slice(0, MAX_RECENTI));
}

/** Ultima ubicazione usata ancora valida, altrimenti il luogo predefinito. */
export function ubicazioneIniziale(d, recenti) {
  for (const id of recenti) if (d.ubi.has(id)) return d.ubi.get(id);
  for (const u of d.ubi.values()) if (u.tipo === 'luogo' && u.codice === LUOGO_PREDEFINITO) return u;
  return null;
}

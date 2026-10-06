// Sincronizzazione con Google Sheet / Drive tramite Apps Script — FASE 3, NON IMPLEMENTATA.
//
// Cosa è già predisposto dalla Fase 1:
//  - ogni scrittura su una tabella dati crea/aggiorna una voce nell'archivio
//    `coda` ({ chiave: "tabella:id", tabella, id, operazione, il });
//  - i blob delle foto stanno nell'archivio `file` con il flag `caricato: false`;
//    la riga `foto` ha già la colonna `id_file_drive` (vuota);
//  - eliminazioni solo logiche e `aggiornato_il` su ogni riga (regola dei conflitti).
//
// Cosa resta da fare (SPEC §3.1, §3.2, §6):
//  - impostazioni: URL della web app e token, salvati solo in `impostazioni`;
//  - chiamate POST con Content-Type text/plain (niente preflight CORS);
//  - azioni pull / push / upload / file; svuotamento della coda quando c'è rete
//    e l'app è aperta; coda separata e ripresa per i file.

import { conta } from './db.js';

export const ATTIVA = false;

/** Stato per l'indicatore. In Fase 1 è sempre "solo locale". */
export async function statoSincronizzazione() {
  return { attiva: ATTIVA, inAttesa: await conta('coda') };
}

export async function sincronizzaOra() {
  throw new Error('La sincronizzazione con Google arriverà nella Fase 3.');
}

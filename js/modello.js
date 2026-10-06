// Vocabolari, valori predefiniti e convenzione dei codici (SPEC §4).

import { confrontaCodici } from './util.js';

// ---------- Ubicazioni ----------

export const TIPI_UBICAZIONE = ['luogo', 'mobile', 'posizione', 'contenitore'];

export const NOMI_TIPO = {
  luogo: 'Luogo',
  mobile: 'Mobile',
  posizione: 'Posizione',
  contenitore: 'Contenitore',
};

/** Luoghi creati al primo avvio, nell'ordine in cui compaiono. */
export const LUOGHI_PREDEFINITI = [
  ['GAR', 'Garage'],
  ['CAN', 'Cantina'],
  ['BAL', 'Balcone'],
  ['PI1', 'Primo piano'],
  ['PI2', 'Secondo piano'],
  ['MAM', 'Casa della mamma'],
  ['CN2', 'Cantina del nuovo appartamento'],
];
export const LUOGO_PREDEFINITO = 'GAR';

export const LETTERE_MOBILE = {
  A: 'Armadio / armadietto',
  S: 'Scaffale / libreria',
  P: 'Parete attrezzata / supporto metallico',
  B: 'Banco',
  Z: 'Zona a terra / senza mobile',
};

// La SPEC indica R e C; per i settori di parete non fissa la lettera: si usa S.
export const LETTERE_POSIZIONE = {
  R: 'Ripiano (dal basso verso l’alto)',
  C: 'Cassetto (dall’alto verso il basso)',
  S: 'Settore di parete (da sinistra a destra)',
};

/** Tipi ammessi come livello superiore. I livelli intermedi si possono saltare. */
export const PADRI_AMMESSI = {
  luogo: [],
  mobile: ['luogo'],
  posizione: ['luogo', 'mobile'],
  contenitore: ['luogo', 'mobile', 'posizione'],
};

/** Tipi che si possono creare sotto un'ubicazione di un certo tipo. */
export function figliAmmessi(tipo) {
  return TIPI_UBICAZIONE.filter((t) => PADRI_AMMESSI[t].includes(tipo));
}

/** Il codice di mobili e posizioni contiene quello del padre: il padre è fisso. */
export function padreModificabile(tipo) {
  return tipo === 'contenitore';
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Prossimo codice libero.
 * `ubicazioni` deve includere anche quelle eliminate, così un codice già
 * stampato su un'etichetta non viene riassegnato.
 */
export function prossimoCodice(tipo, padre, lettera, ubicazioni) {
  if (tipo === 'contenitore') {
    let max = 0;
    for (const u of ubicazioni) {
      const m = u.tipo === 'contenitore' && /^K(\d+)$/.exec(u.codice || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `K${String(max + 1).padStart(3, '0')}`;
  }
  if ((tipo === 'mobile' || tipo === 'posizione') && padre && lettera) {
    const prefisso = `${padre.codice}-${lettera}`;
    const re = new RegExp(`^${escRe(prefisso)}(\\d+)$`);
    let max = 0;
    for (const u of ubicazioni) {
      const m = re.exec(u.codice || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefisso}${max + 1}`;
  }
  return '';
}

/** Restituisce un messaggio d'errore, oppure '' se il codice è valido. */
export function verificaCodice(tipo, codice, padre, ubicazioniAttive, idEscluso) {
  if (!codice) return 'Il codice è obbligatorio.';
  if (tipo === 'luogo' && !/^[A-Z0-9]{3}$/.test(codice)) {
    return 'Il codice del luogo è una sigla di 3 caratteri (lettere maiuscole o cifre), es. GAR.';
  }
  if (tipo === 'mobile') {
    if (!padre) return 'Un mobile deve stare in un luogo.';
    const re = new RegExp(`^${escRe(padre.codice)}-[${Object.keys(LETTERE_MOBILE).join('')}][1-9]\\d*$`);
    if (!re.test(codice)) return `Formato atteso: ${padre.codice}-A1 (lettere ${Object.keys(LETTERE_MOBILE).join(', ')}).`;
  }
  if (tipo === 'posizione') {
    if (!padre) return 'Una posizione deve stare in un mobile o in un luogo.';
    const re = new RegExp(`^${escRe(padre.codice)}-[${Object.keys(LETTERE_POSIZIONE).join('')}][1-9]\\d*$`);
    if (!re.test(codice)) return `Formato atteso: ${padre.codice}-R1 (lettere ${Object.keys(LETTERE_POSIZIONE).join(', ')}).`;
  }
  if (tipo === 'contenitore') {
    if (!padre) return 'Indica dove si trova il contenitore.';
    if (!/^K\d{3,}$/.test(codice)) return 'Formato atteso: K seguito da almeno 3 cifre, es. K001.';
  }
  const doppio = ubicazioniAttive.find((u) => u.codice === codice && u.id !== idEscluso);
  if (doppio) return `Il codice ${codice} è già usato.`;
  return '';
}

/** Ordine di visualizzazione: luoghi predefiniti nell'ordine della SPEC, poi naturale per codice. */
export function confrontaUbicazioni(a, b) {
  if (a.tipo === 'luogo' && b.tipo === 'luogo') {
    const ia = LUOGHI_PREDEFINITI.findIndex(([c]) => c === a.codice);
    const ib = LUOGHI_PREDEFINITI.findIndex(([c]) => c === b.codice);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }
  const ta = TIPI_UBICAZIONE.indexOf(a.tipo);
  const tb = TIPI_UBICAZIONE.indexOf(b.tipo);
  if (ta !== tb) return ta - tb;
  return confrontaCodici(a.codice, b.codice);
}

// ---------- Articoli e giacenze ----------

export const TIPI_ARTICOLO = { materiale: 'Materiale', attrezzo: 'Attrezzo' };

export const CATEGORIE = {
  materiale: ['minuteria', 'custom', 'legname', 'elettrico', 'altro'],
  attrezzo: ['elettroutensile', 'manuale', 'misura', 'altro'],
};

export const MODI_QUANTITA = { stati: 'Stato', esatta: 'Quantità', nessuna: 'Nessuna' };

export const STATI = ['pieno', 'metà', 'in esaurimento', 'finito'];
export const STATI_DA_RIFORNIRE = ['in esaurimento', 'finito'];

export const UNITA = ['pz', 'm'];

/**
 * Modo di quantità predefinito (SPEC §4.2): attrezzi → nessuna;
 * minuteria → stati; custom, legname → esatta (pz); elettrico → esatta (m).
 * Per le categorie senza indicazione si usa "stati".
 */
export function quantitaPredefinita(tipo, categoria) {
  if (tipo === 'attrezzo') return { modo: 'nessuna', unita: '' };
  switch (categoria) {
    case 'custom':
    case 'legname':
      return { modo: 'esatta', unita: 'pz' };
    case 'elettrico':
      return { modo: 'esatta', unita: 'm' };
    default:
      return { modo: 'stati', unita: '' };
  }
}

/** Testo breve della quantità di una giacenza. */
export function testoQuantita(articolo, giacenza) {
  if (!giacenza) return '';
  if (articolo.modo_quantita === 'stati') return giacenza.stato || '';
  if (articolo.modo_quantita === 'esatta') {
    if (giacenza.quantita === '' || giacenza.quantita == null) return '';
    const n = Number(giacenza.quantita).toLocaleString('it-IT');
    return `${n} ${articolo.unita || ''}`.trim();
  }
  return '';
}

/** Classe CSS del colore di uno stato. */
export function classeStato(stato) {
  return { pieno: 'st-pieno', metà: 'st-meta', 'in esaurimento': 'st-esaur', finito: 'st-finito' }[stato] || '';
}

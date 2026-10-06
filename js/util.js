// Funzioni di servizio condivise da tutti i moduli.

/** UUID v4. crypto.randomUUID esiste solo in contesto sicuro (HTTPS) e iOS ≥ 15.4. */
export function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const ENTITA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape per l'inserimento di testo in HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ENTITA[c]);
}

export function adessoISO() {
  return new Date().toISOString();
}

/** Data locale odierna in formato AAAA-MM-GG. */
export function oggiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Minuscolo e senza accenti, per la ricerca. */
export function normalizza(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Ordinamento naturale (A2 prima di A10). */
export function confrontaCodici(a, b) {
  return String(a).localeCompare(String(b), 'it', { numeric: true, sensitivity: 'base' });
}

export function formattaData(iso) {
  if (!iso) return '';
  const solaData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(solaData ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formattaByte(n) {
  if (!Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString('it-IT', { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
}

/** Messaggio breve in sovrimpressione. tipo: 'ok' | 'errore' | '' */
export function avviso(testo, tipo = '') {
  const box = document.getElementById('avvisi');
  // Al massimo due avvisi a schermo: i più vecchi lasciano il posto.
  while (box.children.length >= 2) box.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `avviso ${tipo}`;
  el.textContent = testo;
  box.append(el);
  setTimeout(() => el.classList.add('via'), tipo === 'errore' ? 5000 : 2500);
  setTimeout(() => el.remove(), tipo === 'errore' ? 5600 : 3100);
}

/** Mostra un errore in modo comprensibile e lo registra in console. */
export function mostraErrore(e) {
  console.error(e);
  avviso(e?.message || String(e), 'errore');
}

/**
 * Object URL delle immagini, raggruppati per vista. A ogni cambio vista si apre
 * un nuovo gruppo; quello precedente si rilascia quando la nuova vista è a schermo.
 */
let urlTemporanei = new Set();
export function urlTemporaneo(blob) {
  const url = URL.createObjectURL(blob);
  urlTemporanei.add(url);
  return url;
}
export function nuovoGruppoUrl() {
  const precedenti = urlTemporanei;
  urlTemporanei = new Set();
  return () => {
    for (const u of precedenti) URL.revokeObjectURL(u);
  };
}

/** Navigazione interna (rotte con hash, compatibili con GitHub Pages in sottocartella). */
export function vai(hash, { sostituisci = false } = {}) {
  if (sostituisci || location.hash === hash) {
    if (sostituisci) history.replaceState(history.state, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

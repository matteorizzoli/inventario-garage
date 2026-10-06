// Avvio dell'app e navigazione a hash (#/percorso?parametri): con l'hash
// GitHub Pages serve sempre index.html, anche in una sottocartella.

import { mostraErrore, nuovoGruppoUrl, esc } from './util.js';
import { apri } from './db.js';
import { inizializza } from './dati.js';
import { registraServiceWorker } from './pwa.js';
import { statoSincronizzazione } from './sync.js';
import * as cerca from './viste/cerca.js';
import * as aggiungi from './viste/aggiungi.js';
import * as articolo from './viste/articolo.js';
import * as ubicazioni from './viste/ubicazioni.js';
import * as ubicazione from './viste/ubicazione.js';
import * as ubicazioneForm from './viste/ubicazione-form.js';
import * as impostazioni from './viste/impostazioni.js';

// Fasi successive: 'scansiona' (Fase 2), 'attrezzi' e 'manuali' (Fase 4).
const ROTTE = [
  ['cerca', cerca],
  ['aggiungi', aggiungi],
  ['articolo/:id', articolo],
  ['ubicazioni', ubicazioni],
  ['ubicazione/:id', ubicazione],
  ['ubicazione-nuova', ubicazioneForm],
  ['ubicazione-modifica/:id', ubicazioneForm],
  ['impostazioni', impostazioni],
];

function risolvi(hash) {
  const [percorso, qs = ''] = hash.replace(/^#\/?/, '').split('?');
  const parti = percorso.split('/');
  for (const [schema, vista] of ROTTE) {
    const s = schema.split('/');
    if (s[0] !== parti[0] || s.length !== parti.length) continue;
    return {
      vista,
      param: s[1] ? decodeURIComponent(parti[1]) : undefined,
      query: Object.fromEntries(new URLSearchParams(qs)),
    };
  }
  return { vista: cerca, param: undefined, query: {} };
}

const main = document.getElementById('vista');
const posizioniScorrimento = new Map();
let hashCorrente = '';
let contatore = 0;

async function naviga() {
  const n = ++contatore;
  if (hashCorrente) posizioniScorrimento.set(hashCorrente, window.scrollY);
  const { vista, param, query } = risolvi(location.hash);

  document.querySelectorAll('.foglio, .visore').forEach((x) => x.remove());
  document.body.classList.remove('bloccato');

  const rilasciaUrl = nuovoGruppoUrl();
  const contenitore = document.createElement('div');
  contenitore.className = 'vista';
  try {
    await vista.mostra(contenitore, { param, query });
  } catch (e) {
    mostraErrore(e);
    contenitore.innerHTML = `<div class="vuoto grande"><p>Si è verificato un errore.</p><p class="tenue">${esc(e?.message || e)}</p></div>`;
  }
  if (n !== contatore) return; // nel frattempo è partita un'altra navigazione

  main.replaceChildren(contenitore);
  rilasciaUrl();
  document.getElementById('titolo').textContent = vista.titolo;
  document.title = `${vista.titolo} · Inventario Garage`;
  document.querySelectorAll('.barra-schede a').forEach((a) => {
    const attiva = a.dataset.scheda === vista.scheda;
    a.classList.toggle('attiva', attiva);
    if (attiva) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.classList.toggle('con-azioni', !!contenitore.querySelector('.azioni-fisse'));
  hashCorrente = location.hash;
  window.scrollTo(0, posizioniScorrimento.get(hashCorrente) || 0);
  aggiornaIndicatore();
}

async function aggiornaIndicatore() {
  const el = document.getElementById('indicatore');
  try {
    const s = await statoSincronizzazione();
    el.className = `indicatore ${navigator.onLine ? 'online' : 'offline'}`;
    el.textContent = 'Solo locale';
    el.title = `${navigator.onLine ? 'In rete' : 'Senza rete'} · sincronizzazione non attiva (Fase 3) · ${s.inAttesa} modifiche registrate`;
  } catch {
    el.textContent = '';
  }
}

// Su touch, con la tastiera aperta si nasconde la barra delle schede: la barra
// delle azioni (es. il campo di ricerca) resta subito sopra la tastiera.
const CAMPO_TESTO = 'input:not([type="radio"]):not([type="checkbox"]):not([type="file"]), textarea, select';
if (matchMedia('(pointer: coarse)').matches) {
  document.addEventListener('focusin', (ev) => {
    if (ev.target.matches?.(CAMPO_TESTO)) document.body.classList.add('tastiera');
  });
  document.addEventListener('focusout', () =>
    setTimeout(() => {
      if (!document.activeElement?.matches?.(CAMPO_TESTO)) document.body.classList.remove('tastiera');
    }, 0)
  );
}

async function avvia() {
  try {
    await apri();
    await inizializza();
  } catch (e) {
    main.innerHTML = `<div class="vuoto grande"><p>Impossibile aprire l’archivio locale.</p><p class="tenue">${esc(e?.message || e)}</p>
      <p class="nota">In navigazione privata Safari può bloccare l’archivio.</p></div>`;
    return;
  }
  window.addEventListener('hashchange', naviga);
  window.addEventListener('online', aggiornaIndicatore);
  window.addEventListener('offline', aggiornaIndicatore);
  if (!location.hash) history.replaceState(null, '', '#/cerca');
  await naviga();
  registraServiceWorker();
  // Chiede di non far liberare lo spazio dal sistema (concesso o no a discrezione del browser).
  navigator.storage?.persist?.().catch(() => {});
}

avvia();

// Campi dell'articolo condivisi da "Aggiungi" e dalla scheda articolo.

import { esc } from '../util.js';
import { CATEGORIE, TIPI_ARTICOLO, MODI_QUANTITA, UNITA, quantitaPredefinita } from '../modello.js';
import { segmentato } from './componenti.js';

function opzioniCategoria(tipo, valore) {
  return `<option value="">— nessuna —</option>${(CATEGORIE[tipo] || [])
    .map((c) => `<option value="${esc(c)}"${c === valore ? ' selected' : ''}>${esc(c)}</option>`)
    .join('')}`;
}

export function campoTipo(a) {
  return `<div class="campo"><span class="etichetta">Tipo</span>${segmentato('tipo', Object.entries(TIPI_ARTICOLO), a.tipo || 'materiale')}</div>`;
}

export function campoCategoria(a) {
  return `<label class="campo"><span class="etichetta">Categoria</span>
    <select name="categoria">${opzioniCategoria(a.tipo || 'materiale', a.categoria)}</select></label>`;
}

export function campoModo(a) {
  return `<div class="campo"><span class="etichetta">Come conti la quantità</span>${segmentato('modo_quantita', Object.entries(MODI_QUANTITA), a.modo_quantita || 'stati')}</div>`;
}

export function campoUnita(a) {
  return `<div class="campo" data-se-modo="esatta"><span class="etichetta">Unità</span>${segmentato('unita', UNITA.map((u) => [u, u]), a.unita || 'pz')}</div>`;
}

export function campiFacoltativi(a) {
  const t = (nome, etichetta, extra = '') =>
    `<label class="campo"><span class="etichetta">${etichetta}</span><input name="${nome}" value="${esc(a[nome] || '')}" autocomplete="off" ${extra}></label>`;
  return `
    ${t('marca', 'Marca', 'autocapitalize="words"')}
    ${t('modello', 'Modello', 'autocapitalize="none"')}
    ${t('attributi', 'Attributi', 'placeholder="filetto=M6; lunghezza=20; materiale=inox A2" autocapitalize="none" spellcheck="false"')}
    ${t('tag', 'Tag', 'placeholder="parole per la ricerca" autocapitalize="none"')}
    <label class="campo"><span class="etichetta">Note</span><textarea name="note" rows="3">${esc(a.note || '')}</textarea></label>`;
}

/** Mostra solo i blocchi [data-se-modo] coerenti con il modo scelto. */
export function aggiornaVisibilita(form) {
  const modo = form.elements.modo_quantita?.value || 'stati';
  form.querySelectorAll('[data-se-modo]').forEach((el) => {
    el.hidden = el.dataset.seModo !== modo;
  });
}

function scegliRadio(form, nome, valore) {
  const r = [...form.querySelectorAll(`input[name="${nome}"]`)].find((x) => x.value === valore);
  if (r) r.checked = true;
}

/**
 * Collega tipo → categorie e tipo/categoria → modo di quantità predefinito.
 * Il predefinito si applica finché l'utente non sceglie il modo a mano
 * (`modoFisso` = true per gli articoli esistenti).
 */
export function collegaCampi(form, { modoFisso = false } = {}) {
  let modoToccato = modoFisso;
  const applicaPredefinito = () => {
    if (modoToccato) return;
    const { modo, unita } = quantitaPredefinita(form.elements.tipo.value, form.elements.categoria.value);
    scegliRadio(form, 'modo_quantita', modo);
    if (unita) scegliRadio(form, 'unita', unita);
    aggiornaVisibilita(form);
  };
  form.addEventListener('change', (ev) => {
    const n = ev.target.name;
    if (n === 'tipo') {
      form.elements.categoria.innerHTML = opzioniCategoria(form.elements.tipo.value, '');
      applicaPredefinito();
    } else if (n === 'categoria') {
      applicaPredefinito();
    } else if (n === 'modo_quantita') {
      modoToccato = true;
      aggiornaVisibilita(form);
    }
  });
  applicaPredefinito();
  aggiornaVisibilita(form);
}

/** Legge i campi dell'articolo dal modulo (senza id né colonne di sistema). */
export function leggiArticolo(form) {
  const f = form.elements;
  const v = (n) => (f[n] ? String(f[n].value).trim() : '');
  const modo = v('modo_quantita') || 'stati';
  return {
    tipo: v('tipo') || 'materiale',
    nome: v('nome'),
    categoria: v('categoria'),
    modo_quantita: modo,
    unita: modo === 'esatta' ? v('unita') || 'pz' : '',
    marca: v('marca'),
    modello: v('modello'),
    attributi: v('attributi'),
    tag: v('tag'),
    note: v('note'),
  };
}

/** Numero da un campo testo (accetta la virgola). '' se vuoto, null se non valido. */
export function leggiNumero(testo) {
  const s = String(testo ?? '').trim().replace(',', '.');
  if (!s) return '';
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Foto: ridimensionamento lato client (SPEC §3.3) e accesso ai blob locali.

import { leggiMolti } from './db.js';
import { urlTemporaneo } from './util.js';

export const LATO_LUNGO = 1600;
export const QUALITA = 0.8;
export const LATO_MINIATURA = 320;
export const QUALITA_MINIATURA = 0.7;

async function decodifica(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    // Safari e Chrome applicano l'orientamento EXIF in decodifica e nel disegno su canvas.
    await img.decode();
    return img;
  } catch {
    throw new Error('Immagine non leggibile: formato non supportato da questo browser.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function disegna(img, lato, qualita) {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  const scala = Math.min(1, lato / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scala));
  canvas.height = Math.max(1, Math.round(h0 * scala));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, ko) =>
    canvas.toBlob(
      (blob) => {
        // Su iOS la memoria dei canvas è limitata: liberarla subito.
        canvas.width = canvas.height = 0;
        if (blob) ok(blob);
        else ko(new Error('Impossibile comprimere la foto (memoria insufficiente?).'));
      },
      'image/jpeg',
      qualita
    )
  );
}

/**
 * Da un file scelto o scattato produce la foto (lato lungo 1600 px, JPEG 0,8)
 * e la miniatura per gli elenchi.
 */
export async function preparaFoto(file) {
  const img = await decodifica(file);
  const blob = await disegna(img, LATO_LUNGO, QUALITA);
  const miniatura = await disegna(img, LATO_MINIATURA, QUALITA_MINIATURA);
  return { blob, miniatura };
}

/** Record dell'archivio `file` per una foto appena preparata. */
export function recordFile(id, { blob, miniatura }) {
  return { id, tipo_mime: 'image/jpeg', blob, miniatura, caricato: false };
}

/**
 * Riempie gli <img data-miniatura="idFoto"> (o data-foto per l'immagine intera)
 * presenti in `radice`, leggendo i blob in un'unica transazione.
 */
export async function riempiImmagini(radice) {
  const imgs = [...radice.querySelectorAll('img[data-miniatura], img[data-foto]')];
  if (!imgs.length) return;
  const ids = [...new Set(imgs.map((i) => i.dataset.miniatura || i.dataset.foto))];
  const file = await leggiMolti('file', ids);
  const perId = new Map(ids.map((id, i) => [id, file[i]]));
  for (const img of imgs) {
    const f = perId.get(img.dataset.miniatura || img.dataset.foto);
    const blob = f && (img.dataset.foto ? f.blob : f.miniatura || f.blob);
    if (blob) img.src = urlTemporaneo(blob);
    else img.classList.add('mancante');
  }
}

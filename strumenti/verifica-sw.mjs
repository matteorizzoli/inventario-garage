// Controlla che FILE_APP in sw.js elenchi esattamente i file dell'app.
// Uso: node strumenti/verifica-sw.mjs   (dalla radice del repository)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync('sw.js', 'utf8');
const blocco = /const FILE_APP = \[([\s\S]*?)\];/.exec(sw)[1];
const elencati = new Set([...blocco.matchAll(/'([^']+)'/g)].map((m) => m[1]));

const scorri = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? scorri(p) : [p];
  });
const presenti = new Set(['index.html', 'manifest.webmanifest', ...['css', 'js', 'icone'].flatMap(scorri)]);

const mancanti = [...presenti].filter((f) => !elencati.has(f));
const inesistenti = [...elencati].filter((f) => f !== './' && !presenti.has(f));
if (mancanti.length) console.error('Da aggiungere a FILE_APP:', mancanti);
if (inesistenti.length) console.error('In FILE_APP ma inesistenti:', inesistenti);
if (mancanti.length || inesistenti.length) process.exit(1);
console.log(`sw.js OK: ${elencati.size} voci.`);

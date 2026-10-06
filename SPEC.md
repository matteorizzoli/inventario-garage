# Inventario Garage — Specifica di progetto

Versione 0.2 — 6 ottobre 2026
Documento di riferimento per lo sviluppo (da tenere nella radice del repository).

## 1. Obiettivo

App personale, mono-utente, per sapere **dove** si trova il materiale del garage e **più o meno quanto** ce n'è, con foto. In aggiunta: anagrafica degli attrezzi con accesso rapido ai manuali d'uso, e archivio di manuali generici (istruzioni di montaggio IKEA, Decathlon, ecc.).

Non sono obiettivi: contabilità di magazzino, storico movimenti, multi-utente.

## 2. Contesto d'uso e vincoli

- Dispositivo principale: **iPhone** (Safari / PWA installata in Home).
- Consultazione secondaria: **PC** (browser, stessa PWA, oppure direttamente il Google Sheet).
- Rete in garage: **scarsa**; buona appena fuori dal portone. L'app deve funzionare completamente offline e sincronizzare quando torna la rete.
- Costo di esercizio: zero (solo servizi gratuiti).
- Priorità assoluta: inserimento veloce. Il carico iniziale deve essere il più leggero possibile.

## 3. Architettura

| Componente | Scelta | Ruolo |
|---|---|---|
| Front-end | PWA statica (HTML/CSS/JS, senza build) | Interfaccia, funzionamento offline |
| Hosting | GitHub Pages (repository pubblico) | Pubblicazione HTTPS |
| Archivio locale | IndexedDB | Copia di lavoro sul dispositivo, coda di sincronizzazione |
| Ponte | Google Apps Script (web app legata al foglio) | API di lettura/scrittura, upload file |
| Archivio condiviso | Google Sheet | Dati, consultazione e modifica in blocco da PC |
| File | Cartella Google Drive | Foto e PDF dei manuali |

Principio: l'app legge e scrive **sempre** sulla copia locale; la sincronizzazione con il foglio è un processo separato.

### 3.1 Sicurezza

- Il repository è pubblico: **nessun URL dello script, nessuna chiave** nel codice.
- Al primo avvio l'app chiede URL della web app Apps Script e token; li salva solo in locale sul dispositivo.
- Lo script verifica il token a ogni richiesta (token conservato nelle Script Properties).

### 3.2 Sincronizzazione

- Ogni modifica locale genera una voce in coda (creazione / modifica / eliminazione).
- La coda si svuota quando c'è rete **e l'app è aperta** (su iOS non si può contare sulla sincronizzazione in background).
- Conflitti: vince la modifica con `aggiornato_il` più recente.
- Eliminazioni: logiche (campo `eliminato`), mai cancellazione fisica della riga.
- Foto e PDF: caricati in coda separata, con ripresa in caso di interruzione; finché non sono caricati restano disponibili in locale.
- Indicatore sempre visibile: sincronizzato / N modifiche in attesa / errore.
- Pulsante "Sincronizza ora".

### 3.3 Note tecniche per iPhone (da verificare nei test)

- Installazione: da Safari, "Aggiungi alla schermata Home".
- Scansione QR: l'API nativa BarcodeDetector non è disponibile su Safari; usare una libreria JS (es. jsQR o ZXing) su flusso video della fotocamera.
- Scatto foto: `<input type="file" accept="image/*" capture="environment">`, con ridimensionamento lato client (lato lungo ~1600 px, JPEG qualità ~0,8) prima del salvataggio.
- Chiamate ad Apps Script da altro dominio: usare POST con `Content-Type: text/plain` per evitare il preflight CORS, e gestire il redirect della web app.
- Spazio locale: prevedere la gestione dell'errore di quota e non dare per scontata la persistenza illimitata; il foglio + Drive restano la fonte per ripristinare tutto.

## 4. Modello dati

Ogni scheda del Google Sheet corrisponde a una tabella. Colonne comuni a tutte: `id` (UUID generato dall'app, mai modificare a mano), `aggiornato_il` (ISO 8601), `eliminato` (VERO/FALSO).

### 4.1 Ubicazioni

Struttura gerarchica a quattro livelli: luogo → mobile → posizione → contenitore. I livelli intermedi si possono saltare: un mobile sta in un luogo; una posizione sta in un mobile oppure direttamente in un luogo; un contenitore sta in un luogo, in un mobile o in una posizione.

| Campo | Note |
|---|---|
| tipo | `luogo` / `mobile` / `posizione` / `contenitore` |
| codice | Leggibile; è il contenuto del QR |
| descrizione | Es. "Cassettiera rossa, 3° cassetto" |
| id_padre | Ubicazione superiore (vuoto per i luoghi) |
| id_foto | Foto (opzionale) |

**Convenzione dei codici**

- **Luogo** (sigla di tre caratteri): `GAR` garage, `CAN` cantina, `BAL` balcone, `PI1` primo piano, `PI2` secondo piano, `MAM` casa della mamma, `CN2` cantina del nuovo appartamento. Elenco modificabile dall'app. `GAR` è il luogo predefinito.
- **Mobile** (fisso): lettera del tipo + progressivo, numerati in senso orario dall'ingresso. `A` armadi/armadietti, `S` scaffali/librerie, `P` pareti attrezzate e supporti metallici, `B` banco, `Z` zone a terra o senza mobile. Es. `GAR-A1`.
- **Posizione** (fissa): lettera del tipo + progressivo, aggiunti al codice del livello superiore. `R` ripiano dal basso verso l'alto, `C` cassetto dall'alto verso il basso, `S` settore di parete da sinistra a destra. Es. `GAR-A1-R3`, `GAR-P1-S2`; direttamente in un luogo, es. `GAR-R1`.
- **Contenitore** (mobile): progressivo globale indipendente dalla posizione, `K001`, `K002`... La posizione attuale è data da `id_padre`; spostare un contenitore (anche tra luoghi diversi) non richiede di ristampare l'etichetta.

Fuori dal garage è ammesso un dettaglio ridotto: articolo collegato direttamente al luogo, o a un mobile descritto a parole, senza etichette.

Vasetti e simili: non si etichettano singolarmente. L'ubicazione è il ripiano, oppure il gruppo (cassetta, supporto) codificato come un unico contenitore.

### 4.2 Articoli

Una sola tabella per materiali e attrezzi, distinti dal campo `tipo`.

| Campo | Note |
|---|---|
| tipo | `materiale` oppure `attrezzo` |
| nome | Obbligatorio |
| categoria | minuteria / custom / legname / elettrico / altro (per i materiali); elettroutensile / manuale / misura / altro (per gli attrezzi) |
| modo_quantita | `stati` / `esatta` / `nessuna` (gli attrezzi di norma `nessuna`) |
| unita | pz / m (solo se `esatta`) |
| marca, modello | Soprattutto per gli attrezzi |
| attributi | Coppie chiave-valore libere, es. `filetto=M6; lunghezza=20; materiale=inox A2` |
| tag | Parole per la ricerca |
| note | Testo libero |

Default per categoria: minuteria → `stati`; custom, legname, elettrico a metri → `esatta`.

### 4.3 Giacenze

Collega un articolo a un'ubicazione. Lo stesso articolo può stare in più posti; un contenitore può contenere più articoli.

| Campo | Note |
|---|---|
| id_articolo, id_ubicazione | |
| stato | pieno / metà / in esaurimento / finito (se `stati`) |
| quantita | Numero (se `esatta`) |
| verificato_il | Data dell'ultimo controllo: indica quanto fidarsi del dato |

Per gli attrezzi la giacenza serve solo a dire dove sono riposti.

### 4.4 Foto

| Campo | Note |
|---|---|
| id_articolo | |
| ordine | 1 = miniatura mostrata negli elenchi |
| didascalia | Opzionale (es. "vista lato attacco") |
| id_file_drive | Riferimento al file su Drive |

Una o più foto per articolo, senza limite fisso.

### 4.5 Documenti

Tabella unica per i manuali degli attrezzi e per i manuali generici.

| Campo | Note |
|---|---|
| titolo | Es. "Manuale d'uso trapano", "Montaggio libreria BILLY" |
| categoria | manuale d'uso / istruzioni di montaggio / scheda tecnica / altro |
| marca | Es. Bosch, IKEA, Decathlon |
| id_articolo | Valorizzato se il documento appartiene a un attrezzo o articolo; vuoto per i manuali generici |
| url | Link in rete (opzionale) |
| id_file_drive | PDF o immagini caricati (opzionale) |
| offline | VERO se il file va tenuto anche sul dispositivo |
| note | |

Almeno uno tra `url` e `id_file_drive` deve essere valorizzato. Raccomandazione d'uso: quando esiste il PDF, caricarlo oltre al link, perché gli indirizzi dei produttori cambiano e in garage la rete è scarsa.

## 5. Sezioni dell'app

### 5.1 Cerca (schermata iniziale)

- Campo unico che cerca su nome, tag, attributi, marca, modello, codice ubicazione.
- Risultati con miniatura, ubicazione e stato/quantità.
- Filtri rapidi: materiali / attrezzi, categoria, "in esaurimento".

### 5.2 Scansiona

- QR del contenitore → elenco del contenuto.
- Aggiornamento dello stato con un tocco; "segna come verificato oggi".
- Aggiunta rapida di un articolo già posizionato in quel contenitore.

### 5.3 Aggiungi articolo

Sequenza minima: foto → nome → ubicazione (scansionata o ultima usata) → stato o quantità. Tutto il resto è facoltativo e si completa in seguito, anche da PC sul foglio.

### 5.4 Attrezzi

- Elenco con foto, marca/modello, dove è riposto.
- Scheda attrezzo: foto, ubicazione, note, e pulsante **Manuale** (apre il PDF salvato, se presente, altrimenti il link).

### 5.5 Manuali

- Elenco dei documenti non legati a un attrezzo, raggruppabili per marca e categoria.
- Caricamento da file (PDF) o da fotocamera (più pagine fotografate).
- Interruttore "disponibile offline" per singolo documento.

### 5.6 Ubicazioni

- Albero luoghi / mobili / posizioni / contenitori.
- Filtro per luogo in ricerca; il luogo compare sempre nei risultati.
- Generazione dei QR e **stampa in blocco su A4 da PC** (metodo principale): pagina di stampa a griglia, con selezione delle ubicazioni da stampare, dimensione etichetta e margini configurabili per adattarsi ai fogli adesivi pretagliati; linee di taglio opzionali per la carta comune.
- Formato previsto: circa 50×30 mm per posizioni e contenitori (QR + codice in chiaro), formato più grande per i mobili.
- Metodo secondario, per singole etichette sostitutive: esportazione dell'etichetta come immagine PNG, stampabile con la termica ORGSTA T003 tramite l'app "4Barcode" (la PWA su iPhone non può pilotare la stampante via Bluetooth).

### 5.7 Impostazioni

- URL script e token, stato della sincronizzazione, spazio occupato in locale.
- Esporta copia dei dati (JSON) e ripristina dal foglio.

## 6. Apps Script (lato Google)

- `doPost` con azioni: `pull` (righe modificate dopo una certa data), `push` (lotto di modifiche), `upload` (file in base64 → Drive, restituisce l'id), `file` (restituisce un file per la copia offline).
- Verifica del token su ogni chiamata.
- Colonne di sistema (`id`, `aggiornato_il`, `eliminato`) protette nel foglio.
- Il codice dello script sta nel repository (cartella `apps-script/`) ma va incollato e pubblicato a mano nell'editor di Google.

## 7. Fasi di sviluppo

1. **Base offline**: modello dati in IndexedDB, Cerca, Aggiungi articolo con foto, Ubicazioni. Prova su iPhone.
2. **QR**: generazione e stampa etichette, Scansiona.
3. **Sincronizzazione**: Apps Script, foglio, Drive, coda offline.
4. **Attrezzi e Manuali**: sezioni dedicate, documenti, copia offline dei PDF.
5. **Rifiniture**: filtri, esportazione, gestione errori e quota.

Ogni fase si chiude con una prova reale in garage prima di passare alla successiva.

## 8. Carico iniziale (procedura d'uso)

1. Definire e stampare le etichette di scaffali, ripiani e contenitori.
2. Procedere un contenitore alla volta: scansione, foto, nome, stato.
3. Completare attributi, tag e documenti in un secondo momento, preferibilmente da PC.

## 9. Punti aperti

- Censimento reale dei mobili del garage e assegnazione dei codici.
- Stampa etichette: fogli A4 adesivi pretagliati per stampante laser (deciso). Resta da fissare il formato del foglio: proposta 70×37 mm (24 per foglio) per posizioni e contenitori, formato da 8 per foglio per i mobili. La pagina di stampa deve prevedere preimpostazioni per i formati comuni e taratura fine dei margini (offset in mm).
- Eventuale collegamento tra attrezzi e relativi consumabili (es. punte, lame): rimandato, non in prima versione.

# inventario-garage

App personale per sapere **dove** si trova il materiale del garage e **più o meno quanto** ce n'è, con foto.
Specifica completa: [`SPEC.md`](SPEC.md).

**Stato: Fase 1 — base offline.** PWA statica (HTML, CSS, JS senza build), dati solo sul dispositivo
(IndexedDB), nessuna sincronizzazione con Google.

## Cosa c'è nella Fase 1

| Schermata | Funzioni |
|---|---|
| **Cerca** (iniziale) | Campo unico su nome, tag, attributi, marca, modello e codici di ubicazione (anche dei livelli superiori: cercando `GAR-A1` si trovano gli articoli nei contenitori dentro `GAR-A1`). Filtri: materiali / attrezzi, in esaurimento (stato *in esaurimento* o *finito*), luogo, categoria. Senza testo mostra gli ultimi articoli modificati. |
| **Aggiungi** | Foto (una o più, da fotocamera o galleria) → nome → ubicazione (l'ultima usata, o quella da cui si è partiti) → stato o quantità. Tipo, categoria, marca, modello, attributi, tag e note in "Altri dettagli". "Salva e nuovo" mantiene ubicazione, tipo e categoria per il carico in serie. |
| **Scheda articolo** | Foto (aggiungi, elimina, scegli la principale, visione a tutto schermo), dove si trova (anche più posti), stato con un tocco, quantità con −/+, "Verificato oggi", sposta, modifica dati, elimina. |
| **Ubicazioni** | Albero luogo → mobile → posizione → contenitore, filtro per codice/descrizione, scheda con contenuto e sottolivelli, creazione con codice proposto, modifica, spostamento dei contenitori, foto facoltativa. |
| **Impostazioni** | Backup JSON (esporta / importa), spazio occupato, richiesta di archiviazione persistente, versione e aggiornamenti, cancellazione totale dei dati locali. |

### Convenzione dei codici (SPEC §4.1) — come la applica l'app

- **Luogo**: sigla di 3 caratteri `[A-Z0-9]`. Al primo avvio vengono creati GAR, CAN, BAL, PI1, PI2, MAM, CN2; l'elenco si modifica dall'app.
- **Mobile**: `<luogo>-<lettera><n>`, lettere A, S, P, B, Z. Es. `GAR-A1`.
- **Posizione**: `<padre>-<lettera><n>`, lettere R (ripiano), C (cassetto), S (settore di parete).
  Il padre è un mobile (`GAR-A1-R3`) oppure direttamente un luogo (`GAR-R1`).
- **Contenitore**: `K001`, `K002`… progressivo globale. Sta in un luogo, mobile o posizione e si sposta con "Sposta" senza cambiare codice.

L'app propone il primo numero libero e rifiuta codici fuori formato o già usati. I numeri dei
contenitori eliminati non vengono riassegnati (l'etichetta potrebbe essere già stampata). Il codice di
un'ubicazione con sottolivelli non è modificabile, perché è contenuto nei loro codici; per lo stesso motivo
mobili e posizioni non si spostano. Un'ubicazione si può eliminare solo se vuota.

### Dati

Archivio IndexedDB `inventario-garage`, con le tabelle della SPEC §4 (`ubicazioni`, `articoli`, `giacenze`,
`foto`, `documenti`) e le colonne comuni `id` (UUID), `aggiornato_il` (ISO 8601), `eliminato` (eliminazione
sempre logica). Le foto sono ridimensionate prima del salvataggio: lato lungo 1600 px, JPEG qualità 0,8, più una
miniatura da 320 px per gli elenchi.

Valori predefiniti del modo di quantità: attrezzo → nessuna; minuteria → stati; custom e legname → esatta (pz);
elettrico → esatta (m); le altre categorie → stati. Cambiare stato o quantità aggiorna anche la data di verifica.

### Backup JSON (provvisorio)

Finché non c'è la Fase 3 **il backup è l'unica copia dei dati fuori dal telefono**: fatelo spesso
(Impostazioni → *Salva su File / Condividi* su iPhone, *Scarica backup* su PC).

- Contiene tutte le righe (anche quelle eliminate) e, se richiesto, le foto in base64.
- Non contiene le impostazioni locali né la coda di sincronizzazione (in Fase 3 conterranno URL e token).
- L'importazione **unisce** e non cancella: per ogni riga vince la versione con `aggiornato_il` più recente, le
  foto vengono aggiunte solo se mancano. Se dopo l'importazione lo stesso codice compare due volte, la copia
  locale vuota viene eliminata; se non è vuota il codice viene segnalato, da sistemare a mano.
- Per trasferire i dati su un altro dispositivo: esporta da uno, importa nell'altro.

## Struttura

```
index.html              pagina unica
manifest.webmanifest    installazione come app
sw.js                   service worker (cache dei file, funzionamento offline)
css/app.css
icone/
js/app.js               avvio e navigazione (#/percorso, compatibile con GitHub Pages)
js/db.js                IndexedDB: tabelle, scrittura con coda di sincronizzazione, migrazioni
js/modello.js           vocabolari, valori predefiniti, convenzione dei codici
js/dati.js              caricamento in memoria, gerarchia delle ubicazioni
js/foto.js              ridimensionamento e lettura delle foto
js/backup.js            esportazione / importazione JSON
js/pwa.js               registrazione del service worker e aggiornamenti
js/sync.js              Fase 3 — solo segnaposto
js/viste/               una vista per schermata
apps-script/            Fase 3 — codice Apps Script (vuota)
strumenti/verifica-sw.mjs   controlla che sw.js elenchi tutti i file
```

### Predisposizione per le fasi successive

- **Fase 2 (QR)**: il codice di ogni ubicazione è già il contenuto previsto per il QR. Le rotte `scansiona`
  e la pagina di stampa si aggiungono in `js/app.js` (tabella `ROTTE`) come nuove viste.
- **Fase 3 (sincronizzazione)**: ogni scrittura registra la riga nell'archivio `coda` (una voce per riga, con
  operazione `crea` / `modifica` / `elimina`); i blob delle foto stanno in `file` con `caricato: false` e la
  tabella `foto` ha già `id_file_drive`. L'indicatore in alto ("Solo locale") e la sezione in Impostazioni sono
  pronti per mostrare lo stato reale. Vedi i commenti in `js/sync.js`.
- **Fase 4 (attrezzi e manuali)**: la tabella `documenti` esiste già (vuota).
- Lo schema IndexedDB è versionato (`VERSIONE_DB` in `js/db.js`): le modifiche future vanno come migrazioni.

## Pubblicazione su GitHub Pages

Non serve alcuna compilazione: si pubblicano i file così come sono.

1. Su GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
2. Branch `main`, cartella `/ (root)`, **Save**.
3. Dopo un minuto l'app è su `https://<utente>.github.io/inventario-garage/`
   (tutti i percorsi sono relativi, quindi funziona nella sottocartella).

Il file `.nojekyll` evita l'elaborazione Jekyll. HTTPS è obbligatorio (service worker e fotocamera):
GitHub Pages lo fornisce.

### Pubblicare un aggiornamento

1. Se hai aggiunto o rinominato file: aggiorna `FILE_APP` in `sw.js` e controlla con
   `node strumenti/verifica-sw.mjs`.
2. **Incrementa `VERSIONE` in `sw.js`** (es. `0.1.0` → `0.1.1`). Senza questo passo i dispositivi continuano a
   usare i file in cache.
3. Fai il push su `main`. All'apertura successiva l'app mostra "Nuova versione disponibile → Aggiorna"
   (oppure Impostazioni → *Cerca aggiornamenti*). L'aggiornamento non si applica da solo per non interrompere
   un inserimento in corso. La versione installata è in Impostazioni → App.

## Prova

### In locale, sul PC

Serve un server HTTP (il service worker non funziona aprendo il file direttamente):

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000/
```

Per simulare la sottocartella di GitHub Pages, servi la cartella superiore e apri
`http://localhost:8000/inventario-garage/`.
Con gli strumenti per sviluppatori del browser (Application → Service workers → *Offline*) si verifica il
funzionamento senza rete.

### Su iPhone

1. Apri l'indirizzo di GitHub Pages in **Safari** (non in altri browser: su iOS solo Safari installa le PWA).
2. Condividi → **Aggiungi alla schermata Home**. Apri l'app dall'icona.
3. Prova sul campo (checklist Fase 1, SPEC §3.3 e §7):
   - [ ] Crea la struttura reale di un mobile: mobile, ripiani, un paio di contenitori. Codici proposti corretti?
   - [ ] Aggiungi 10–20 articoli con "Salva e nuovo", con foto scattate. Tempo per articolo accettabile?
   - [ ] Foto: orientamento corretto (verticali e orizzontali), qualità sufficiente a riconoscere l'oggetto.
   - [ ] Modalità aereo, chiudi l'app dal multitasking, riaprila: deve partire e mostrare tutti i dati.
   - [ ] Ricerca per nome, tag, misura negli attributi (es. `m6`), codice (`K001`, `GAR-A1`).
   - [ ] Uso con una mano: campo di ricerca e pulsanti di salvataggio raggiungibili col pollice; con la
         tastiera aperta la barra delle azioni deve restare visibile sopra la tastiera.
   - [ ] Backup: *Salva su File*, poi controlla il file in app File. Importalo (anche su PC) e verifica.
   - [ ] Impostazioni → spazio occupato dopo il carico (per stimare quante foto ci stanno).

Avvertenze iOS:
- Safari può cancellare i dati dei siti non usati per settimane; l'app installata in Home ne è esente, ma
  finché non c'è la sincronizzazione **il backup resta indispensabile**.
- Dati dell'app installata e di Safari sono separati: un backup fatto in Safari va importato nell'app installata.
- In navigazione privata l'archivio può non funzionare.

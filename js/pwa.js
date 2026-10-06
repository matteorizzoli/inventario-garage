// Service worker: registrazione, avviso di nuova versione, versione installata.
//
// Un aggiornamento non si applica da solo (potrebbe interrompere un inserimento):
// compare un riquadro "Nuova versione" e si ricarica solo su richiesta.

let registrazione = null;
let aggiornamentoRichiesto = false;

export async function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    registrazione = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (e) {
    console.warn('Service worker non registrato:', e);
    return;
  }
  if (registrazione.waiting && navigator.serviceWorker.controller) mostraAvvisoAggiornamento(registrazione.waiting);
  registrazione.addEventListener('updatefound', () => {
    const nuovo = registrazione.installing;
    nuovo?.addEventListener('statechange', () => {
      if (nuovo.state === 'installed' && navigator.serviceWorker.controller) mostraAvvisoAggiornamento(nuovo);
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (aggiornamentoRichiesto) location.reload();
  });
}

function mostraAvvisoAggiornamento(worker) {
  if (document.querySelector('.banner-aggiornamento')) return;
  const b = document.createElement('div');
  b.className = 'banner-aggiornamento';
  b.innerHTML = '<span>Nuova versione disponibile.</span><button type="button" class="pulsante">Aggiorna</button>';
  b.querySelector('button').addEventListener('click', () => {
    aggiornamentoRichiesto = true;
    worker.postMessage({ tipo: 'salta-attesa' });
  });
  document.body.append(b);
}

/** Versione dichiarata dal service worker attivo (unica fonte: sw.js). */
export function versioneApp() {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) return Promise.resolve('');
  return new Promise((ok) => {
    const canale = new MessageChannel();
    canale.port1.onmessage = (ev) => ok(ev.data?.versione || '');
    sw.postMessage({ tipo: 'versione' }, [canale.port2]);
    setTimeout(() => ok(''), 1500);
  });
}

export async function cercaAggiornamenti() {
  if (!registrazione) return 'Service worker non attivo (serve HTTPS o localhost).';
  await registrazione.update();
  if (registrazione.waiting || registrazione.installing) return 'Nuova versione trovata: tocca “Aggiorna” nel riquadro in basso.';
  return 'L’app è già aggiornata.';
}

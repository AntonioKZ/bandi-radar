const form = document.getElementById('manual-scan');
const key = document.getElementById('admin-key');
const button = document.getElementById('scan-button');
const retryButton = document.getElementById('retry-button');
const status = document.getElementById('scan-status');
const results = document.getElementById('scan-results');

form.addEventListener('submit', async event => {
  event.preventDefault();
  runScan({ retry: event.submitter === retryButton });
});

async function runScan({automatic = false, retry = false} = {}) {
  if (button.disabled) return;

  const headers = { 'X-Radar-Admin': '1' };
  if (key.value.trim()) headers.Authorization = 'RadarAdmin ' + key.value.trim();
  key.value = '';
  button.disabled = true;
  retryButton.disabled = true;
  results.replaceChildren();
  status.textContent = 'Scansione in corso…';

  try {
    const response = await fetch('/api/cron/scan' + (retry ? '?scope=failed' : ''), {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(130000)
    });
    const data = await response.json();
    if (automatic && response.status === 401) {
      status.textContent = 'Inserisci la chiave per avviare la scansione.';
      return;
    }
    if (Array.isArray(data.results)) {
      if (!data.results.length) {
        status.textContent = 'Nessuna fonte con errori da riprovare.';
        return;
      }
      const failed = data.results.filter(source => source.status === 'failed').length;
      status.textContent = 'Scansione terminata. Fonti con errori: ' + failed + ' su ' + data.results.length + '.';
      for (const source of data.results) {
        const row = document.createElement('li');
        const outcome = source.status === 'failed' ? 'lettura non riuscita' : 'copertura parziale';
        row.textContent = (source.source_name || source.source_id) + ' · ' + outcome + ' · ' +
          (source.inserted || 0) + ' nuove segnalazioni · ' + (source.updated || 0) + ' modifiche rilevate';
        results.append(row);
      }
      return;
    }
    const messages = {
      unauthorized: 'Chiave amministrativa non valida.',
      scan_already_running: 'Una scansione è già in corso. Consulta lo stato delle fonti tra qualche minuto.',
      scan_secret_not_configured: 'La chiave amministrativa non è ancora configurata.'
    };
    status.textContent = messages[data.error] || 'Scansione non disponibile. Riprova tra qualche minuto.';
  } catch {
    status.textContent = 'Risposta non ricevuta. Controlla lo stato delle fonti prima di riprovare.';
  } finally {
    button.disabled = false;
    retryButton.disabled = false;
  }
}

runScan({automatic:true});

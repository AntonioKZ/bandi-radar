# R7 — 9 novembre 2026

## Correzioni
- Collector autenticato: estrae link da tutte le otto fonti registrate e inserisce segnalazioni con stato review. Nessun filtro temporale di scoperta, nessuna sovrascrittura di valutazioni curate.
- Deduplicazione URL/ID, lock di esecuzione, timeout rete/SQL, limiti risposta, redirect limitati a host ufficiali, parallelismo massimo 3.
- Cron Vercel giornaliero 07:00 UTC; CRON_SECRET obbligatorio. Automazione ChatGPT del lunedì mantenuta come revisione complementare.
- Registro esiti per fonte: partial/failed con conteggi e limiti nel log. API restituisce ultimo tentativo inclusi fallimenti/parziali.
- Dashboard: stato parziale/obsoleto esplicito; segnalazioni da verificare separate; nessun fallback dimostrativo; date Europe/Rome, storage locale tollerante ai guasti, decisioni registrate preservate, normalizzazione percentuali legacy, avviso troncamento.
- Filtro spese disabilitato finché il database non fornisce spese strutturate. Importi legacy esplicitamente ambigui: dotazione o progetto.

## Limiti dichiarati
La raccolta HTML è discovery parziale, non certificazione di copertura: pagine dinamiche, PDF e paginazione richiedono collector specifici e revisione. Un candidato può essere una notizia. Il sistema non inventa scadenze o ammissibilità. Gli aggiornamenti delle schede curate richiedono revisione; non sono sovrascritti dal collector.

## Verifica
Test Node senza dipendenze: allowlist, redirect, scoperta automotive pregressa, deduplicazione, log fallimento/parziale, isolamento record curati, frontend/storage/date/decisioni. Nessuna migrazione distruttiva o modifica schema.

Finale 7.0.1: scrittura batch per fonte (una query anziché fino a 150), registro avvio prima della rete per rendere visibili job interrotti; gestione guasto connessione; 13 test superati e SQL batch/deduplicazione verificati su branch Neon isolata.

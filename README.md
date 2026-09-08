# 🛒 Spesa di Casa

App web (PWA) per gestire la lista della spesa di famiglia, condivisa in tempo reale
tramite Firebase, con storico degli acquisti (marca, formato, prezzo) e evidenziazione
dell'ultimo acquisto quando riaggiungi un prodotto già comprato in passato.

- **Categorie**: FOOD, BEVERAGE, CASA, CURA DELLA PERSONA, ALTRO (aggiungibili dall'app)
- **Lista della spesa**: aggiungi prodotti, segnali come comprati con un tap, oppure apri
  il dettaglio e registri marca/formato/prezzo
- **Storico**: ogni acquisto con dettagli resta salvato e consultabile/ricercabile
- **Condivisione**: tutti i membri della famiglia autorizzati vedono la stessa lista in
  tempo reale, login con Google
- **Installabile**: "Aggiungi a schermata Home" su iOS/Android come una vera app

Lo schema dati completo è descritto in [`SCHEMA.md`](./SCHEMA.md).

---

## 1. Creare un progetto Firebase dedicato

Questa app usa un **progetto Firebase separato** da altri tuoi progetti personali (es.
`cantina-andrea`): stessa quota gratuita indipendente, regole di sicurezza indipendenti,
nessun rischio di impatto reciproco. Resti comunque nello stesso account Google che già
usi per gli altri progetti — non serve nulla di nuovo lato account.

1. Vai su [console.firebase.google.com](https://console.firebase.google.com) → **Aggiungi
   progetto** → chiamalo ad es. `spesa-casa` (o `spesa-di-casa`, il nome è solo per te,
   non deve essere univoco a livello globale — l'ID progetto generato automaticamente sì,
   ma Firebase te ne propone uno libero) → puoi disattivare Google Analytics, non serve.
2. **Registra un'app Web**: nella home del nuovo progetto, icona `</>` ("Web") → dai un
   nome (es. "Spesa di Casa") → **non** serve Firebase Hosting, salta quel passaggio.
3. Copia i valori dell'oggetto `firebaseConfig` mostrato e incollali in
   [`js/firebase-config.js`](./js/firebase-config.js), sostituendo i placeholder
   `INSERISCI_...`. Il campo `databaseURL` (se compare) e `measurementId` non servono a
   questa app, puoi ometterli.
4. **Attiva Firestore**: menu laterale → *Build* → *Firestore Database* → *Crea database*
   → scegli una regione europea (es. `eur3`) → modalità *produzione*.
5. **Attiva l'accesso Google**: menu laterale → *Build* → *Authentication* → scheda
   *Sign-in method* → abilita **Google** → imposta un'email di supporto.
6. **Pubblica le regole di sicurezza**: *Firestore Database* → scheda *Regole* → incolla
   il contenuto di [`firestore.rules`](./firestore.rules) (dopo aver sostituito le email
   della famiglia, vedi sotto) → *Pubblica*.

### Autorizzare solo la tua famiglia

Apri `firestore.rules` e sostituisci le email di esempio con quelle Google reali dei
membri della famiglia che useranno l'app:

```js
request.auth.token.email in [
  "mario.rossi@gmail.com",
  "giulia.rossi@gmail.com"
]
```

Senza questo passaggio le regole di esempio non autorizzano nessuno (tranne le email
placeholder, che vanno sostituite).

### Dominio autorizzato per il login

Quando pubblichi su GitHub Pages (punto 2), il sito avrà un indirizzo tipo
`tuonome.github.io`. Firebase Auth blocca il login da domini non autorizzati:

- *Authentication* → scheda *Settings* → *Authorized domains* → *Aggiungi dominio* →
  inserisci `tuonome.github.io` (senza `https://`).

---

## 2. Pubblicare su GitHub Pages

1. Crea un nuovo repository su GitHub (es. `spesa-casa`), pubblico o privato (GitHub
   Pages funziona anche con repo privati sui piani che lo supportano).
2. Da questa cartella del progetto, esegui:

   ```bash
   git init
   git add .
   git commit -m "Prima versione app spesa di casa"
   git branch -M main
   git remote add origin https://github.com/TUO-USERNAME/spesa-casa.git
   git push -u origin main
   ```

3. Su GitHub: *Settings* del repository → *Pages* → in *Source* scegli **Deploy from a
   branch** → branch `main`, cartella `/ (root)` → *Save*.
4. Dopo un minuto l'app sarà raggiungibile su
   `https://TUO-USERNAME.github.io/spesa-casa/`.
5. Ricorda di aggiungere questo dominio (`TUO-USERNAME.github.io`) tra i domini
   autorizzati Firebase, come indicato sopra.

Per i futuri aggiornamenti basta `git add . && git commit -m "..." && git push`: GitHub
Pages ripubblica automaticamente.

---

## 3. Installare l'app sul telefono

- **Android (Chrome)**: apri il link → menu ⋮ → *Aggiungi a schermata Home*.
- **iOS (Safari)**: apri il link → icona *Condividi* → *Aggiungi a Home*.

L'app si comporta come un'app nativa (icona propria, nessuna barra del browser) grazie a
`manifest.json` e al service worker (`service-worker.js`) che mette in cache i file
dell'interfaccia per un avvio rapido anche con connessione debole.

---

## Struttura del progetto

```
index.html              interfaccia (login, lista spesa, storico)
css/style.css            stile dell'app
js/firebase-config.js    le TUE chiavi Firebase (da compilare)
js/firebase-init.js      inizializzazione SDK Firebase (auth + firestore)
js/data.js               tutte le operazioni su Firestore
js/app.js                logica dell'interfaccia
manifest.json            manifest PWA
service-worker.js        cache offline / installabilità
icons/                   icone dell'app
firestore.rules          regole di sicurezza (allowlist email famiglia)
SCHEMA.md                schema delle collection Firestore
```

Nessun passaggio di build: è HTML/CSS/JS puro, l'SDK Firebase è caricato via CDN nei
file `js/`. Basta aprire `index.html` con un server statico qualsiasi (o GitHub Pages).

## Prossimi passi possibili

- Aggiungere quantità/note più ricche per articolo
- Statistiche di spesa mensile per categoria
- Notifiche push quando un familiare aggiunge un prodotto urgente
- Più "liste"/dispense separate (es. dispensa vs lista corrente)

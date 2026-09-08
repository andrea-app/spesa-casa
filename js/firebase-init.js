// Inizializzazione Firebase (SDK modulare v10, caricato via CDN — nessun npm/build necessario).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Cache offline: la lista resta consultabile anche senza connessione,
// utile mentre si è al supermercato con poco segnale.
enableIndexedDbPersistence(db).catch(() => {
  // fallisce silenziosamente se ci sono più tab aperte o il browser non supporta l'API
});

export {
  app,
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
};

// Livello di accesso ai dati Firestore. Vedi SCHEMA.md per la struttura delle collection.
import { db } from "./firebase-init.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const DEFAULT_CATEGORIES = ["FOOD", "BEVERAGE", "CASA", "CURA DELLA PERSONA", "ALTRO"];

function normalize(name) {
  return name.trim().toLowerCase();
}

function userStub(user) {
  return { uid: user.uid, name: user.displayName || user.email };
}

// ---------- CATEGORIE ----------

export async function ensureDefaultCategories() {
  const snap = await getDocs(collection(db, "categories"));
  if (!snap.empty) return;
  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach((name, i) => {
    const ref = doc(collection(db, "categories"));
    batch.set(ref, { name, order: i, createdAt: serverTimestamp() });
  });
  await batch.commit();
}

export function listenCategories(callback) {
  const q = query(collection(db, "categories"), orderBy("order", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = await getDocs(
    query(collection(db, "categories"), where("name", "==", trimmed.toUpperCase()))
  );
  if (!existing.empty) return existing.docs[0].id;
  const snap = await getDocs(collection(db, "categories"));
  const ref = await addDoc(collection(db, "categories"), {
    name: trimmed.toUpperCase(),
    order: snap.size,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ---------- PRODOTTI (per autocomplete + "ultimo acquisto") ----------

export async function getProductInfo(productName) {
  const id = normalize(productName);
  if (!id) return null;
  const snap = await getDoc(doc(db, "products", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function listenProducts(callback) {
  const q = query(collection(db, "products"), orderBy("displayName", "asc"), limit(500));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

async function upsertProduct(productName, categoryId, categoryName, lastPurchase) {
  const id = normalize(productName);
  const ref = doc(db, "products", id);
  const existing = await getDoc(ref);
  const timesPurchased = existing.exists() ? (existing.data().timesPurchased || 0) + 1 : 1;
  await setDoc(
    ref,
    {
      displayName: productName.trim(),
      categoryId,
      categoryName,
      timesPurchased,
      lastPurchase: lastPurchase || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ---------- LISTA DELLA SPESA ----------

export function listenShoppingList(callback) {
  const q = query(collection(db, "shoppingList"), orderBy("addedAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addShoppingListItem({ productName, categoryId, categoryName, quantity, note }, user) {
  await addDoc(collection(db, "shoppingList"), {
    productName: productName.trim(),
    productNameLower: normalize(productName),
    categoryId,
    categoryName,
    quantity: quantity || null,
    note: note || null,
    addedBy: userStub(user),
    addedAt: serverTimestamp(),
    purchased: false,
    purchaseInfo: null,
  });
}

export async function removeShoppingListItem(itemId) {
  await deleteDoc(doc(db, "shoppingList", itemId));
}

// Segna comprato senza dettagli (spunta rapida)
export async function markPurchasedSimple(item, user) {
  await updateDoc(doc(db, "shoppingList", item.id), {
    purchased: true,
    purchaseInfo: { brand: null, size: null, price: null, purchasedAt: serverTimestamp(), purchasedBy: userStub(user) },
  });
}

// Annulla lo stato "comprato"
export async function unmarkPurchased(itemId) {
  await updateDoc(doc(db, "shoppingList", itemId), {
    purchased: false,
    purchaseInfo: null,
  });
}

// Segna comprato CON dettagli: aggiorna la lista, salva nello storico, aggiorna l'anagrafica prodotto
export async function markPurchasedWithDetails(item, details, user) {
  const purchaseInfo = {
    brand: details.brand || null,
    size: details.size || null,
    price: details.price != null && details.price !== "" ? Number(details.price) : null,
    purchasedAt: serverTimestamp(),
    purchasedBy: userStub(user),
  };

  await updateDoc(doc(db, "shoppingList", item.id), {
    purchased: true,
    purchaseInfo,
  });

  await addDoc(collection(db, "purchaseHistory"), {
    productName: item.productName,
    productNameLower: item.productNameLower,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    brand: purchaseInfo.brand,
    size: purchaseInfo.size,
    price: purchaseInfo.price,
    purchasedBy: userStub(user),
    purchasedAt: serverTimestamp(),
  });

  await upsertProduct(item.productName, item.categoryId, item.categoryName, {
    brand: purchaseInfo.brand,
    size: purchaseInfo.size,
    price: purchaseInfo.price,
    purchasedAt: new Date().toISOString(),
  });
}

export async function clearPurchasedItems() {
  const snap = await getDocs(query(collection(db, "shoppingList"), where("purchased", "==", true)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ---------- STORICO ACQUISTI ----------

export function listenPurchaseHistory(callback, max = 200) {
  const q = query(collection(db, "purchaseHistory"), orderBy("purchasedAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function deleteHistoryEntry(purchaseId) {
  const historyRef = doc(db, "purchaseHistory", purchaseId);
  const snap = await getDoc(historyRef);
  const deletedData = snap.exists() ? snap.data() : null;

  await deleteDoc(historyRef);

  if (!deletedData || !deletedData.productNameLower) return;

  // Dopo la cancellazione, ricalcola "l'ultimo acquisto" del prodotto in base
  // a ciò che resta nello storico, così l'evidenza in lista/modale resta corretta.
  const remainingSnap = await getDocs(
    query(collection(db, "purchaseHistory"), where("productNameLower", "==", deletedData.productNameLower))
  );

  const productRef = doc(db, "products", deletedData.productNameLower);

  if (remainingSnap.empty) {
    await setDoc(productRef, { lastPurchase: null }, { merge: true });
    return;
  }

  let latest = null;
  let latestMillis = -1;
  remainingSnap.forEach((d) => {
    const item = d.data();
    const millis =
      item.purchasedAt && typeof item.purchasedAt.toMillis === "function" ? item.purchasedAt.toMillis() : 0;
    if (millis >= latestMillis) {
      latest = item;
      latestMillis = millis;
    }
  });

  await setDoc(
    productRef,
    {
      lastPurchase: {
        brand: latest.brand || null,
        size: latest.size || null,
        price: latest.price != null ? latest.price : null,
        purchasedAt:
          latest.purchasedAt && typeof latest.purchasedAt.toDate === "function"
            ? latest.purchasedAt.toDate().toISOString()
            : new Date().toISOString(),
      },
    },
    { merge: true }
  );
}

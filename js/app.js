import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from "./firebase-init.js";
import {
  ensureDefaultCategories,
  listenCategories,
  addCategory,
  listenProducts,
  getProductInfo,
  listenShoppingList,
  addShoppingListItem,
  removeShoppingListItem,
  markPurchasedSimple,
  unmarkPurchased,
  markPurchasedWithDetails,
  clearPurchasedItems,
  listenPurchaseHistory,
} from "./data.js";

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
let currentUser = null;
let categories = [];
let products = [];
let shoppingList = [];
let purchaseHistory = [];
let activeItemForModal = null;
let unsubscribers = [];

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

const loginScreen = $("#login-screen");
const appScreen = $("#app");
const loginBtn = $("#google-login-btn");
const loginError = $("#login-error");
const logoutBtn = $("#logout-btn");
const userPhoto = $("#user-photo");
const userName = $("#user-name");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

const addItemForm = $("#add-item-form");
const productInput = $("#product-input");
const categorySelect = $("#category-select");
const productSuggestions = $("#product-suggestions");
const lastPurchaseHint = $("#last-purchase-hint");

const listCount = $("#list-count");
const clearPurchasedBtn = $("#clear-purchased-btn");
const shoppingListEl = $("#shopping-list");
const listEmpty = $("#list-empty");

const historySearchInput = $("#history-search-input");
const historyListEl = $("#history-list");
const historyEmpty = $("#history-empty");

const purchaseModal = $("#purchase-modal");
const purchaseForm = $("#purchase-form");
const purchaseModalTitle = $("#purchase-modal-title");
const purchaseBrand = $("#purchase-brand");
const purchaseSize = $("#purchase-size");
const purchasePrice = $("#purchase-price");
const purchaseLastHint = $("#purchase-last-hint");
const purchaseCancelBtn = $("#purchase-cancel-btn");
const purchaseSimpleBtn = $("#purchase-simple-btn");

const toastEl = $("#toast");

// ---------------------------------------------------------------------------
// UTIL
// ---------------------------------------------------------------------------
const priceFmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === "string") return new Date(ts);
  return null;
}

function formatLastPurchase(info) {
  if (!info) return null;
  const parts = [];
  if (info.brand) parts.push(info.brand);
  if (info.size) parts.push(info.size);
  const priceStr = info.price != null ? priceFmt.format(info.price) : null;
  if (priceStr) parts.push(priceStr);
  const d = toDate(info.purchasedAt);
  const dateStr = d ? dateFmt.format(d) : null;
  if (!parts.length && !dateStr) return null;
  let text = "Ultima volta: " + (parts.length ? parts.join(" · ") : "comprato senza dettagli");
  if (dateStr) text += ` · ${dateStr}`;
  return text;
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2200);
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
loginBtn.addEventListener("click", async () => {
  loginError.hidden = true;
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error(err);
    loginError.textContent = "Accesso non riuscito. Riprova.";
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];

  if (!user) {
    currentUser = null;
    loginScreen.hidden = false;
    appScreen.hidden = true;
    return;
  }

  currentUser = user;
  loginScreen.hidden = true;
  appScreen.hidden = false;
  userPhoto.src = user.photoURL || "";
  userPhoto.alt = user.displayName || "";
  userName.textContent = user.displayName || user.email;

  try {
    await ensureDefaultCategories();
  } catch (err) {
    console.error("Errore inizializzazione categorie", err);
  }

  unsubscribers.push(
    listenCategories((data) => {
      categories = data;
      renderCategoryOptions();
    })
  );
  unsubscribers.push(
    listenProducts((data) => {
      products = data;
      renderProductSuggestions();
      renderShoppingList();
    })
  );
  unsubscribers.push(
    listenShoppingList((data) => {
      shoppingList = data;
      renderShoppingList();
    })
  );
  unsubscribers.push(
    listenPurchaseHistory((data) => {
      purchaseHistory = data;
      renderHistory();
    })
  );
});

// ---------------------------------------------------------------------------
// TABS
// ---------------------------------------------------------------------------
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`#tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------------------------------------------------------------------------
// CATEGORIE
// ---------------------------------------------------------------------------
const ADD_CATEGORY_VALUE = "__add_new__";

function renderCategoryOptions() {
  const prevValue = categorySelect.value;
  categorySelect.innerHTML = "";
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    categorySelect.appendChild(opt);
  });
  const addOpt = document.createElement("option");
  addOpt.value = ADD_CATEGORY_VALUE;
  addOpt.textContent = "+ Nuova categoria…";
  categorySelect.appendChild(addOpt);

  if (prevValue && categories.some((c) => c.id === prevValue)) {
    categorySelect.value = prevValue;
  }
}

categorySelect.addEventListener("change", async () => {
  if (categorySelect.value !== ADD_CATEGORY_VALUE) return;
  const name = prompt("Nome della nuova categoria:");
  categorySelect.value = categories[0]?.id || "";
  if (!name || !name.trim()) return;
  const id = await addCategory(name);
  if (id) categorySelect.value = id;
});

// ---------------------------------------------------------------------------
// AGGIUNTA PRODOTTO ALLA LISTA + AUTOCOMPLETE / EVIDENZIAZIONE ULTIMO ACQUISTO
// ---------------------------------------------------------------------------
function renderProductSuggestions() {
  productSuggestions.innerHTML = "";
  products.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.displayName;
    productSuggestions.appendChild(opt);
  });
}

const showLastPurchaseHint = debounce(async () => {
  const name = productInput.value.trim();
  if (!name) {
    lastPurchaseHint.hidden = true;
    return;
  }
  const info = await getProductInfo(name);
  const text = info ? formatLastPurchase(info.lastPurchase) : null;
  if (text) {
    lastPurchaseHint.textContent = text;
    lastPurchaseHint.hidden = false;
    if (info.categoryId && categories.some((c) => c.id === info.categoryId)) {
      categorySelect.value = info.categoryId;
    }
  } else {
    lastPurchaseHint.hidden = true;
  }
}, 300);

productInput.addEventListener("input", showLastPurchaseHint);

addItemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const productName = productInput.value.trim();
  const categoryId = categorySelect.value;
  if (!productName || !categoryId || categoryId === ADD_CATEGORY_VALUE) return;
  const category = categories.find((c) => c.id === categoryId);
  try {
    await addShoppingListItem(
      { productName, categoryId, categoryName: category ? category.name : "" },
      currentUser
    );
    productInput.value = "";
    lastPurchaseHint.hidden = true;
    productInput.focus();
  } catch (err) {
    console.error(err);
    toast("Errore nell'aggiunta del prodotto");
  }
});

// ---------------------------------------------------------------------------
// LISTA DELLA SPESA
// ---------------------------------------------------------------------------
function renderShoppingList() {
  shoppingListEl.innerHTML = "";

  const total = shoppingList.length;
  const purchasedCount = shoppingList.filter((i) => i.purchased).length;
  listCount.textContent = total ? `${purchasedCount}/${total} comprati` : "";
  clearPurchasedBtn.hidden = purchasedCount === 0;
  listEmpty.hidden = total !== 0;

  const grouped = new Map();
  shoppingList.forEach((item) => {
    const key = item.categoryName || "ALTRO";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });

  const orderedCategoryNames = categories.map((c) => c.name).filter((n) => grouped.has(n));
  grouped.forEach((_, name) => {
    if (!orderedCategoryNames.includes(name)) orderedCategoryNames.push(name);
  });

  orderedCategoryNames.forEach((catName) => {
    const items = grouped.get(catName);
    if (!items || !items.length) return;

    const groupEl = document.createElement("div");
    groupEl.className = "category-group";

    const title = document.createElement("div");
    title.className = "category-title";
    title.textContent = catName;
    groupEl.appendChild(title);

    items.forEach((item) => groupEl.appendChild(renderItemCard(item)));
    shoppingListEl.appendChild(groupEl);
  });
}

function renderItemCard(item) {
  const card = document.createElement("div");
  card.className = "item-card" + (item.purchased ? " purchased" : "");

  const checkbox = document.createElement("button");
  checkbox.className = "item-checkbox";
  checkbox.type = "button";
  checkbox.title = item.purchased ? "Segna da comprare" : "Segna come comprato";
  checkbox.textContent = item.purchased ? "✓" : "";
  checkbox.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      if (item.purchased) {
        await unmarkPurchased(item.id);
      } else {
        await markPurchasedSimple(item, currentUser);
      }
    } catch (err) {
      console.error(err);
      toast("Errore nell'aggiornamento");
    }
  });

  const main = document.createElement("div");
  main.className = "item-main";
  main.addEventListener("click", () => openPurchaseModal(item));

  const nameEl = document.createElement("div");
  nameEl.className = "item-name";
  nameEl.textContent = item.productName + (item.quantity ? ` ×${item.quantity}` : "");
  main.appendChild(nameEl);

  const detailText = item.purchased ? formatPurchaseInfoInline(item.purchaseInfo) : null;
  if (detailText) {
    const detailEl = document.createElement("div");
    detailEl.className = "item-detail";
    detailEl.textContent = detailText;
    main.appendChild(detailEl);
  } else if (!item.purchased) {
    // Non ancora comprato in questa lista: mostra l'ultimo acquisto registrato in passato, se esiste.
    const product = products.find((p) => p.id === item.productNameLower);
    const lastText = product ? formatLastPurchase(product.lastPurchase) : null;
    if (lastText) {
      const lastEl = document.createElement("div");
      lastEl.className = "item-last-purchase";
      lastEl.textContent = lastText;
      main.appendChild(lastEl);
    }
  }

  const removeBtn = document.createElement("button");
  removeBtn.className = "item-remove";
  removeBtn.type = "button";
  removeBtn.title = "Rimuovi dalla lista";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await removeShoppingListItem(item.id);
    } catch (err) {
      console.error(err);
      toast("Errore nella rimozione");
    }
  });

  card.appendChild(checkbox);
  card.appendChild(main);
  card.appendChild(removeBtn);
  return card;
}

function formatPurchaseInfoInline(info) {
  if (!info) return null;
  const parts = [];
  if (info.brand) parts.push(info.brand);
  if (info.size) parts.push(info.size);
  if (info.price != null) parts.push(priceFmt.format(info.price));
  return parts.length ? parts.join(" · ") : null;
}

clearPurchasedBtn.addEventListener("click", async () => {
  try {
    await clearPurchasedItems();
    toast("Articoli comprati rimossi dalla lista");
  } catch (err) {
    console.error(err);
    toast("Errore durante la pulizia della lista");
  }
});

// ---------------------------------------------------------------------------
// MODALE DETTAGLI ACQUISTO
// ---------------------------------------------------------------------------
async function openPurchaseModal(item) {
  activeItemForModal = item;
  purchaseModalTitle.textContent = item.productName;
  purchaseBrand.value = (item.purchaseInfo && item.purchaseInfo.brand) || "";
  purchaseSize.value = (item.purchaseInfo && item.purchaseInfo.size) || "";
  purchasePrice.value = item.purchaseInfo && item.purchaseInfo.price != null ? item.purchaseInfo.price : "";
  purchaseLastHint.hidden = true;

  purchaseModal.hidden = false;

  const info = await getProductInfo(item.productName);
  if (info && info.lastPurchase) {
    const text = formatLastPurchase(info.lastPurchase);
    if (text) {
      purchaseLastHint.textContent = text + " — tocca per riusare";
      purchaseLastHint.hidden = false;
      purchaseLastHint.onclick = () => {
        purchaseBrand.value = info.lastPurchase.brand || "";
        purchaseSize.value = info.lastPurchase.size || "";
        purchasePrice.value = info.lastPurchase.price != null ? info.lastPurchase.price : "";
      };
    }
  }
}

function closePurchaseModal() {
  purchaseModal.hidden = true;
  activeItemForModal = null;
  purchaseForm.reset();
}

purchaseCancelBtn.addEventListener("click", closePurchaseModal);
purchaseModal.addEventListener("click", (e) => {
  if (e.target === purchaseModal) closePurchaseModal();
});

purchaseSimpleBtn.addEventListener("click", async () => {
  if (!activeItemForModal) return;
  try {
    await markPurchasedSimple(activeItemForModal, currentUser);
    toast("Segnato come comprato");
  } catch (err) {
    console.error(err);
    toast("Errore nel salvataggio");
  }
  closePurchaseModal();
});

purchaseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeItemForModal) return;
  try {
    await markPurchasedWithDetails(
      activeItemForModal,
      { brand: purchaseBrand.value.trim(), size: purchaseSize.value.trim(), price: purchasePrice.value },
      currentUser
    );
    toast("Acquisto registrato");
  } catch (err) {
    console.error(err);
    toast("Errore nel salvataggio");
  }
  closePurchaseModal();
});

// ---------------------------------------------------------------------------
// STORICO
// ---------------------------------------------------------------------------
function renderHistory() {
  const term = historySearchInput.value.trim().toLowerCase();
  const filtered = term
    ? purchaseHistory.filter((h) => h.productNameLower && h.productNameLower.includes(term))
    : purchaseHistory;

  historyListEl.innerHTML = "";
  historyEmpty.hidden = filtered.length !== 0;

  filtered.forEach((h) => {
    const el = document.createElement("div");
    el.className = "history-item";

    const top = document.createElement("div");
    top.className = "history-item-top";

    const name = document.createElement("span");
    name.className = "history-item-name";
    name.textContent = h.productName;
    top.appendChild(name);

    const d = toDate(h.purchasedAt);
    const dateEl = document.createElement("span");
    dateEl.className = "history-item-date";
    dateEl.textContent = d ? dateFmt.format(d) : "";
    top.appendChild(dateEl);

    el.appendChild(top);

    const detail = formatPurchaseInfoInline({ brand: h.brand, size: h.size, price: h.price });
    if (detail) {
      const detailEl = document.createElement("div");
      detailEl.className = "history-item-detail";
      detailEl.textContent = detail;
      el.appendChild(detailEl);
    }

    if (h.categoryName) {
      const catEl = document.createElement("span");
      catEl.className = "history-item-cat";
      catEl.textContent = h.categoryName;
      el.appendChild(catEl);
    }

    historyListEl.appendChild(el);
  });
}

historySearchInput.addEventListener("input", debounce(renderHistory, 150));

// ---------------------------------------------------------------------------
// SERVICE WORKER (PWA)
// ---------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Registrazione service worker fallita:", err);
    });
  });
}

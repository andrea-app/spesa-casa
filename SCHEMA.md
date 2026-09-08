# Schema dati Firestore — Spesa di Casa

Un unico spazio condiviso (nessun concetto di "più famiglie"): tutti i membri autorizzati
(vedi `firestore.rules`) leggono e scrivono le stesse collection.

## `categories/{categoryId}`
Elenco categorie, modificabile dall'app (pulsante "+ categoria").

| campo | tipo | note |
|---|---|---|
| name | string | es. "FOOD" |
| order | number | ordine di visualizzazione |
| createdAt | timestamp | |

Seed iniziale: FOOD, BEVERAGE, CASA, CURA DELLA PERSONA, ALTRO.

## `products/{productNameLower}`
Anagrafica "leggera" per autocomplete e per l'evidenziazione dell'ultimo acquisto.
L'id documento è il nome prodotto normalizzato (minuscolo, trim) così l'upsert è immediato.
Viene creato/aggiornato ogni volta che un acquisto viene registrato.

| campo | tipo | note |
|---|---|---|
| displayName | string | nome come digitato la prima volta |
| categoryId | string | ultima categoria usata |
| categoryName | string | denormalizzato per comodità |
| timesPurchased | number | contatore |
| lastPurchase | map \| null | `{ brand, size, price, purchasedAt, purchasedBy }` |
| updatedAt | timestamp | |

## `shoppingList/{itemId}`
Lista della spesa attiva (condivisa).

| campo | tipo | note |
|---|---|---|
| productName | string | come digitato |
| productNameLower | string | per il match con `products` |
| categoryId, categoryName | string | |
| quantity | string \| null | opzionale, es. "2" |
| note | string \| null | opzionale |
| addedBy | map | `{ uid, name }` |
| addedAt | timestamp | |
| purchased | boolean | |
| purchaseInfo | map \| null | `{ brand, size, price, purchasedAt, purchasedBy }` quando spuntato con dettagli |

Gli articoli comprati restano in lista (barrati) fino a "Svuota comprati", per dare
un feedback visivo immediato durante la spesa.

## `purchaseHistory/{purchaseId}`
Storico permanente di ogni acquisto registrato con dettagli (marca/formato/prezzo).
Un acquisto "segnato solo come comprato" (senza dettagli) NON genera una riga qui.

| campo | tipo | note |
|---|---|---|
| productName, productNameLower | string | |
| categoryId, categoryName | string | |
| brand | string \| null | |
| size | string \| null | es. "500gr" |
| price | number \| null | in euro |
| purchasedBy | map | `{ uid, name }` |
| purchasedAt | timestamp | |

## Flusso "evidenzia ultimo acquisto"
1. Utente digita il nome prodotto nel campo "aggiungi alla lista".
2. L'app cerca in `products` il doc con id = nome normalizzato (get diretta, non query).
3. Se esiste, mostra sotto il campo: "Ultima volta: BARILLA · 500gr · €1,49 · 12/08/2026".
4. Alla spunta "comprato" l'utente può accettare i valori precedenti con un tap o modificarli.

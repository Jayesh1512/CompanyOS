# Customer payment receipts

Open **Customer payments** in the workspace sidebar, or use **View payment receipts** in Marketplace or the local demo guide. The page is at `/#payments`.

The company section reads saved sales from the explicitly configured `SHOP_FUNDED_LOOP_FILE`. It displays the exact USDC amount, recorded receipt status, sale reference, available service/order references, received time, settlement transactions and sale-ledger transaction. No pending or failed record is promoted by the display. Unknown assets or receipts without the supported settlement/correlation fields are omitted. A configured file remains the responsibility of that company’s server configuration.

The **Recorded mainnet payment** section shows the prior 0.10 USDC sale from `artifacts/mainnet-proof/funded-loop.json`, cross-checked against the saved checkout settlement. It is labeled as a previous sale and is excluded from current-company counts. If that sale is already in the configured company store, it is displayed once in the company section. Missing or mismatched historical artifacts do not produce a receipt.

Fresh local demo companies never read the parent funded-loop store. Their conversations remain free and their own receipts stay empty until a real payment path is connected. The recorded payment is available for the walkthrough without pretending a fresh demo agency has received revenue. The prior Cloud cost was attributed to the sale; it was billed to an owner-prepaid Cloud key.

`GET /api/workspace/customer-payments` requires owner workspace access, rejects query parameters, is read-only and returns a whitelist of display fields. It does not expose customer identities, deposit addresses, provider keys, inference outputs or run keys. Neither page load nor **Refresh receipts** submits a payment, contacts a provider, re-verifies settlement or changes financial/journal state.

Validation:

- Full suite: 650 passed, no failures or skips.
- Receipt tests cover owner access, read-only behavior, private-field exclusion, malformed/pending receipts, exact amounts, historical/current separation, durable configured receipts and demo isolation.
- `node scripts/check-payments-browser.mjs` checks the actual UI and native JBrain with the saved historical receipt. Desktop 1440 and mobile 390 have no horizontal overflow or page errors; provider operations and financial version remain zero.
- Browser evidence: [artifacts/customer-payments-ui](../artifacts/customer-payments-ui/).

These are receipt-display checks. They do not submit a new payment or wire paid checkout into the local customer-care service.

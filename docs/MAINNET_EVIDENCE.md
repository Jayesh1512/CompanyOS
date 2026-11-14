# Mainnet verification evidence

Recorded execution: **14 November 2026**. Documentation and automated-test update: **15 November 2026**. This page groups public-chain transaction references, retained provider records and automated regression results by their verification scope.

> **Trust labels:** **LIVE_PUBLIC** = public RPC or recorded public-provider observation; **LIVE_AUTHED** = an authenticated provider re-read; **LOCAL_ARTIFACT** = inspection of retained run records; **CONTROLLED** = injected test inputs. Each label identifies the evidence supporting that result.

The provider sections describe retained original-run records. The checklist's
**LOCAL_ARTIFACT** label explicitly distinguishes inspecting those records from
fresh independent verification of their claims.

```text
Account roles
  ledger contract / owner : 755a0a4bb40161793c0a178c89b0ed1a876d8c0d0bbea8febecfe2a7d0d9662b
  scoped-key writer (retired): c65dfd852ac424c967951a7f3e2d6ee3153374822c30a4a484345ee5bbf456fc
  Agent API agent account : b2c5b8f31edf4dfb2560eb14397c8d61656c9f34c4f644077ed08a991fd9fc75
  dedicated marketplace payer : e17d480f28ef0c3f39c7b3a12bdf80acfa2e2282a5e7a2eae3f019510ce6e8d4
```

## Recheck chain state and inspect retained provider artifacts

```sh
node scripts/verify-mainnet-evidence.mjs
```

The verifier reads public RPC `query`/`tx`, contract `get_head`/`get_records` views and retained artifacts. Each result identifies its evidence scope. The 14 November snapshot passed **20/20 checks**: **14 public-chain checks** and **6 retained-provider-artifact checks**. Public RPC checks establish the recorded chain state and transactions; artifact checks inspect the saved marketplace and Cloud fields.

## 1. Ledger contract deployed on mainnet

| Step | Label | Transaction |
| --- | --- | --- |
| Atomic deploy `deploy_contract(wasm)` + `new(company_hash, null)` | LIVE_PUBLIC | [`DP64fpGTGLyDwUouW9ecas6wgZwuzS7hyDeKH3WtUswR`](https://nearblocks.io/txns/DP64fpGTGLyDwUouW9ecas6wgZwuzS7hyDeKH3WtUswR) |
| `set_writer(owner)` + append sequence 2 | LIVE_PUBLIC | [`Cmh2zL2SWhm5mJ4JY23nHFFyJtLiavEV4Vfp4Bsvzb1n`](https://nearblocks.io/txns/Cmh2zL2SWhm5mJ4JY23nHFFyJtLiavEV4Vfp4Bsvzb1n) / [`5Xg6uasjZW4nnwWCFjP3stAaaiDtnCixc3zGvuCarhUb`](https://nearblocks.io/txns/5Xg6uasjZW4nnwWCFjP3stAaaiDtnCixc3zGvuCarhUb) |

- Contract account: `755a0a4b…`, `code_hash` `GnfHJq4kXk5eLNNSvez2ue7BCHDEaGyZSTXrGzqaZ27g` (matches `artifacts/onchain-ledger/contract-manifest.json`).
- Rust `near-sdk` 5.30.2; ordered hash commitments with original customer and policy data retained privately.

Evidence: `artifacts/onchain-ledger/mainnet-deployment.json`, `mainnet-ledger-write.json`.
Scripts: `scripts/deploy-ledger-mainnet.mjs`, `scripts/write-ledger-record.mjs`.

## 2. Scoped writer key

| Step | Label | Transaction |
| --- | --- | --- |
| `Add_Key` function-call key scoped to `append` | LIVE_PUBLIC | [`DUPtojtZt7jUkEUozUeQGBbs812nWHDiXhKjv3v2jxe`](https://nearblocks.io/txns/DUPtojtZt7jUkEUozUeQGBbs812nWHDiXhKjv3v2jxe) |
| `Delete_Key` remove full access | LIVE_PUBLIC | [`FPVgbFSQ6CqLFMtBYi4QKcAAz1WaMYwZGZ6ruXiAWyt`](https://nearblocks.io/txns/FPVgbFSQ6CqLFMtBYi4QKcAAz1WaMYwZGZ6ruXiAWyt) |
| `append` signed by the scoped key | LIVE_PUBLIC | [`GsQhBsCknFXwGTHjdMtSqWPHuyVBZgK31AqufopeUK7d`](https://nearblocks.io/txns/GsQhBsCknFXwGTHjdMtSqWPHuyVBZgK31AqufopeUK7d) |

- Scope check: the installed function-call key exercised its `append` permission; the artifact records the transfer-permission check separately.
- Final key listing: only `FunctionCall(append)` remains.

Evidence: `artifacts/onchain-ledger/mainnet-scoped-writer.json`. Script: `scripts/setup-scoped-writer.mjs`.

## 3. Dedicated marketplace payer

- Dedicated payer `e17d480f…` was funded with 1.0 USDC on NEAR and signed its marketplace payment.
- Marketplace payer separation uses a dedicated account with the key type accepted by the x402 endpoint.

Scripts: `scripts/setup-scoped-payer.mjs`, `scripts/pay-marketplace.mjs`.

## 4. Real paid marketplace call (x402 / NEP-366)

| Task | Label | Payer | Amount |
| --- | --- | --- | --- |
| `c41a599b-87a3-42cd-a70b-d35ad0d9babd` | LOCAL_ARTIFACT | `755a0a4b…` | 0.5 USDC |
| `0de69385-54a4-4e1f-bd34-c4155f532242` | LOCAL_ARTIFACT | `e17d480f…` | 0.5 USDC |

- Challenge: `near:mainnet` / USDC `17208628…` / payTo `ea667f5f…` (checked against `https://market.near.ai//.well-known/x402`).
- Each purchased task has a retained x402 payment record and `TASK_STATE_COMPLETED` output. The company acted as the buyer. Payment uses a NEP-366 signed delegate action (`ft_transfer`) with relayed gas. Task `c41a599b…` returned a cited research result.

Evidence: `artifacts/marketplace/payment-*.json`.

## 5. Public signed 1Click dry quote

The 14 November public-read run captured a real `dry:true` quote from the production 1Click endpoint. Official SDK verification checked the signed quote fields against the default production manager key. Offline replay reopened the saved evidence and repeated that signature check.

Evidence: [quote summary](../artifacts/live-evidence/2026-11-14-readonly-r1/intents-dry-quote-summary.json) and [offline verification](../artifacts/live-evidence/2026-11-14-readonly-r1/offline-verification.json). This result’s scope is public quote authenticity; the checkout settlement leg has its own references in section 9.

## 6. Agent API native-call route

| Step | Label | Reference |
| --- | --- | --- |
| `agent_create` (owner signature 1) | LOCAL_ARTIFACT | agent `0385e033…`, account `b2c5b8f3…`, policy `APPLIED` |
| `grant_issue` (owner signature 2) | LOCAL_ARTIFACT | live grant `45645e46…` |
| Fund agent NEAR account | LIVE_PUBLIC | [`6J4mwqzNaNSxvSmXDVRYcQZvxYE3zURm2suGiktu6eXD`](https://nearblocks.io/txns/6J4mwqzNaNSxvSmXDVRYcQZvxYE3zURm2suGiktu6eXD) |
| Native `get_head` via Agent API | LIVE_PUBLIC | [`36e1KinTTejrjGB8ZbeL69qiSYWDX3C6bbShpUd7Pepp`](https://nearblocks.io/txns/36e1KinTTejrjGB8ZbeL69qiSYWDX3C6bbShpUd7Pepp) |
| Native `append` via Agent API | LIVE_PUBLIC | [`B5uKmgFDs8MrVrMZUuYDj9yQxYDP8bWnpQDdgduJwF1m`](https://nearblocks.io/txns/B5uKmgFDs8MrVrMZUuYDj9yQxYDP8bWnpQDdgduJwF1m) |

- The recorded operational writer is the **agent’s own NEAR account**, using the Agent API native-call route under an owner-signed policy and grant.
- Ledger head advanced sequence 4 → 6 with the agent's append.

Evidence: `artifacts/onchain-ledger/mainnet-agent-api-append.json`.
Scripts: `scripts/agent-api-create.mjs`, `scripts/agent-api-whoami.mjs`, `scripts/fund-agent-account.mjs`, `scripts/agent-api-append.mjs`.

## 7. Owner-funded encrypted NEAR AI Cloud inference

- Owner-selected policy: **`live-verified-hold-on-loss`**. The encrypted reply, fresh-nonce gateway/model evidence and provider response are verified during the original call. Committed results are retained in the local journal.
- One real call: model `Qwen/Qwen3.8-27B`, answer accepted with an exact citation, provider completion `89ea7023…`, inference `41239757…`.
- Cost **632,050 nanoUSD ($0.000632)**, under the $0.10 per-call bound and reconciled. Three recorded demo calls total **3,853,210 nanoUSD ($0.00385321)**, all reconciled, within the $5 lifetime ceiling.

| Claim | Value |
| --- | --- |
| status | `answered` |
| wire signature verified | `true` |
| plaintext verified in original call | `true` |
| retained result access | committed local-journal result |
| cost status | `confirmed` / `APPROVED` |

Evidence: `artifacts/mainnet-proof/cloud-inference-item5.json`, `cloud-run-summary.json`.

## 8. Loop-driven spend through the Agent API

| Step | Label | Reference |
| --- | --- | --- |
| Decision: real NEAR AI Cloud completion (`Qwen/Qwen3.8-27B`, E2EE, signature verified) chose one `spend` command | LOCAL_ARTIFACT | provider request `6d4770b3…`, [`loop-receipt.json`](../artifacts/mainnet-proof/loop-receipt.json) |
| Autonomy loop executes it via Agent API under the owner grant: 25000 raw USDC (**0.025 USDC**) | LOCAL_ARTIFACT, re-readable with `NEAR_INTENTS_AGENT_API_KEY` (LIVE_AUTHED) | correlation `op_CeDN5uzQ…`, status `SUCCESS` |
| Loop auto-commits `spend.requested` (seq 21) and `spend.completed` (seq 20) plus agent lifecycle events | LIVE_PUBLIC | [`VsMbQdnVXAk2…`](https://nearblocks.io/txns/VsMbQdnVXAk2aJrVne2fZhnyTaPmS9fXhYi4Up6f3NT) |
| Earlier proof: allowed 0.1 USDC swap `SUCCESS`; over-limit request **refused** by policy | LOCAL_ARTIFACT | [`agent-spend-proof.json`](../artifacts/mainnet-proof/agent-spend-proof.json) |

```sh
node scripts/verify-loop-receipt.mjs   # read-only; 18/18 at last run (14 LIVE_PUBLIC)
```

The verifier recomputes each committed event's payload hash with the product's own function and finds it in the contract's hash-chained records, then checks the ledger transaction is FINAL, successful and an `append()` signed by the agent. The retained provider record describes a confidential USDC→wNEAR swap; its public-chain evidence is the event commitment. The Cloud decision used the owner’s inference key, with its run recorded separately from the application Treasury. The standalone execution script is `scripts/loop-spend-e2e.mjs`.

## 9. Owner-funded checkout and answer

The deployment-owner wallet `755a0a4b…` supplied the test checkout payment. A separately owner-prepaid Cloud call supplied the answer. The recorded accounting links the payment, inference cost and attributed surplus.

| Step | Evidence scope | Reference |
| --- | --- | --- |
| Owner-funded checkout: 0.10 USDC price, paid as wNEAR through 1Click | Public settlement leg and retained provider `SUCCESS` | [Settlement transaction](https://nearblocks.io/txns/3k7d2NbkpVhhL4KP3eQDVWHNsAzzZykDz1vKLbWaEVPn), [checkout record](../artifacts/mainnet-proof/live-checkout-settlement.json) |
| `sale.confirmed` ledger commitment | LIVE_PUBLIC | [Ledger append](https://nearblocks.io/txns/68Wy7NvsrKQpnAGPu1ySZ7GYY1STm4CD5ou5FmauV8fb) |
| One recorded owner-prepaid E2EE answer over fictional Harbor Mutual documents | LOCAL_ARTIFACT | Inference `e0cc2328…`, [funded-loop record](../artifacts/mainnet-proof/funded-loop.json) |
| Provider-billed cost: **202,710 nanoUSD ($0.00020271)** | Retained billing result | Same run record |
| Attributed surplus: **99,797,290 nanoUSD ($0.09979729)** | Recorded arithmetic | 100,000,000 − 202,710 nanoUSD |
| `inference.consumed` commitment references the checkout | LIVE_PUBLIC | [Ledger append](https://nearblocks.io/txns/9c2JJN2K3uYMvAyA8dCBEX7UbQbkRtdofJrqjzRdmCpU) |

```sh
node scripts/verify-funded-loop.mjs   # read-only; recorded result: 10/10
```

The verifier checks the public settlement leg and ledger appends, recomputes the inference payload hash and checks the recorded arithmetic. The Cloud bill belongs to the owner-prepaid key; `funding` identifies the checkout-to-cost relationship as accounting attribution. The recorded answer was executed through the standalone script. The application also has a separately configured `saleId` route at `POST /api/workspace/ai-demo/run`.

## 10. NanoGPT paid credit purchase

The [retained run](../artifacts/mainnet-proof/nanogpt-loop-2.json) records a real 0.35 NEAR payment into the company wallet and a 0.340779 NEAR payment to invoice 498165652. The [historical verifier output](evidence/nanogpt-live-verification.txt) records the original FINAL, amount, payload and invoice checks. Transaction hashes are withheld from this run and log; transaction-by-transaction verification cannot be reproduced from the committed files. [Purchase implementation](../src/cloud-funding/nanogpt.mjs); [standalone runner](../scripts/demo-nanogpt-loop.mjs).

The company wallet signs directly. The customer wallet was supplied by the maintainer; independent third-party revenue and grant-bound purchase are not established. Inference cost is a retained balance delta and NanoGPT is not TEE-attested. The unit tests establish adapter behavior only.

## Payment inventory: what moved and how to check it

| Recorded movement | Amount | Counterparty | Evidence |
| --- | --- | --- | --- |
| Marketplace task purchase `c41a599b…` | 0.5 USDC paid | market.near.ai | Retained payment and completed-task record |
| Marketplace task purchase `0de69385…` | 0.5 USDC paid | market.near.ai | Retained payment and completed-task record |
| Agent API confidential swap | 0.1 USDC → wNEAR | Intents | Retained provider record |
| Loop-driven confidential swap | 0.025 USDC → wNEAR | Intents | Provider record and public ledger commitment |
| Owner-funded checkout test | 0.10 USDC price, paid as wNEAR | 1Click deposit → treasury | Public settlement leg and retained run, section 9 |
| Ledger appends | Native transaction gas | Ledger contract | Public FINAL transaction references |

## Evidence interpretation

Ledger hashes commit to recorded events; original business data remains private. Marketplace records describe purchased task outputs. Cloud evidence describes owner-funded inference over fictional documents, verified during the original call. Confidential swaps use provider records for their financial status and public ledger transactions for event commitments. The owner-funded checkout joins payment and inference through recorded accounting attribution.

## Full list of `artifacts` for this increment

```text
artifacts/onchain-ledger/mainnet-deployment.json
artifacts/onchain-ledger/mainnet-ledger-write.json
artifacts/onchain-ledger/mainnet-scoped-writer.json
artifacts/onchain-ledger/mainnet-agent-api-append.json
artifacts/marketplace/payment-*.json
artifacts/mainnet-proof/cloud-inference-item5.json
artifacts/mainnet-proof/cloud-run-summary.json
artifacts/mainnet-proof/loop-receipt.json
artifacts/mainnet-proof/loop-spend-e2e.json
artifacts/mainnet-proof/agent-spend-proof.json
artifacts/mainnet-proof/live-checkout-settlement.json
artifacts/mainnet-proof/funded-loop.json
artifacts/nanogpt-agent-testing/tests.log
```

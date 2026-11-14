# Company for None — A Living Organization on NEAR

**Agents that repair the process, not just retry the prompt.** Company for None is a prototype living organization: a master agent coordinates specialists, a treasury tracks business activity, and a permanent backlog turns observed failures into evaluated improvements.

An owner supplies purpose, approved knowledge, policy and budget. The goal is an organization that earns from useful services and funds its own operation. **Recorded evidence now covers bounded self-repair and an operator-run service-payment demonstration; fully self-funding operation is not yet established.**

[Judge's guide](docs/JUDGE_GUIDE.md) · [Payment and mainnet evidence](docs/MAINNET_EVIDENCE.md) · [Recovery evidence](docs/RECOVERY_EXECUTION.md) · [Full product guide](docs/COMPANY_FOR_NONE_GUIDE.md)

![Recorded claims-intake recovery demonstration](artifacts/live-recovery/desktop.png)

*Recorded recovery interface. Its local company history is separate from the public mainnet ledger evidence below.*

## See the organization improve

A fictional claims-intake request asks which contact preference to record. The customer chooses `portal`, but the support runbook does not explain that requirement.

1. **Encounter the gap:** support escalates instead of inventing policy.
2. **Delegate repair:** within the bounded recovery workflow, the backlog selects a knowledge curator and template developer.
3. **Update knowledge:** the curator selects an exact passage from an owner-approved source. The runtime validates it and saves a new native JBrain runbook revision.
4. **Test the change:** the developer proposes the missing `contactPreference` field. The fixed evaluator rejects the baseline's mandatory-field coverage and accepts the candidate; Rules check the current revision before promotion.
5. **Retry with the improvement:** support reads the new knowledge and template revisions, cites the guidance and completes the same intake with `contactPreference: portal`.

The recorded run contains six real NEAR AI Cloud responses, original-process SDK verification and **$0.005128148** in matched provider bills. Restart evidence records no extra provider calls. [Run and revision evidence](docs/LIVE_RECOVERY_DEMO.md).

A second recorded scenario repairs a missing mailing-address requirement using the shared scenario engine. Its six accepted model calls and **$0.00776905** in bills are retained separately. Both evaluations in that run explicitly used **local fallback**, not verified remote OutLayer execution. [Second scenario and execution modes](docs/RECOVERY_EXECUTION.md).

These demonstrate bounded knowledge/template repair—not arbitrary autonomous code development or a live insurance business.

## Proof at a glance

Public-chain checks rerun on **14 November 2026, 18:03 UTC**. Stored provider records remain labeled as stored records, not fresh provider verification.

| Claim | Evidence | Scope |
|---|---|---|
| Mainnet ledger deployed; Agent API account is writer | `verify-mainnet-evidence.mjs`: **20/20** | 14 public-chain checks + 6 stored-artifact checks |
| All current ledger hashes recompute | `verify-loop-receipt.mjs`: **17/17**, head **24 records** | 14 public-chain + 3 artifact checks; authenticated provider check skipped |
| Sale linked to one paid answer and ledger records | `verify-funded-loop.mjs`: **10/10** | 7 public-chain + 3 artifact checks; limits below |
| Failed request repaired and retried using new revisions | [Recovery run](artifacts/live-recovery/browser-proof.json) and [restart record](artifacts/live-recovery/restart-proof.json) | Retained live-run evidence; private company journal |
| Second recovery scenario completed | [Missing-address run](artifacts/recovery-missing-address/live-run.json) | Retained model, revision, billing and local-fallback evidence |

The mainnet checklist checks previous-hash links in its first page; the loop verifier additionally recomputes every record hash and checks the full current chain. Totals and head count are snapshots, not permanent expected output.

## Treasury: payment, cost and the remaining funding gap

A recorded service-payment demonstration links a **0.10 USDC sale** through 1Click to one encrypted, signature-verified NEAR AI answer, with `sale.confirmed` and `inference.consumed` commitments on mainnet.

| Item | Recorded value | Meaning |
|---|---:|---|
| Sale price | 0.10 USDC | Operator-run checkout demonstration, not evidence of independent customer demand |
| Matched inference bill | $0.00020271 | Provider-reported charge to the owner-prepaid Cloud key |
| Sale less that one bill | $0.09979729 | Accounting remainder, **not profit**; excludes gas, other calls and operating costs |

**The sale did not buy Cloud credits.** Revenue and one inference cost are attributed together; no supported USDC-to-Cloud-credit purchase occurred. The verifier checks a FINAL settlement leg and the ledger appends, but not the customer's own deposit transfer or independent end-to-end monetary settlement. The paid answer ran through a script; the full preview-server path remains unproved. [Exact evidence and limits](docs/MAINNET_EVIDENCE.md#9-customer-funded-service-loop).

Separately, the organization has retained records of marketplace x402 task purchases and a **0.025 USDC confidential swap** initiated by a model-produced command. Purchases are expenses, not sales. The public ledger proves their commitments, not confidential fund movement. [Payment inventory](docs/MAINNET_EVIDENCE.md#payment-inventory-what-moved-and-how-to-check-it).

## Architecture: the living-system loop

```text
Owner: objective + approved knowledge + policy + budget
                         |
                    Master agent
                         |
              Scoped specialist -> deliverable
                         |
                 Observed knowledge gap
                         |
                  Permanent backlog
                         |
          Knowledge curator + template developer
                         |
             Fixed evaluation + revision check
                         |
            New revision -> subsequent permitted work

Treasury: receipts, reservations, costs and accounting
Private journal: source data, work and causal history
NEAR ledger: safe event/hash commitments, not raw customer data
```

Customer payments funding autonomous service delivery and maintenance are the target business loop. Paid external hiring, autonomous Cloud funding, refunds and contributor payouts are not established by the recovery demonstration.

## Why NEAR is part of the implementation

| Component | Role | Current evidence level |
|---|---|---|
| Agent API, SDK `0.9.0` | Existing owner-signed policy/grant; native ledger calls and bounded spend route | Mainnet ledger transactions; separate spend receipts |
| NEAR AI Cloud, SDK `0.3.0` | Encrypted inference with gateway/model and response-signature checks | Recorded original-process verification; no offline plaintext recovery |
| NEAR Intents, `@defuse-protocol/one-click-sdk-typescript` `0.1.26` | Cross-asset quotes and checkout path | Signed dry-quote evidence and sale settlement-leg checks |
| Rust `near-sdk` ledger + `near-api-js` | Append-only event commitments and public FINAL transaction reads | Mainnet contract and read-only verification |
| Native JBrain | Approved company knowledge and source revisions | Actual local storage and before/after reuse |
| OutLayer adapter + WASM evaluator | Optional remote evaluation path | Adapter/tests implemented; recorded address run used local fallback |
| PingPay x402 adapter | Offers, quote and settlement integration | Adapter exists; marketplace purchases do **not** establish live PingPay merchant settlement |
| Agent API native sign-intent adapter | EVM/Solana signing-route integration | Mocked SDK tests only; no live Chain Signatures/MPC execution evidence claimed |
| Agent-purchased NEAR AI credit | `src/cloud-funding/purchase.mjs`: pay USDC via Intents, seller org transfers credit to the agent's org | **Unit-tested only; not run live.** NEAR AI Cloud has no purchase API, so this uses its org-to-org credit transfer with an owner-operated seller. Needs one-time console setup: `node scripts/demo-funded-loop.mjs preflight` |
| Customer payment into the agent's own wallet | `src/payments/incoming.mjs`: Agent API deposit address, verified by provider status + balance rise | **Unit-tested only; not run live** |

## Verify without spending

Start with the [judge's guide](docs/JUDGE_GUIDE.md): public identifiers, exact commands, expected evidence labels and what each command cannot establish.

```sh
git clone https://github.com/Jayesh1512/company-for-none.git
cd company-for-none
node scripts/verify-mainnet-evidence.mjs
node scripts/verify-loop-receipt.mjs
```

These scripts query public RPC and inspect retained artifacts; they sign nothing and submit no paid request. Use a clean checkout without `.env` for the public-only route. The optional authenticated provider check is skipped when credentials are absent. No timing guarantee is claimed.

## Run the local workspace

Requires Node **24.22.1+**, npm, Git and Rust/Cargo:

```sh
npm ci
npm run setup:jbrain
npm run dev
```

Open `http://127.0.0.1:4173/#setup`. Ordinary startup seeds no sample company or commercial permission. The current recorded Northstar Care/Harbor Mutual example was explicitly configured and uses fictional documents. `#care` is model-free lookup; `#demo` is the separately authorized actual-AI path. Starting a new paid recovery run requires explicit credentials and budget authorization; see [recovery setup](docs/RECOVERY_EXECUTION.md) rather than assuming the main dev server starts it.

## Engineering and boundaries

- Rules own admission and policy; Treasury records reservations and costs. Unknown original effects are reconciled, not blindly resent.
- Knowledge repair uses approved source text; template promotion checks frozen requirements and the current revision. Required-field checks are not general semantic or enum validation.
- The recovery workflow has constrained scenarios, roles and repair operations. Instructions and host-code changes retain separate owner-review gates.
- Ledger finality is not payment finality, and a hash commitment does not prove its underlying business assertion.
- Recorded baseline: **563 tests passed** before the latest execution additions. This README update did not rerun the full suite; do not read that historical count as current CI status.

After installing dependencies and building native JBrain, run `npm test`, `npm run check` and `npm run test:native`. Keep controlled-test results separate from real-provider evidence. Broader behavior, access, costs and historical results are documented in the [product guide](docs/COMPANY_FOR_NONE_GUIDE.md), [verification contracts](docs/NEAR_VERIFICATION.md) and [mainnet evidence](docs/MAINNET_EVIDENCE.md).

# Real local demo

**Start demo** creates a fresh Northstar Care customer-care agency on every launch. Each agency has a new organization ID, a care manager and backlog agent, two policy/claims guides, its own native JBrain knowledge store, and two published local marketplace services.

Start the main workspace with `npm run dev`, then click **Start demo** in the top bar. You can also run `npm run demo:local` against the running loopback workspace. The button opens a dedicated local server and native JBrain store. **Exit local demo** returns to the main company.

## What to try

1. **Marketplace:** open the published policy or claims agent to start a customer conversation.
2. **Review agents:** open the manager’s Settings, edit its working instructions and save. Refresh to check the real revision is preserved. The manager/backlog are saved profiles; this demo does not claim they are running a model.
3. **Open knowledge:** read the fictional Harbor Mutual auto, home, travel and claims documents stored in actual native JBrain.
4. **Try customer chat:** ask “What is the auto collision deductible?” The answer quotes the published policy and includes its exact source revision. It uses model-free lookup, not a recorded or generated agent response.
5. Ask “Please approve my insurance claim.” The service creates a real local review ticket. It does not approve a claim or contact an insurer.
6. **Open escalation inbox:** inspect the saved ticket and private conversation.
7. **View recorded history:** inspect actual profile, document, reply and escalation events in the private company journal.

The guide displays current saved counts. Refreshing or navigating within a session keeps its records. Exiting and starting the demo again creates a new agency with fresh agents, listings and no earlier tickets or conversations. Prior session journals and knowledge stores are retained on disk; restarting the parent server also starts a fresh demo instead of reopening an old agency. Customer access tokens stay scoped to their browser origin, rather than being copied to the main workspace or inserted into URLs.

## Components and scope

| Component | Local demo behavior |
| --- | --- |
| Agent workspace | Four actual persisted profiles: manager, backlog and two policy/claims guides; edits use the normal Rules-controlled APIs |
| Company knowledge | Four actual native JBrain documents, real revisions/grants and current publication checks |
| Customer reply | Real document retrieval and exact cited excerpts; no language model |
| Escalation | Persistent owner-review ticket and private customer transcript |
| Ledger | Actual private company events, with the existing redacted projection; no public blockchain claim |
| Settings | Current local component status and a link back to live-workspace requirements |
| Cloud/model reasoning, wallet/payment, external purchase and NEAR publication | Outside this chosen local flow; private M01 demo scope holds execution and credentials resolve to null |

No fake provider, payment, inference, payout, approval, bill or success result is introduced. Fictional policy **content** is explicitly seeded by the demo action; its storage, lookup, citations, tickets and persistence are real. Live prerequisites are still present in the main workspace. They are not required for the selected local features and are not shown as local-demo setup blockers.

## Isolation and authority

The lazy launcher is a private server port. Its owner-only endpoint accepts an empty request; callers cannot choose a store, binary, account, network or credentials. Retries with the same idempotency key share one startup; distinct launch keys create distinct agencies. The main company journal is not changed by opening or using the demo.

Each dedicated store is under `.runtime/local-real-demo-v1/sessions/<session-id>/`, with its own company journal, native brain and access token. An unknown existing directory/marker is rejected rather than adopted or erased. New launches preserve earlier session files, including saved edits and publication revocations. Legacy v1 demo history is left intact. The main server owns and closes its demo server/JBrain processes; unrelated processes are untouched.

The demo app explicitly selects setup mode and null credentials/authority, with no `.env` loader or economic history import. It overrides inherited ledger/account/credit bindings rather than falling back to the main environment. Its company intent has zero model calls. A private M01 context independently holds paid effects, provider probes/preflights and autonomous start/resume; a browser parameter cannot set that context. The USD5 ceiling remains an upper bound, not a spending grant. Native JBrain's access token is private0600 and never printed or returned through the UI.

The separate **Fill example fields** action in ordinary organization setup now uses the same Northstar Care customer-care theme. It is labeled separately and still performs no automatic save or execution.

## Reproduction

```sh
npm run setup:jbrain              # required once for the pinned native service
npm run dev
npm run demo:local                # opens through the already running local owner server
node --test test/integrations/local-demo*.test.mjs test/workspace/demo.test.mjs test/autonomy/ui.test.mjs
npm run check:demo:browser         # fresh isolated actual product/native JBrain browser flow
npm test
npm run test:native
npm run check
```

Current evidence: [artifacts/fresh-customer-care-demo](../artifacts/fresh-customer-care-demo/). The full suite passes **639/639** with no failures or skips; focused demo/setup/UI checks pass **12/12**, and syntax checks cover **205 JavaScript files**. The T3 collaborative browser verified the one-click launch, fresh organization and agent IDs, two marketplace listings, a cited customer reply, an owner-review ticket, and a second launch with no earlier conversations. Desktop 1440/mobile 390 checks reported no horizontal overflow or browser errors. These checks used real local journals and native JBrain, with zero paid provider operations and no financial state changes.

These results establish the selected real **local** flow. They do not close live inference, economic, supplier, native signing/fee or public-deployment requirements.

# CompanyOs

CompanyOs brings company setup, agent profiles, native JBrain knowledge, customer care and versioned improvements into one local workspace. Owners define the company, approve knowledge and set operating boundaries. Agents and their work have persistent records, revision history and a private company ledger.

Start with [How CompanyOs works](docs/COMPANYOS_GUIDE.md) for the operating model and [the local demo](docs/LOCAL_REAL_DEMO.md) for a guided customer-care walkthrough.

## What you can use

- **Company setup and agent management.** Define the company, review manager and backlog profiles, edit instructions and assign written skills.
- **Company knowledge.** Store versioned documents in native JBrain, import PDFs/text/public pages and select each agent’s permitted context.
- **Customer care.** The fictional Northstar Care agency serves Harbor Mutual policy questions with exact source quotations and creates persistent owner-review tickets.
- **Versioned improvements.** Registered structured templates use fixed baseline/candidate evaluation, revision promotion and rollback. Instruction changes use paused owner review. Controlled full-loop tests exercise delegation, gap detection, repair and future context.
- **Marketplace guidance.** Browse local templates, written skills, independently authored SOUL.md guidance and customer-care services.
- **Private and mainnet records.** Inspect private company events and the deployed NEAR ledger’s ordered hash commitments.

## Demonstrated integrations

**Owner-funded NEAR AI Cloud.** Two recorded encrypted calls through the official SDK produced a cited answer and an owner-review ticket, with original-process gateway/model and response verification. Provider bills total **$0.00322116**. Saved accepted results replay from the local journal. [AI demo and verification scope](docs/REAL_AI_DEMO.md).

**NEAR mainnet ledger.** The Rust contract is deployed and has recorded Agent API native-call writes under an owner-signed policy and grant. The 14 November verification snapshot passed **20 checks**: 14 public-chain checks and 6 retained-provider-artifact checks, including a 22-record hash chain. [Transactions and read-only verification](docs/MAINNET_EVIDENCE.md).

**Recovery swarm on NEAR testnet.** Retained records describe five agents with distinct NEAR subaccounts that signed six commitments during a real six-call Cloud recovery. The contract binds each signer to its actor hash. Agent head, authorization and readback tools run through the official NEAR MCP server with a CompanyOS public-read extension. [Redacted execution record](docs/evidence/swarm-execution.txt), [full run with MCP exchanges](docs/evidence/swarm-live-run.json), [historical verification log, redacted](docs/evidence/swarm-verification.txt), [contract](contracts/company-ledger/src/lib.rs), [signer](src/onchain/agent-ledger.mjs) and [MCP tool](src/onchain/near-mcp.mjs). This is the configured recovery swarm; arbitrary new profiles are not automatically funded. Transaction hashes and explorer links are withheld from these records; transaction-by-transaction verification cannot be reproduced from the committed files.

**Marketplace task purchases.** Two separately invoked x402 purchases obtained completed task outputs from `market.near.ai`, at **0.5 USDC each**. The company acted as the buyer. [Recorded task purchases](docs/MAINNET_EVIDENCE.md#4-real-paid-marketplace-call-x402--nep-366).

**Public quote and attestation reads.** A real 1Click `dry:true` quote passed production-root SDK signature verification and offline replay. Cloud preflight verified fresh gateway/model nonces, UpToDate TCB and gateway TLS binding. [Public evidence and reproduction](docs/LIVE_EVIDENCE.md).

**Owner-funded checkout test.** The deployment-owner wallet supplied a **0.10 USDC** checkout payment. A separately owner-prepaid, signature-verified Cloud answer cost **$0.00020271**. The recorded accounting attributes that cost to the checkout; `sale.confirmed` and `inference.consumed` have mainnet ledger references. [Checkout evidence and attribution](docs/MAINNET_EVIDENCE.md#9-owner-funded-checkout-and-answer).

**Loop-driven spend.** A real Cloud decision led to a **0.025 USDC** confidential swap through the Agent API. Provider records describe the swap; the public ledger commits its recorded events. [Spend evidence](docs/MAINNET_EVIDENCE.md#8-loop-driven-spend-through-the-agent-api).

**NanoGPT credit purchase.** A retained mainnet run received **0.35 NEAR** from a separate maintainer-supplied wallet and paid **0.340779 NEAR** to NanoGPT invoice `498165652`. NanoGPT reports `COMPLETED`; purchase and inference records have ledger commitments. This standalone path uses a company-wallet key; it is not grant-bound or proof of an independent customer. [Redacted run record](artifacts/mainnet-proof/nanogpt-loop-2.json), [read-only verification](docs/evidence/nanogpt-live-verification.txt), [purchase code](src/cloud-funding/nanogpt.mjs) and [runner](scripts/demo-nanogpt-loop.mjs). Transaction hashes and explorer links are withheld from these records; transaction-by-transaction verification cannot be reproduced from the committed files.

## Open the workspace

The main workspace uses **port 4173**:

- [Organization setup](http://127.0.0.1:4173/#setup): Define company → Review agents → optional Company brain → Boundaries & infra → Review & finish.
- [Company operations](http://127.0.0.1:4173/#autonomy): objectives, responsible agents, work, improvements and requests.
- [Company knowledge](http://127.0.0.1:4173/#knowledge): documents, grants and revisions.
- [Customer chat](http://127.0.0.1:4173/#care) and [owner inbox](http://127.0.0.1:4173/#support): cited policy lookup and local review tickets.
- [Company ledger](http://127.0.0.1:4173/#autonomy/ledger): private history and NEAR audit tools.
- [Marketplace](http://127.0.0.1:4173/#marketplace): guidance, resource descriptions and local services.
- [Real AI demo](http://127.0.0.1:4173/#demo): owner-funded inference using the configured private execution scope.

The top-right **Start demo** button opens a fresh local agency with its own native JBrain store, four agents, four fictional policy documents and two published local services. **Exit local demo** returns to the main company. **Fill example fields** prefills editable setup drafts. [Local demo walkthrough](docs/LOCAL_REAL_DEMO.md).

## Run

Requires Node **24.22.1+**, npm, Git and Rust/Cargo.

```sh
npm ci
npm run setup:jbrain
npm run dev
```

JBrain setup builds pinned commit `35836b0972a6471b22db3155f78b26749c78b6ac` with locked Cargo dependencies. Configure an existing installation through `SHOP_JBRAIN_BINARY`, or `SHOP_JBRAIN_URL` and `SHOP_JBRAIN_TOKEN_FILE`.

Development startup loads local environment configuration and starts the app and native JBrain on loopback. Direct local-browser access uses the actual socket, exact Host/port and same-origin metadata. Shared or remote deployments use configured authentication. [Access setup](docs/LOCAL_WORKSPACE_ACCESS.md).

Configuration names are in [.env.example](.env.example). `SHOP_CONFIG_PATH` explicitly selects a commercial policy. Setup saves company and agent configuration; execution uses separately configured authority and readiness.

## Checks

```sh
npm test
npm run test:native
npm run check
npm run test:autonomy
npm run demo:e2e:controlled
node scripts/evidence/verify.mjs
node scripts/verify-mainnet-evidence.mjs
```

The original **512-test baseline** is readable in [the unabridged historical output](docs/evidence/tests-baseline-512.txt), including every test name and its pass count. After item 1, the [committed regression suite](docs/evidence/tests-item2.txt) passed **606 tests**. The [second recovery timeline](docs/evidence/recovery-missing-address.txt) lists all six original Cloud calls, revisions, evaluation results and bills, plus redacted metadata for the later testnet evidence anchor. The anchor commits the retained historical bytes; the original recovery ran off-chain. Transaction hashes and explorer links are withheld from these records; transaction-by-transaction verification cannot be reproduced from the committed files.

Controlled-loop tests combine real application modules, Rules, Treasury, native JBrain and the fixed evaluator with injected SDK reasoning, proof, credit and billing inputs. Mainnet verification labels public RPC checks and retained artifact checks separately.

## Accounting, verification and storage

Within the journal-backed application, M01 decides policy and exact plans; M03 records reservations and receipts. Its configured **USD5 lifetime actual-plus-pending ceiling** applies to the application’s shared financial store. Separately invoked evidence scripts use their own recorded run state and operator-selected amounts.

Official Cloud **0.3.0**, 1Click **0.1.26** and Agent API **0.9.0** SDKs are pinned. The AI demo accepts output verified during the original encrypted call and reuses committed results from the journal. Offline verification covers retained byte integrity and supported wire-signature checks. [Verification details](docs/NEAR_VERIFICATION.md).

Saved documents, grants, conversations, tickets, reports and history persist locally. Back up the application journal and company-brain directory together while stopped. Imports produce editable previews; explicit Save persists reviewed text and provenance. Customer-care publication binds exact fictional document revisions. The public ledger stores event types, times and linked hashes; original business data stays private. [Knowledge storage](docs/JBRAIN_INTEGRATION.md) and [customer-care behavior](docs/CUSTOMER_CARE.md).

[Product overview](PRODUCT.md), [design system](DESIGN.md) and [claim-to-evidence index](CLAIMS.md) provide additional detail.

## Integration scope

Chain Signatures/MPC signing, PingPay/x402 revenue and OutLayer remote evaluation have been removed from the product. Recovery runs the [local fixed evaluator](src/autonomy/evaluation.mjs) through [the recovery executor](src/demo/recovery.mjs). The recorded x402 marketplace purchases above are buyer-side purchases, not business revenue. Unit tests use controlled inputs to test rejection and recovery; they do not establish a live integration.

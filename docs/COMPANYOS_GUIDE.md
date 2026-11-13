# How CompanyOs works

Current product guide · 15 November 2026

**Give the company an objective, approved knowledge and operating boundaries. Review its work, exceptions and versioned improvements in one workspace.**

CompanyOs combines persisted agent profiles, native JBrain context, work records and a private company ledger. Controlled full-loop tests exercise manager delegation, specialist work, gap detection, backlog follow-up, developer proposals and fixed template evaluation.

## A day at the company

**Northstar Care** serves fictional **Harbor Mutual Insurance**. Its local customer-care flow uses four native JBrain documents covering auto, home, travel and claims guidance.

Open [customer chat](http://127.0.0.1:4173/#care) and ask “What is the auto collision deductible?” The app retrieves an exact approved passage with its document title and revision. Requests for claim decisions create persistent cases in the [owner inbox](http://127.0.0.1:4173/#support). This service uses model-free document lookup and local tickets.

The top-right **Start demo** button creates a fresh agency with four agent profiles, its own native JBrain store and two local listings. **Exit local demo** returns to the main workspace. [Demo walkthrough](LOCAL_REAL_DEMO.md).

The separate [Real AI demo](http://127.0.0.1:4173/#demo) uses an existing agent and selected granted documents under its configured owner-funded execution scope. Two recorded encrypted Cloud calls produced a cited answer and an owner-review ticket, billed at **$0.00322116** total. [Original-call verification and records](REAL_AI_DEMO.md).

## The operating loop

The workflow model is objective → manager → scoped specialist → delivery → observed gap → backlog → developer → fixed evaluation → promoted revision → future context. Controlled tests exercise the full chain with injected SDK reasoning, proof, credit and billing inputs.

The owner defines purpose, policy, document access and budget, and starts or pauses eligible work. Managers delegate scoped work and report gaps. The permanent backlog keeps follow-up visible. Specialists deliver results. Developers propose supported template changes. The fixed evaluator supplies actual baseline/candidate observations. M01 decides admission and promotion; M03 records application financial effects.

**Agent-managed** is the default for new companies. **Owner-managed** retains owner-managed team assembly. Profiles are persisted configuration; running work is represented by a durable claim and its recorded state.

## How it heals

A gap’s identity binds the company, target, base revision and observed failure. Repeated observations accumulate on the same open item. Developer proposals add or require allowed fields in a registered structured template.

The fixed evaluator runs **the same frozen inputs against baseline and candidate**. Its evidence binds exact content, contract, test-set and evaluator hashes. M01 checks the evaluated base and current head before compare-and-swap promotion. Later work resolves the effective revision; earlier snapshots retain their captured content.

Instruction changes use explicit paused-owner review and create a revision for the named agent’s future context. Host-code suggestions are recorded as manual review items. Rollback creates another revision and audit event, preserving history.

## Work controls and recovery

The journal-backed company workflow uses durable objective counters, dependency checks, work leases and fences. Counters include attempts across pause and restart. A fence binds dispatch and local writes to the current worker. Stable command identities support replay of admitted results.

Provider operations in this workflow retain their original identities and financial reservations for reconciliation. The shared application financial store applies its configured actual-plus-pending ceiling. Standalone evidence scripts use separate recorded run state and operator-selected amounts.

See [integration contracts](COMPANYOS_CONTRACTS.md) for the journal-backed workflow vocabulary.

## How it upgrades

Owners and agents use versioned company resources:

- **Instructions:** owner-reviewed guidance for a named profile.
- **Templates:** fixed-evaluated structured data, promoted heads and rollback revisions.
- **Skills and SOUL.md:** independently authored written guidance with exact versions and hashes.
- **Knowledge:** owner-approved native JBrain documents and permitted revisions.

New work freezes the effective profile, selected knowledge excerpts and current template heads. Document grants and each role’s selected context are separate controls. Current grants are checked again before inference. Children receive a permitted subset of their parent’s scope.

## Marketplace and customer service

The local marketplace offers templates, written guidance, resource descriptions and published customer-care services. Customer-care publication binds exact fictional document revisions and leads to private conversations, cited excerpts and owner tickets.

Separately invoked x402 marketplace purchases obtained two completed task outputs at 0.5 USDC each. Those records describe the company acting as a buyer. [Task-purchase evidence](MAINNET_EVIDENCE.md#4-real-paid-marketplace-call-x402--nep-366).

## Current capability and status

The table records implemented behavior and the evidence supporting each scope.

| Capability | Evidence scope | Recorded behavior |
| --- | --- | --- |
| Company setup and agent profiles | Local product | Persisted brief, roles, objectives, edits and owner controls. |
| Company knowledge | Actual native JBrain | Document revisions, selected context, grants, source citations and restart persistence. |
| Customer-care portal and inbox | Local product | Fictional policy lookup, private conversations and saved owner-review tickets. |
| Delegation → gap → repair → future version | Controlled full-loop tests | Real app, Rules, Treasury, JBrain and evaluator with injected SDK inputs. |
| Template promotion and rollback | Local and controlled tests | Exact revision checks, fixed evaluation and effective future context. |
| Owner-funded AI trial | Recorded paid provider calls | Encrypted cited answer and escalation ticket, original-process SDK verification, $0.00322116 in provider bills. |
| Public Cloud preflight and 1Click dry quote | Public provider reads | Fresh nonce/TCB/TLS checks and production-root quote signature replay. |
| Marketplace task purchases | Retained provider records | Two completed purchased task outputs. |
| Loop-driven spend | Provider record and public ledger commitment | 0.025 USDC confidential swap with recorded lifecycle events. |
| Owner-funded checkout and answer | Retained run and public settlement/ledger references | 0.10 USDC test payment and a separately prepaid Cloud answer, linked by accounting attribution. |
| Rust NEAR ledger | Local Sandbox and recorded mainnet verification | Deployed contract, hash-chained records and Agent API native-call writes through evidence scripts. |
| NanoGPT purchase | Recorded mainnet payment and completed invoice | [Run and verification](MAINNET_EVIDENCE.md#10-nanogpt-paid-credit-purchase); company-wallet signing, not grant-bound. |

[Mainnet evidence](MAINNET_EVIDENCE.md), [public-provider evidence](LIVE_EVIDENCE.md) and the [claim index](../CLAIMS.md) retain the references and verification scope. The [final committed-source regression run](evidence/tests-final-committed.txt) passed 618 tests. [Final validation](evidence/final-validation.txt) records the 15 evidence-index checks and 218 committed JavaScript syntax checks.

## Owner setup and practical next actions

1. Open [setup](http://127.0.0.1:4173/#setup), define the company and review the configured profiles.
2. Save approved documents in [Company knowledge](http://127.0.0.1:4173/#knowledge), grant access and select each role’s bounded context while paused.
3. Review boundaries and infrastructure, then finish configuration review. Execution uses the selected policy and current readiness.
4. Inspect work and improvements in [Company operations](http://127.0.0.1:4173/#autonomy). Review instruction changes while paused and follow revision links in the private ledger.
5. Try the fictional service in [customer chat](http://127.0.0.1:4173/#care) and inspect a saved case in the [owner inbox](http://127.0.0.1:4173/#support).

For client setup, record the approved documents, effective dates, disclosure scope, escalation process and authorized decision makers. Provider execution uses protected server configuration and the exact approved account, model, amount and work scope.

[Run instructions](../README.md#run), [setup contracts](UNIFIED_COMPANY_SETUP.md) and [customer-care details](CUSTOMER_CARE.md) cover the active local flow.

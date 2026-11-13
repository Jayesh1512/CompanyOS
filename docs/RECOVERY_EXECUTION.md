# Recovery execution evidence

Recovery uses the local frozen evaluator in `src/demo/recovery.mjs` and
`src/autonomy/evaluation.mjs`. Baseline and candidate run against the same
contract; only a passing additive repair can be promoted. Remote OutLayer
execution has been removed from the product.

Two scenario definitions share this loop:

```sh
node scripts/recovery-demo.mjs --scenario contact-preference --port 4187 --start
node scripts/recovery-demo.mjs --scenario missing-address --port 4188 --start
```

Each scenario uses a separate default runtime directory, preserving earlier
evidence. Reusing a directory for another scenario is rejected. The source,
customer question, gap, required evidence, and allowed additive repair operations
live in `src/demo/recovery-scenarios.mjs`. The backlog model chooses a nonempty
subset and order from the allowed repair roles; the executor follows that list.
Missing repairs hold the run before promotion and retry. Model-written schemas,
citations, and intake values still have to satisfy the selected frozen contract.
Both scenarios retain the same six-call/$0.60 owner-funded inference ceiling.

The real `missing-address` run on 14 November 2026 completed all six NEAR AI
Cloud calls, revised the native JBrain runbook, promoted the additive address
field after the fixed tests passed, and retried the same customer question.
Provider bills totalled **$0.00776905**, with no pending reservations. The saved
[live run](../artifacts/recovery-missing-address/live-run.json) contains the role
plan, provider request IDs, SDK verification references, revision changes, and
costs. Both evaluations explicitly record `local-fallback` because OutLayer was
unconfigured. This artifact proves the live model/repair path; it does not claim
verified remote WASM execution or durable offline plaintext replay.

The Agent API ledger writer also exposes `finalize({action})`. This reads the
original provider correlation, checks the transaction through the pinned NEAR
RPC client at FINAL, matches the original signer/receiver/function call, and
persists the successful receipt as private evidence. It never submits another
transaction or treats provider SUCCESS alone as chain finality. Fee accounting
remains a separate receipt reconciliation step.

The [plain-text step-by-step log](evidence/recovery-missing-address.txt) includes provider IDs, revision changes and all bills. Its [testnet anchor](evidence/recovery-anchor.json) records the retained artifact digest; transaction hashes and explorer links are withheld. This later commitment is explicitly retrospective. Reproduce its rendering with `node scripts/readable-recovery-evidence.mjs`; `node scripts/anchor-recovery-evidence.mjs` requires the dedicated funded testnet credentials in `.runtime/hackathon-testnet/`.

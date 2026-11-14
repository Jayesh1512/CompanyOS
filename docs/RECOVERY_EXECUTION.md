# Recovery execution evidence

The recovery loop evaluates both the broken baseline and proposed repair through
`createRecoveryEvaluator`. It uses the existing OutLayer request builder and
adapter, pins the project version, caps compute, and submits each job once.
Pending jobs are polled by their original call ID. A lost submission response
never triggers another paid submission.

Configure the `SHOP_OUTLAYER_*` project variables and private
`OUTLAYER_PAYMENT_KEY` shown in `.env.example`. The recovery launcher derives the
payer owner/nonce from the key unless explicitly configured. Install the pinned,
independent verifier before requesting remote evidence:

```sh
node scripts/setup-outlayer-verifier.mjs
node scripts/recovery-demo.mjs --scenario missing-address --port 4189 \
  --directory .runtime/outlayer-address-proof-v1 --require-outlayer --start
```

The setup script builds `out-layer/outlayer-verify` at commit
`90c27d9d4fc843194ddc6f8ebaafa4eb320c3bb6` with locked dependencies, checks its
embedded Intel root hash, and records the executable hash/compiler in a local
manifest. The launcher uses this binary through `outlayer-verifier.mjs`; it
requires successful quote authenticity, approved worker identity, V1 task
binding, UpToDate TCB, and both payload hash checks. It also compares the payer,
project, pinned WASM, and captured attestation against the verifier bundle.
The subprocess receives no payment key and cannot submit another execution.

Verification uses the numeric task ID from the captured attestation, avoiding
dependence on the mainnet call-ID lookup rollout. Both the machine report and
self-contained evidence bundle are saved as private journal artifacts. The
bundle can be rechecked with `outlayer-verify bundle proof.json --offline`;
offline worker approval relies on the chain answer captured in that bundle.
Use the online check to refresh the independently acquired chain observation.

With `--require-outlayer`, a missing or rejected remote proof holds the scenario
before repair or promotion. Ordinary recovery retains its explicit local
fallback. A custom verifier module remains available through
`--outlayer-verifier /absolute/path/to/verifier.mjs`, exporting
`verifyExecution(input)` with the proof shape in `src/integrations/outlayer.mjs`.

Verified output must also match the frozen local evaluator before promotion.
Missing configuration, unavailable execution, invalid proof, or divergent output
uses the local fallback. `recoveryEvaluations` records which path actually ran,
the failure reason, call ID, proof, and attestation/response artifact references.
These records are available in the private recovery API's `evaluations` array.
Raw response and attestation bytes stay in private journal artifacts.

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

`npm run evaluator:build` builds native and WASI binaries and records the WASM
hash in `artifacts/mentor-implementation/evaluator-manifest.json`. Building the
binary does not deploy it or prove remote execution. No live OutLayer call is
claimed without configured project/payment credentials and an independent
execution verifier. The committed transport/proof tests are controlled tests.

The Agent API ledger writer also exposes `finalize({action})`. This reads the
original provider correlation, checks the transaction through the pinned NEAR
RPC client at FINAL, matches the original signer/receiver/function call, and
persists the successful receipt as private evidence. It never submits another
transaction or treats provider SUCCESS alone as chain finality. Fee accounting
remains a separate receipt reconciliation step.

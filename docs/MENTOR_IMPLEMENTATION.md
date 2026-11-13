# Mentor implementation scope

The [original mentor response](../artifacts/mentor-implementation/mentor-response.json) is retained as historical input. Current product claims are in [CLAIMS.md](../CLAIMS.md).

The application uses the Agent API for the recorded mainnet ledger path, with local Rules/Treasury authorization, reservations and original-operation recovery. Native finality verification is in `src/onchain/agent-api-writer.mjs` and `src/onchain/fees.mjs`; the recorded executions are in [mainnet evidence](MAINNET_EVIDENCE.md). Account and checkpoint preparation remains unsigned until explicitly executed.

Chain Signatures/MPC signing, PingPay revenue and OutLayer remote evaluation were removed from the product because they lacked a live critical-path execution. Recovery uses `src/autonomy/evaluation.mjs` locally. Historical controlled test logs do not establish current remote features.

NanoGPT has a retained real mainnet purchase; see [the run and verification scope](MAINNET_EVIDENCE.md#10-nanogpt-paid-credit-purchase).

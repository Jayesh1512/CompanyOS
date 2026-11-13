# Audit-business grant revocation

The audit-business grant is separate from an Agent API grant. An Agent API
`grant_revoke` intent does not revoke this contract's grant.

The rebuilt [contract](../contracts/audit-business/src/lib.rs) exposes owner-only
`revoke_grant(grant_id)`. It checks the current grant identity, stores its revoked
status under a separate storage key, appends `grant.revoked` to the business
ledger and emits a NEP-297 `grant_revoked` event. Repeated revocation is a no-op.
`fulfill` checks that flag before modifying an order, reducing allowance or
creating the outgoing notary promise. Revocation stops new spending; it cannot
recall a payment that was already dispatched.

Separate storage preserves the original serialized contract and grant layouts.
The [compiled-WASM tests](../test/business/revocation-contract.test.mjs) deploy
the historical build, issue a grant and paid order, upgrade to the new WASM,
then exercise non-owner rejection, owner revocation, event emission, direct
spend rejection and a newly issued active grant. A second test calls the app's
owner HTTP action against a real local nearcore Sandbox contract and verifies
that a subsequent direct spend is rejected. No provider or signing mock is used.
[Complete output](evidence/grant-revocation-tests.txt).

The new build is retained in
[`artifacts/audit-business-revocation/`](../artifacts/audit-business-revocation/manifest.json).
The historical public deployment's WASM and manifest remain in
`artifacts/audit-business/`; they are still used to verify the original business
cycle. The new revocation build has **not been deployed to the recorded public
testnet accounts** by this change. Its demonstrated execution scope is local
nearcore Sandbox, including an upgrade and the app-to-contract call.

For an owner-controlled deployment of the new build, configure:

```sh
SHOP_AUDIT_BUSINESS_CONTRACT_ID=business.<funded-parent>.testnet
SHOP_AUDIT_BUSINESS_OWNER_FILE=/private/path/business-owner.json
```

The credential file must be mode `0600`, identify the configured contract owner
and remain outside version control. The server pins the new compiled code hash
and refuses an older or different deployment. It accepts no contract address,
RPC URL, signing key, method or amount from HTTP input.

The owner action in Settings calls
`POST /api/workspace/audit-business/revoke` with the displayed current `grantId`.
The [web route](../src/web/index.mjs) checks verified owner access and Rules
authorization. The [control](../src/business/control.mjs) sends only
`revoke_grant`, with zero attached principal, through the configured owner key.
It persists the original operation before submission, verifies FINAL success
and re-reads the revoked flag. An uncertain submission is not automatically
resent; a later read can establish revocation without inventing a transaction
receipt. The local demo never inherits this signing binding.

use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault};
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{LookupMap, Vector};
use near_sdk::serde_json::json;

const PRICE: u128 = 2_000_000_000_000_000_000_000_000;
const NOTARY_FEE: u128 = 1_000_000_000_000_000_000_000_000;
const ZERO: &str = "0000000000000000000000000000000000000000000000000000000000000000";
fn sha(value: &str) -> String { env::sha256(value.as_bytes()).iter().map(|b| format!("{b:02x}")).collect() }
fn valid_hash(value: &str) -> bool { value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
pub struct Grant { pub id: String, pub agent_id: AccountId, pub vendor_id: AccountId,
    pub remaining_yocto: String, pub expires_at_ns: String }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
pub struct Order { pub id: String, pub customer_id: AccountId, pub task_hash: String,
    pub revenue_yocto: String, pub spend_yocto: String, pub state: String, pub decision_hash: Option<String> }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
pub struct Record { pub sequence: u64, pub kind: String, pub actor_id: AccountId, pub order_id: String,
    pub payload: String, pub payload_hash: String, pub previous_hash: String, pub hash: String }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AuditBusiness { owner_id: AccountId, grant: Option<Grant>, orders: LookupMap<String, Order>,
    notarizations: LookupMap<String, String>, records: Vector<Record> }

impl AuditBusiness {
    fn record(&mut self, kind: &str, actor_id: AccountId, order_id: &str, payload: String) {
        let sequence = self.records.len() as u64 + 1;
        let previous_hash = self.records.len().checked_sub(1).and_then(|i| self.records.get(i)).map(|r| r.hash.clone()).unwrap_or_else(|| ZERO.into());
        let payload_hash = sha(&payload);
        let hash = sha(&["companyos-business-record:v1", &sequence.to_string(), kind, actor_id.as_str(), order_id, &payload_hash, &previous_hash].join("\n"));
        self.records.push(Record { sequence, kind: kind.into(), actor_id, order_id: order_id.into(), payload, payload_hash, previous_hash, hash });
    }
}

#[near]
impl AuditBusiness {
    #[init]
    pub fn new() -> Self {
        near_sdk::require!(env::predecessor_account_id() == env::current_account_id(), "SELF_INIT_REQUIRED");
        Self { owner_id: env::current_account_id(), grant: None, orders: LookupMap::new(b"o"), notarizations: LookupMap::new(b"n"), records: Vector::new(b"r") }
    }

    pub fn issue_grant(&mut self, agent_id: AccountId, vendor_id: AccountId, max_spend: U128, expires_at_ns: U64) -> Grant {
        near_sdk::require!(env::predecessor_account_id() == self.owner_id, "OWNER_REQUIRED");
        near_sdk::require!(max_spend.0 > 0 && expires_at_ns.0 > env::block_timestamp(), "INVALID_GRANT");
        near_sdk::require!(vendor_id != env::current_account_id(), "SELF_VENDOR_DENIED");
        let id = sha(&format!("{}:{}:{}:{}:{}", agent_id, vendor_id, max_spend.0, expires_at_ns.0, env::block_height()));
        let grant = Grant { id, agent_id, vendor_id, remaining_yocto: max_spend.0.to_string(), expires_at_ns: expires_at_ns.0.to_string() };
        self.grant = Some(grant.clone()); grant
    }

    #[payable]
    pub fn buy_audit(&mut self, order_id: String, task_hash: String) -> Order {
        near_sdk::require!(!order_id.is_empty() && order_id.len() <= 80 && valid_hash(&task_hash), "INVALID_ORDER");
        near_sdk::require!(self.orders.get(&order_id).is_none(), "ORDER_ALREADY_PAID");
        near_sdk::require!(env::attached_deposit().as_yoctonear() == PRICE, "EXACT_PRICE_REQUIRED");
        let order = Order { id: order_id.clone(), customer_id: env::predecessor_account_id(), task_hash,
            revenue_yocto: PRICE.to_string(), spend_yocto: "0".into(), state: "paid".into(), decision_hash: None };
        self.orders.insert(order_id.clone(), order.clone());
        self.record("sale.confirmed", order.customer_id.clone(), &order_id, near_sdk::serde_json::to_string(&order).unwrap()); order
    }

    pub fn fulfill(&mut self, order_id: String, grant_id: String, decision_hash: String) {
        let mut grant = self.grant.clone().expect("GRANT_REQUIRED");
        near_sdk::require!(env::predecessor_account_id() == grant.agent_id, "AGENT_REQUIRED");
        near_sdk::require!(grant.id == grant_id, "GRANT_MISMATCH");
        near_sdk::require!(env::block_timestamp() < grant.expires_at_ns.parse::<u64>().unwrap(), "GRANT_EXPIRED");
        let remaining = grant.remaining_yocto.parse::<u128>().unwrap();
        near_sdk::require!(remaining >= NOTARY_FEE, "GRANT_EXHAUSTED");
        near_sdk::require!(valid_hash(&decision_hash), "DECISION_HASH_REQUIRED");
        let mut order = self.orders.get(&order_id).cloned().expect("ORDER_REQUIRED");
        near_sdk::require!(order.state == "paid", "ORDER_NOT_SPENDABLE");
        near_sdk::require!(order.revenue_yocto.parse::<u128>().unwrap() >= NOTARY_FEE, "REVENUE_REQUIRED");
        order.state = "pending".into(); order.spend_yocto = NOTARY_FEE.to_string(); order.decision_hash = Some(decision_hash.clone());
        self.orders.insert(order_id.clone(), order.clone());
        grant.remaining_yocto = (remaining - NOTARY_FEE).to_string(); self.grant = Some(grant.clone());
        self.record("spend.requested", grant.agent_id.clone(), &order_id,
            json!({"vendorId":grant.vendor_id,"amountYocto":NOTARY_FEE.to_string(),"grantId":grant_id,"decisionHash":decision_hash,"taskHash":order.task_hash}).to_string());
        // Direct host promises avoid importing newer, unused PromiseAction
        // variants, so this exact WASM also runs in the pinned local Sandbox.
        let remote = env::promise_create(grant.vendor_id, "notarize",
            json!({"order_id":order_id,"task_hash":order.task_hash}).to_string().as_bytes(),
            NearToken::from_yoctonear(NOTARY_FEE), Gas::from_tgas(15));
        let callback = env::promise_then(remote, env::current_account_id(), "on_notarized",
            json!({"order_id":order_id}).to_string().as_bytes(), NearToken::from_yoctonear(0), Gas::from_tgas(15));
        env::promise_return(callback);
    }

    #[private]
    pub fn on_notarized(&mut self, order_id: String) -> bool {
        let mut order = self.orders.get(&order_id).cloned().expect("ORDER_REQUIRED");
        near_sdk::require!(order.state == "pending" && env::promise_results_count() == 1, "ORIGINAL_PENDING_ORDER_REQUIRED");
        let accepted = match env::promise_result_checked(0, 128) { Ok(bytes) => near_sdk::serde_json::from_slice::<String>(&bytes).ok().as_ref() == Some(&order.task_hash), _ => false };
        order.state = if accepted { "completed" } else { "failed" }.into();
        self.orders.insert(order_id.clone(), order.clone());
        // A failed external effect is retained, not automatically paid again.
        self.record(if accepted { "spend.completed" } else { "spend.failed" }, env::current_account_id(), &order_id,
            near_sdk::serde_json::to_string(&order).unwrap()); accepted
    }

    /// Real paid service: permanently store a digest and return it after storage.
    #[payable]
    pub fn notarize(&mut self, order_id: String, task_hash: String) -> String {
        near_sdk::require!(valid_hash(&task_hash) && !order_id.is_empty() && order_id.len() <= 80, "INVALID_ORDER");
        near_sdk::require!(env::attached_deposit().as_yoctonear() == NOTARY_FEE, "EXACT_NOTARY_FEE_REQUIRED");
        let payer = env::predecessor_account_id();
        let key = sha(&format!("{}:{}", payer, order_id));
        near_sdk::require!(self.notarizations.get(&key).is_none(), "ALREADY_NOTARIZED");
        self.notarizations.insert(key, task_hash.clone());
        self.record("evidence.notarized", payer, &order_id, json!({"taskHash":task_hash,"feeYocto":NOTARY_FEE.to_string()}).to_string()); task_hash
    }

    pub fn get_order(&self, order_id: String) -> Option<Order> { self.orders.get(&order_id).cloned() }
    pub fn get_grant(&self) -> Option<Grant> { self.grant.clone() }
    pub fn get_notarization(&self, payer_id: AccountId, order_id: String) -> Option<String> { self.notarizations.get(&sha(&format!("{}:{}", payer_id, order_id))).cloned() }
    pub fn get_records(&self) -> Vec<Record> { self.records.iter().cloned().collect() }
}

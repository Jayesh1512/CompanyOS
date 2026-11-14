// Read-only MCP server (JSON-RPC 2.0, MCP 2025-06-18 tool subset) over the Agent API.
// Tools: get_balances (the agent's confidential balance) and get_policy (the owner-signed policy and usage).
// It cannot move money, change policy or sign: no write route is reachable from here. Not the sponsor demo's OAuth MCP endpoint.
const PROTOCOL = '2025-06-18';
const TOOLS = Object.freeze([
  {name: 'get_balances', description: "The agent's confidential balances (asset, symbol, balance, available). Read-only.", inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
  {name: 'get_policy', description: "The agent's current owner-signed policy revision, allowed actions, assets, limits, destinations and budget usage. Read-only.", inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
]);
const text = value => ({content: [{type: 'text', text: JSON.stringify(value, null, 2)}]});

export function createMcpHandler({api, agentId, grantApi}) {
  if (!api || !agentId || !grantApi) throw new TypeError('createMcpHandler needs api, grantApi and agentId');
  const calls = {
    get_balances: async () => text(await grantApi.getBalances(agentId, {source: 'confidential'})),
    get_policy: async () => { const {policy, revision, usage} = await api.getPolicy(agentId); return text({revision, policy, usage}); },
  };
  /** Returns a JSON-RPC response object, or null for notifications. */
  return async function handle(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return {jsonrpc: '2.0', id: msg?.id ?? null, error: {code: -32600, message: 'Invalid Request'}};
    if (msg.id === undefined) return null; // notification (e.g. notifications/initialized)
    const ok = result => ({jsonrpc: '2.0', id: msg.id, result}), err = (code, message) => ({jsonrpc: '2.0', id: msg.id, error: {code, message}});
    if (msg.method === 'initialize') return ok({protocolVersion: PROTOCOL, capabilities: {tools: {}}, serverInfo: {name: 'companyos-agent-readonly', version: '1.0.0'}});
    if (msg.method === 'ping') return ok({});
    if (msg.method === 'tools/list') return ok({tools: TOOLS});
    if (msg.method === 'tools/call') {
      const call = Object.hasOwn(calls, msg.params?.name) ? calls[msg.params.name] : null;
      if (!call) return err(-32602, `Unknown tool: ${msg.params?.name}`);
      try { return ok(await call()); } catch (e) { return ok({isError: true, content: [{type: 'text', text: `${e.code ?? 'ERROR'}: ${String(e.message).slice(0, 200)}`}]}); }
    }
    return err(-32601, `Method not found: ${msg.method}`);
  };
}

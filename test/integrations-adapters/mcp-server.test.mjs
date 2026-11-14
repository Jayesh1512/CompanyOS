import test from 'node:test';
import assert from 'node:assert/strict';
import {createMcpHandler} from '../../src/integrations/mcp-server.mjs';

const calls = [];
const handle = createMcpHandler({agentId: 'a1',
  api: {getPolicy: async id => { calls.push(['getPolicy', id]); return {revision: 3, policy: {actions: ['swap']}, usage: {}, secretInternal: 'x'}; }},
  grantApi: {getBalances: async (id, o) => { calls.push(['getBalances', id, o]); return {balances: [{symbol: 'wNEAR', balance: '0.1'}]}; }}});
const req = (method, params, id = 1) => handle({jsonrpc: '2.0', id, method, params});

test('initialize and tools/list expose exactly two read-only tools', async () => {
  const init = await req('initialize', {protocolVersion: '2025-06-18'});
  assert.equal(init.result.protocolVersion, '2025-06-18'); assert.deepEqual(init.result.capabilities, {tools: {}});
  assert.deepEqual((await req('tools/list')).result.tools.map(t => t.name), ['get_balances', 'get_policy']);
});
test('tools call the read routes only, with the confidential source, and return text content', async () => {
  const b = await req('tools/call', {name: 'get_balances'}), p = await req('tools/call', {name: 'get_policy'});
  assert.match(b.result.content[0].text, /wNEAR/); assert.match(p.result.content[0].text, /"revision": 3/); assert.doesNotMatch(p.result.content[0].text, /secretInternal/);
  assert.deepEqual(calls, [['getBalances', 'a1', {source: 'confidential'}], ['getPolicy', 'a1']]);
});
test('unknown tools and methods are JSON-RPC errors; notifications get no response; money-moving names are unreachable', async () => {
  assert.equal((await req('tools/call', {name: 'transfer'})).error.code, -32602);
  assert.equal((await req('tools/call', {name: 'constructor'})).error.code, -32602);
  assert.equal((await req('resources/list')).error.code, -32601);
  assert.equal(await handle({jsonrpc: '2.0', method: 'notifications/initialized'}), null);
  assert.equal((await handle({id: 1})).error.code, -32600);
});
test('a provider failure is a tool error, not a crash', async () => {
  const h = createMcpHandler({agentId: 'a1', api: {}, grantApi: {getBalances: async () => { throw Object.assign(new Error('boom'), {code: 'policy_denied'}); }}});
  const r = await h({jsonrpc: '2.0', id: 9, method: 'tools/call', params: {name: 'get_balances'}});
  assert.equal(r.result.isError, true); assert.match(r.result.content[0].text, /policy_denied/);
});

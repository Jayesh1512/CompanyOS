// Read-only MCP server over stdio (newline-delimited JSON-RPC). Uses the Agent API credentials from .env.
//   node scripts/mcp-server.mjs
// Claude Code: claude mcp add companyos-agent -- node scripts/mcp-server.mjs
import {createInterface} from 'node:readline';
import {loadEnvFile} from 'node:process';
import {createAgentApi} from '@near-intents-agent-api/sdk';
import {createMcpHandler} from '../src/integrations/mcp-server.mjs';

try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const api = createAgentApi({apiKey: process.env.NEAR_INTENTS_AGENT_API_KEY, baseUrl: process.env.NEAR_INTENTS_AGENT_API_URL});
const handle = createMcpHandler({api, grantApi: api.forGrant(process.env.NEAR_AGENT_GRANT_TOKEN), agentId: process.env.NEAR_AGENT_ID});
for await (const line of createInterface({input: process.stdin})) {
  if (!line.trim()) continue;
  let msg; try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}) + '\n'); continue; }
  const res = await handle(msg); if (res) process.stdout.write(JSON.stringify(res) + '\n');
}

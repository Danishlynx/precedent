// Precedent MCP server (stdio) — runs locally, launched by Claude Desktop.
// Proxies the deployed REST bridge over HTTPS. CommonJS is fine:
// @modelcontextprotocol/sdk ships dist/cjs with require conditions.
// stdout is the MCP protocol — ALL logging goes to stderr via console.error.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const BRIDGE_URL = (process.env.BRIDGE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.MCP_API_TOKEN;

async function bridge(path) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

const asText = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const asError = (err) => ({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });

const server = new McpServer({ name: 'precedent', version: '1.0.0' });

server.registerTool(
  'search_decisions',
  {
    description:
      'Search the team decision log by keyword or topic. Returns matching decisions with status (active/superseded), decider, action items, and a Slack permalink to the source thread.',
    inputSchema: { query: z.string().describe('Keywords or topic, e.g. "email vendor"') },
  },
  async ({ query }) => {
    console.error(`[MCP] search_decisions("${query}")`);
    try {
      return asText(await bridge(`/api/decisions/search?q=${encodeURIComponent(query)}`));
    } catch (err) {
      console.error('[MCP] error:', err.message);
      return asError(err);
    }
  }
);

server.registerTool(
  'get_decision',
  {
    description: 'Fetch one decision by id, including action items and supersession links.',
    inputSchema: { id: z.number().int().describe('Decision id from search_decisions') },
  },
  async ({ id }) => {
    console.error(`[MCP] get_decision(${id})`);
    try {
      return asText(await bridge(`/api/decisions/${id}`));
    } catch (err) {
      console.error('[MCP] error:', err.message);
      return asError(err);
    }
  }
);

server.registerTool(
  'list_open_action_items',
  {
    description: 'List all open action items across decisions, with owners, due dates, and the decision they came from.',
    inputSchema: {},
  },
  async () => {
    console.error('[MCP] list_open_action_items()');
    try {
      return asText(await bridge('/api/action-items?status=open'));
    } catch (err) {
      console.error('[MCP] error:', err.message);
      return asError(err);
    }
  }
);

async function main() {
  if (!TOKEN) console.error('[MCP] warning: MCP_API_TOKEN not set — bridge calls will 401');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[MCP] Precedent decision-log server running on stdio (bridge: ${BRIDGE_URL})`);
}

main().catch((err) => {
  console.error('[MCP] Fatal:', err);
  process.exit(1);
});

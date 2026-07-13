# Precedent 📌 https://precedent-website.vercel.app/

Decision memory for Slack. Watches team channels, extracts decisions with Claude, stores them with permalinks, answers "what did we decide about X?" in the assistant panel with receipts, nudges action-item owners, and exposes the decision log to external agents via MCP.

Built for the Slack Agent Builder Challenge. Uses all three required technologies: Slack AI assistant surface, the Real-Time Search API (`assistant.search.context`), and an MCP server.


<img width="1263" height="722" alt="image" src="https://github.com/user-attachments/assets/f6563984-da0a-44fc-8c81-a58b279ca2eb" />



## Setup

1. Create the Slack app from [manifest.json](manifest.json) at api.slack.com/apps (Create New App → From a manifest), enable the Agents/AI toggle, enable Socket Mode, generate an app-level token with `connections:write`, and install to the workspace.
2. `cp .env.example .env` and fill in every value (see comments in the file).
3. `npm install`

## Run

```bash
npm start          # the app: Bolt (Socket Mode) + REST bridge on :3000
npm run seed       # post demo conversations to 4 channels (prints channel IDs)
npm run mcp        # stdio MCP server (Claude Desktop launches this via config)
```

After seeding, sweep each channel through the extractor (oldest threads first is handled automatically):

```bash
curl -X POST "http://localhost:3000/api/dev/scan?channel=CXXXX" -H "Authorization: Bearer $MCP_API_TOKEN"
curl -X POST "http://localhost:3000/api/dev/nudge"              -H "Authorization: Bearer $MCP_API_TOKEN"
curl "http://localhost:3000/health"
```

Smoke test: `@Precedent which email vendor?` in any seeded channel — it must reply with Real-Time Search matches and permalinks.

## Claude Desktop (MCP)

`%APPDATA%\Claude\claude_desktop_config.json` (Windows) / `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "precedent": {
      "command": "node",
      "args": ["C:\\Users\\danis\\OneDrive\\Desktop\\Slack\\mcp\\server.js"],
      "env": {
        "BRIDGE_URL": "https://<your-railway-domain>.up.railway.app",
        "MCP_API_TOKEN": "<same value as the deployed bridge>"
      }
    }
  }
}
```

Fully restart Claude Desktop after editing. Tools: `search_decisions`, `get_decision`, `list_open_action_items`. Every call is logged to stderr (`[MCP] search_decisions("…")`); Claude Desktop captures it in `%APPDATA%\Claude\logs\mcp-server-precedent.log`.

## Deploy your own

Precedent is MIT-licensed — run it for your own team:

1. Create a Slack app in **your** workspace from [manifest.json](manifest.json) (Create New App → From a manifest). Enable the Agents/AI toggle, generate an app-level token with `connections:write`, install to the workspace.
2. Copy `.env.example` → `.env` and fill in your tokens, your Anthropic API key, and your Slack member ID for nudges.
3. `npm install && npm start` — that's a fully working local instance.
4. For always-on hosting, follow the Railway steps below (any Node host with a persistent disk works).

Skip `npm run seed` if you want it watching real conversations only — it exists to create demo data.

## Deploy (Railway)

- Node service from this repo (Railpack default builder; `engines.node` pins 22.x).
- Volume mounted at `/data`; set `DB_PATH=/data/precedent.db`.
- Env vars: paste `.env` contents in the Variables Raw Editor.
- Settings → Networking → Generate Domain (for `/health` + the MCP bridge).
- Leave the "Serverless" toggle OFF — the app must stay up 24/7.
- Never run `npm start` locally while the deployed instance is live: two Socket Mode connections split events.

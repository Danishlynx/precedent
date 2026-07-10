# CLAUDE.md — Precedent

Project context for Claude Code. Read this fully before writing any code. The complete implementation spec with full code listings lives in `precedent-build-guide.md` in this repo — that guide is the source of truth for code; this file is the standing context, decisions, and rules.

---

## 1. What we are building

**Precedent** — a decision-memory agent for Slack, built for the **Slack Agent Builder Challenge** (Devpost hackathon, sponsored by Salesforce).

One-liner: Precedent watches team channels, extracts decisions (what was decided, by whom, when, with which action items), stores them as structured records with permalinks, answers "what did we decide about X?" in Slack's assistant panel with receipts, nudges action-item owners via DM, and exposes the decision log as an MCP server so external agents can query it.

**Hard constraints:**
- **Deadline: Monday, July 13, 2026, 5:00 PM Pacific** (Devpost submission).
- **Track: New Slack Agent** (NOT the Organizations track — no Marketplace submission, no 5-workspace requirement).
- Judging runs July 14 – August 6. **The deployed app must stay up and working that entire time.** Judges get access to the sandbox and will test it themselves.
- Judging criteria (equal weight): Technological Implementation, Design, Potential Impact, Quality of the Idea. Stage One is a pass/fail check that we use at least one of the three required technologies.
- We deliberately use **all three** required technologies:
  1. **Slack AI capabilities** → assistant panel surface (`assistant_thread_started`, `setStatus`, `setSuggestedPrompts`, `setTitle`)
  2. **Real-Time Search (RTS) API** → `assistant.search.context`
  3. **MCP server integration** → our own MCP server exposing the decision log
  Do not remove or stub out any of the three — they are scoring requirements, not nice-to-haves.

---

## 2. API ground truths — THESE OVERRIDE YOUR TRAINING DATA

The RTS API and related surfaces shipped/renamed in Feb 2026 and are newer than most training data. The following was verified against docs.slack.dev in July 2026. Do not "correct" this code toward older patterns you know.

1. **Workspace search = `client.assistant.search.context(...)`.**
   **NEVER use `search.messages`** — it is legacy, requires different scopes, and Slack's docs explicitly say not to use it for agents. If you find yourself writing `search.messages`, stop.
2. **Bot-token RTS calls require an ephemeral `action_token`** taken from the triggering event payload (`event.action_token` on `message.im`, `message.channels`, `app_mention`, assistant-thread messages). It is short-lived: use it inside the same handler, **never cache or store it**. If it's missing, log the raw event and degrade gracefully to store-only answers.
3. **Always pass `include_bots: true`** in RTS calls. Our seeded demo data is bot-authored (posted via `chat:write.customize` personas); without this flag, search returns nothing and the demo dies.
4. Canonical RTS call shape (keep exactly this style):
   ```js
   const res = await client.assistant.search.context({
     query,                          // natural-language triggers semantic search; keywords always work
     action_token: event.action_token,
     content_types: ['messages'],
     channel_types: ['public_channel'],
     include_bots: true,
     include_context_messages: true,
     limit: 15                       // hard max is 20; paginate via response_metadata.next_cursor
   });
   const matches = res.results?.messages || [];
   // each match: content, permalink, channel_id, message_ts, author_user_id, is_author_bot, context_messages
   ```
5. Slack search filters (`in:#channel`, `after:2026-07-01`, `from:@user`) work inside `query`.
6. RTS called **from a public channel** returns public-channel results only; called from a DM/assistant thread it uses the full scope grant. Our assistant panel is a DM, so full grant applies.
7. Minimum required scope for RTS is `search:read.public`. RTS is available to internal apps and directory-published apps; our sandbox app is internal → fine. Do not make the app "unlisted distributed."
8. Thread drill-down = `conversations.replies({ channel, ts })`; `messages[0]` is the parent.
9. Assistant surface uses Bolt's `Assistant` class (`new Assistant({ threadStarted, userMessage })`, registered via `app.assistant(assistant)`), with `setStatus`, `setSuggestedPrompts`, `setTitle` helpers. Requires the "Agents & AI Apps" toggle, `assistant:write` scope, and assistant events — already configured in the app manifest (human did this in the Slack UI).
10. `chat.postMessage` is rate-limited ~1 msg/sec/channel → the seed script's 1200 ms sleep is load-bearing. Do not lower it.
11. Messages **cannot be backdated** — all seeded messages timestamp "now". Demo narrative is "decisions from this week".
12. LLM calls use the Anthropic SDK (`@anthropic-ai/sdk`), model **`claude-sonnet-4-6`**, JSON-only outputs for extraction (strip ```json fences before parsing, wrap in try/catch).

---

## 3. Architecture

```
┌────────────────────────── SLACK ──────────────────────────┐
│  #channels ──(message events)──► Detector ──► Extractor   │
│                                        (Claude API)  │    │
│  Assistant panel ◄─── Answer synth ◄── Decision Store ◄───┘
│        │                (Claude API)    (SQLite)  │
│        └─► assistant.search.context (RTS API) ────┤
│  DMs ◄── Follow-up engine (cron + buttons) ◄──────┤
│  App Home ◄───────────────────────────────────────┤
└───────────────────────────────────────────────────┼──────┘
                                                    │
                    REST bridge (Express, bearer auth)
                                                    │
                       MCP server (stdio) ◄── Claude Desktop
```

Everything runs in **one Node process** (Bolt on Socket Mode + Express REST bridge), except `mcp/server.js`, which runs locally on the demo machine as a stdio MCP server and calls the deployed REST bridge over HTTPS.

---

## 4. Stack decisions — made deliberately, do not relitigate

| Choice | Why (don't change without asking the human) |
|---|---|
| Bolt for JavaScript, CommonJS (`require`) | Matches the guide's code verbatim; no TypeScript migration, no ESM rewrite |
| **Socket Mode** (app token `xapp-`) | No public request URL, no tunneling; identical behavior local and deployed |
| **better-sqlite3**, single file DB | Zero-ops for a 3-day build; deployed with a Railway volume (`DB_PATH=/data/precedent.db`) |
| Express REST bridge in the same process | Gives the local MCP server (and dev triggers) access to the deployed DB |
| MCP server = **stdio**, calls REST bridge | Bulletproof with Claude Desktop for the demo; simpler than hosting streamable HTTP |
| Anthropic API, `claude-sonnet-4-6` | Fast + cheap enough at sandbox scale; two prompts: extraction + answer synthesis |
| Railway + volume | Fewest clicks; must stay up through Aug 6; `/health` endpoint gets an external uptime ping |
| Structured records + permalinks stored, **not message archives** | Slack ToS-friendly, judge-friendly privacy story; raw retrieval happens live via RTS |

---

## 5. Repo map (build exactly this)

```
precedent/
├── CLAUDE.md                 # this file
├── precedent-build-guide.md  # full spec with complete code listings — follow it verbatim
├── package.json              # scripts: start, seed, mcp; engines.node >= 20
├── .env                      # secrets — NEVER commit, NEVER print values
├── src/
│   ├── app.js         # entry: Bolt (Socket Mode) + Express bridge + wiring
│   ├── assistant.js   # assistant panel: threadStarted greeting + suggested prompts; userMessage → RTS + store → answer
│   ├── detector.js    # message.channels listener, 90s per-thread debounce → processThread → extract → store, 📌 reaction
│   ├── extract.js     # Claude call: thread text + existing decisions → JSON {is_decision, confidence, title, ..., supersedes_id}
│   ├── answer.js      # Claude call: question + stored decisions + RTS matches → ≤120-word mrkdwn answer, never invents
│   ├── store.js       # SQLite schema + queries (decisions, action_items, supersede, search, stats)
│   ├── followups.js   # cron weekdays 9am + runNudges(); Done/Snooze button handlers (chat.update)
│   ├── home.js        # app_home_opened → views.publish dashboard
│   └── blocks.js      # decisionCard (incl. "View source thread ↗" permalink button), nudgeBlocks
├── mcp/
│   └── server.js      # stdio MCP server: search_decisions, get_decision, list_open_action_items → REST bridge; log every call to stderr
└── scripts/
    ├── seed.js        # posts seed-data.json via chat:write.customize personas; creates+joins channels; 1200ms sleep
    └── seed-data.json # 4 channels: clean decision (#eng-core), superseded pair (#proj-phoenix), non-decision (#design), filler (#general)
```

## 6. Data model (summary — full SQL in the guide)

- `decisions(id, title, decision_text, decider, decided_at, channel_id, thread_ts, permalink, status[active|superseded], superseded_by, topics, created_at)` — UNIQUE(channel_id, thread_ts), upsert on conflict.
- `action_items(id, decision_id, owner_name, owner_user_id, description, due_date, status[open|done], last_nudged_at)`.
- Supersession: extraction prompt receives all active decisions (`id: title [topics]`) and returns `supersedes_id`; store then flips the old row to `superseded` + links `superseded_by`.

## 7. Environment

```
SLACK_BOT_TOKEN      xoxb-…   (bot token, from app install)
SLACK_APP_TOKEN      xapp-…   (app-level token, connections:write, for Socket Mode)
ANTHROPIC_API_KEY    sk-ant-…
DB_PATH              ./precedent.db locally; /data/precedent.db on Railway
PORT                 3000 locally; injected by Railway
MCP_API_TOKEN        long random string; bearer auth for the REST bridge
DEMO_NUDGE_USER_ID   the human's Slack member ID — all nudge DMs go here (personas aren't real users)
```

## 8. Commands

```bash
npm start          # run the app (Socket Mode + REST bridge)
npm run seed       # populate sandbox from scripts/seed-data.json
npm run mcp        # run the stdio MCP server locally (Claude Desktop launches this via config)

# dev triggers (demo determinism):
curl -X POST "http://localhost:3000/api/dev/scan?channel=CXXXX" -H "Authorization: Bearer $MCP_API_TOKEN"   # sweep a channel through the extractor
curl -X POST "http://localhost:3000/api/dev/nudge"              -H "Authorization: Bearer $MCP_API_TOKEN"   # fire follow-up DMs now
curl "http://localhost:3000/health"                              # liveness
```

## 9. Build order (do it in this sequence)

1. **Smoke test first (guide §5)** — minimal app.js with an `app_mention` handler calling RTS. Do not build anything else until RTS returns seeded messages. This validates the riskiest assumption.
2. Seed script + seed data (guide §6).
3. store.js + extract.js + detector.js (guide §4, §7). After seeding, run `/api/dev/scan` per channel to populate the store.
4. assistant.js + answer.js + blocks.js (guide §8) — the core Q&A-with-receipts flow.
5. followups.js (guide §9).
6. app.js final wiring + REST bridge (guide §10).
7. mcp/server.js (guide §11) + verify with curl against the bridge before touching Claude Desktop.
8. home.js (guide §12).
9. Deploy to Railway (guide §13). Then **feature freeze**.

**Cut list if behind (drop in this order):** App Home → Snooze button (keep Done) → keyword-fallback second RTS call → filler seed messages. **Never cut:** Q&A with permalink button, the superseded-decision pair, the MCP server.

## 10. Demo moments the code must support — do not break these

- `setStatus('Searching your team's decisions…')` visibly appears before answers (proves real work on camera).
- Every answer card includes the **"View source thread ↗" permalink button** — the single most important UI element; clicking it on camera is the proof the retrieval is real.
- The 📌 reaction lands on threads when a decision is logged (visible "the agent noticed" moment).
- `#proj-phoenix` produces the **superseded pair**: SendGrid decision → superseded by Postmark; the answer for "which email vendor?" must reflect the supersession with history.
- The `#design` thread must NOT be logged as a decision (graceful-failure demo: "I couldn't find a recorded decision about X, here's the closest related thread").
- The MCP server logs every tool call to **stderr** (`[MCP] search_decisions("…")`) — this is the show-the-plumbing shot in the video.
- Nudge DM with working **Mark done ✅** button that updates the message via `chat.update`.

## 11. Rules for you, Claude Code

- Follow `precedent-build-guide.md` **verbatim** for code. If guide and instinct disagree, the guide wins. If the guide is ambiguous or an API errors in a way the guide doesn't cover, fetch the relevant page on docs.slack.dev — do not guess from memory.
- No new frameworks, no TypeScript, no ORM, no test harness, no linter config — this is a 3-day hackathon; every added tool is schedule risk.
- Never commit `.env`; add it to `.gitignore` in your first commit. Never echo token values into logs or chat.
- Never cache/store `action_token`. Never lower the seed script's 1200 ms sleep. Keep the `subtype` guard in the message listener.
- Only ever run **one** Socket Mode instance at a time — two instances split events and cause ghost bugs. When Railway is live, do not also run `npm start` locally without telling the human.
- Handle LLM JSON with fence-stripping + try/catch; on parse failure, log the raw output and return `{is_decision:false}` rather than throwing.
- Errors in handlers must never crash the process — catch, `console.error`, degrade (e.g., RTS fails → answer from store only, and say so).
- Keep responses to Slack fast: `ack()` interactive actions immediately before doing work.
- If the human asks for something that conflicts with the deadline, the demo moments (§10), or the three-technologies requirement, flag the conflict before doing it.

## 12. Current status / what the human handles

Human-only steps (done or in progress via web UIs — don't try to automate these): Slack Developer Program + sandbox, app created from manifest, "Agents & AI Apps" toggle, token generation, Anthropic API key, Railway account + volume + env vars, Claude Desktop MCP config, sandbox access for judges (slackhack@salesforce.com, testing@devpost.com), demo video, Devpost form.

Definition of done: judges can open the sandbox, click a suggested prompt, get a correct decision answer with a working permalink; Claude Desktop can query `search_decisions` against the deployed bridge; everything in §10 works; app stays up through Aug 6.

# Precedent — Devpost Submission Package

Working drafts for the Slack Agent Builder Challenge submission (New Slack Agent track).
Deadline: Mon July 13, 2026, 5:00 PM PT.

---

## 1. Devpost text description (paste into the form)

### Inspiration

Every team makes decisions in Slack. And every team loses them. Three weeks later it's "wait, didn't we pick a vendor for this?" — followed by twenty minutes of scroll-archaeology, or worse, re-litigating a settled question. Institutional memory shouldn't depend on who happens to remember the thread.

### What it does

**Precedent is a decision-memory agent.** It quietly watches team channels and, when a conversation produces a real decision, logs it automatically — what was decided, who decided it, when, and which action items came out of it. No commands, no forms, no behavior change: people just talk, and the agent remembers.

- **📌 Capture** — a decision happens in conversation; ~90 seconds after the thread goes quiet, Precedent extracts it with Claude, pins the thread, and posts a one-line confirmation. Debates, deferrals, and chatter are correctly ignored.
- **🔎 Answers with receipts** — ask *"what did we decide about X?"* in the assistant panel (or @mention it in any channel). Answers combine the structured decision log with live workspace retrieval via Slack's **Real-Time Search API**, and every answer carries a **"View source thread ↗"** button — you never have to take the agent's word for it.
- **↩️ Supersession tracking** — when a team reverses itself ("switching from SendGrid to Postmark"), Precedent links the new decision to the old one and preserves the history. Ask about the topic and you get the current answer *plus* how you got there. A timestamp invariant guarantees history can never be rewritten backwards.
- **☑️ Accountability loop** — extracted action items get owners and due dates; a weekday cron DMs open items with working **Mark done ✅ / Snooze 💤** buttons.
- **📊 Home dashboard** — active decisions, superseded history, open action items at a glance.
- **🔌 Agent-to-agent memory** — the decision log is exposed as an **MCP server**: Claude Desktop (or any MCP client) can call `search_decisions`, `get_decision`, and `list_open_action_items` against the same live database. Your team's institutional memory becomes infrastructure other agents can build on.

### How we built it

All **three** challenge technologies, used deeply:

1. **Slack AI capabilities** — Bolt's `Assistant` class powers the panel: `threadStarted` greeting with suggested prompts, `setStatus`/`setTitle` during retrieval, answers as Block Kit cards.
2. **Real-Time Search API** — `assistant.search.context` with the ephemeral per-event `action_token`, `include_bots: true`, and a two-pass strategy: semantic search first, keyword pass with `disable_semantic_search` when results are thin.
3. **MCP server integration** — a stdio MCP server (`@modelcontextprotocol/sdk`) that proxies a bearer-authenticated REST bridge on the deployed app; every tool call logs to stderr.

Stack: Bolt for JavaScript on Socket Mode, Claude (`claude-sonnet-4-6`) for extraction + answer synthesis (JSON-guarded, fence-stripped, shape-normalized), better-sqlite3 on a Railway volume, Express REST bridge in the same process. Structured records + permalinks are stored — never message archives; raw retrieval happens live through RTS.

### Challenges we ran into

- **Docs vs. reality:** the RTS `action_token` is documented as a top-level event field — it actually arrives nested under `event.assistant_thread`. Found by logging the raw event when the first live search failed, fixed with a defensive lookup.
- **Semantic search whiffs:** "email vendor" didn't match seeded messages saying "email provider." Fixed with an automatic keyword fallback pass.
- **History integrity:** re-extracting an old thread could let the LLM claim it superseded a *newer* decision, inverting history. Fixed with a hard store invariant: supersession only flows forward in time.
- **LLM discipline:** extraction is JSON-only with confidence thresholds, deferral rules ("let's revisit next week" is NOT a decision), and full shape normalization so a malformed response can never poison the store.

### Accomplishments we're proud of

The answer-with-receipts loop: watching someone click "View source thread ↗" and land on the exact conversation is the moment the agent stops being a chatbot and becomes a system of record. Also: 20-case edge harness (short/long/multi-speaker/hostile input), an adversarial multi-agent code review that caught 11 real defects pre-launch, and graceful degradation at every layer (RTS down → store-only answers, and the agent says so).

### What's next

Reactions-as-corrections (❌ to unlog a false positive), per-channel opt-in policies, decision export, and richer MCP tools (decision timelines, owner workload) so other agents can reason over organizational memory.

---

## 2. Demo video script (~2:55, shot by shot)

> Record at 1080p. Slack in dark mode. Close the sidebar clutter. Rehearse once with `/api/dev/nudge` reset.

| Time | Shot | Script / action |
|---|---|---|
| 0:00–0:15 | Busy Slack channel scrolling | "Every team makes decisions in Slack. And every team loses them. Three weeks later: *didn't we already decide this?* Precedent fixes that." |
| 0:15–0:45 | #eng-core; type a decision message: "Decision: we're adopting feature flags for all rollouts. I'll set up the tooling by Friday." Cut the 90s wait. | "Precedent watches quietly. No commands, no forms. When the conversation goes quiet…" — 📌 appears + 'Logged as a decision' card. "…it noticed, extracted the decision, the owner, the deadline." |
| 0:45–1:20 | Open assistant panel → click suggested prompt "Which email vendor did we pick?" | "Weeks later, ask." Status flashes 'Searching your team's decisions…'. Answer: Postmark, decided by Sofia, *originally SendGrid — switched over deliverability*. "Current answer, plus the history — the team changed its mind, and Precedent kept the receipt." |
| 1:20–1:35 | **Click "View source thread ↗"** → lands on the real thread | "And this button is the whole philosophy: every answer links to the actual conversation. Receipts, not vibes." |
| 1:35–1:55 | Home tab dashboard | "The Home tab is the running memory: active decisions, superseded history, open action items." |
| 1:55–2:15 | DM: nudge with Mark done ✅ → click → message rewrites | "Decisions come with commitments. Precedent follows up — one click closes the loop." |
| 2:15–2:45 | Claude Desktop side-by-side with terminal. Ask CD: "What did the team decide about email vendors?" Terminal shows `[MCP] search_decisions("email vendor")` | "And the memory isn't trapped in Slack. Precedent is an MCP server — here's Claude Desktop querying the same live decision log. Agent-to-agent institutional memory." |
| 2:45–2:55 | Architecture diagram, then logo | "Slack AI surface, Real-Time Search, MCP — all three, one agent. Precedent: decisions, remembered." |

---

## 3. Submission checklist (Devpost form)

- [ ] Track: **New Slack Agent**
- [ ] Text description (above)
- [ ] Video: <3 min, uploaded to YouTube, public, link in form
- [ ] Architecture diagram (image)
- [ ] Sandbox URL: `https://precedent-danish.enterprise.slack.com`
- [ ] Judge access granted: slackhack@salesforce.com, testing@devpost.com
- [ ] Repo (optional but good): https://github.com/Danishlynx/precedent

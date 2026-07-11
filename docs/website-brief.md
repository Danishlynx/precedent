# Precedent — Showcase Website Brief

> Paste this whole document into Claude Desktop as context. It contains everything about the product.
> The website's job: make a visitor understand Precedent in 30 seconds and believe it in 3 minutes.
> UI/visual design decisions are yours — this brief is the source of truth for content, story, and facts.

---

## 1. What Precedent is

**One-liner:** Precedent is a decision-memory agent for Slack — it notices when your team makes a decision, remembers it forever, and answers "what did we decide about X?" with receipts.

**The elevator pitch:** Every team makes decisions in Slack. And every team loses them. Three weeks later someone asks "wait, didn't we already pick a vendor for this?" — cue twenty minutes of scroll-archaeology, or worse, re-litigating a settled question. Precedent fixes this without asking anyone to change how they work: no commands, no forms, no `/log-decision` rituals. People just talk. The agent notices, remembers, and proves it.

**The philosophy (recurring motif):** *Receipts, not vibes.* Every answer Precedent gives links to the actual Slack thread where the decision happened. You never have to take the agent's word for it.

**Name:** "Precedent" as in legal precedent — a past decision that governs the present. The logo/motif is a **pushpin 📌**, because the agent literally pins a 📌 reaction on every thread where it logs a decision.

---

## 2. The problem (for the site's problem section)

- Decisions in chat evaporate. Slack search finds *messages*, not *decisions* — you get 200 matches, not an answer.
- New teammates re-ask everything; veterans re-litigate everything.
- "Who decided this? When? Why?" has no system of record — it lives in people's heads.
- Decisions come with commitments ("Jonas will migrate the templates by Wednesday") that silently rot.
- Teams that DO keep decision logs rely on humans remembering to write them — which they don't.

**Key differentiator sentence:** Decision-log tools exist, but they all require humans to do the logging. Precedent notices on its own.

---

## 3. How it works — the four flows (site's core "how it works" section)

### Flow 1 — Capture (passive, automatic)
The team argues about something in a channel (e.g., token bucket vs fixed-window rate limiting). Precedent hears every message but waits — people talk in bursts — until the thread has been quiet for **90 seconds**. Then it reads the full thread and asks Claude one question: *did a decision happen here?* with strict JSON output: title, what was decided, who decided, topics, action items with owners and due dates, and whether it replaces an earlier decision.

- If **yes** (confidence ≥ 0.7): the record is saved with a permalink, a **📌 reaction** lands on the thread, and a one-line confirmation appears in-thread: *"📌 Logged as a decision: … — I'll remember this."*
- If **no** (a debate, a deferral like "let's revisit after the interviews", filler chatter): nothing is logged. Deferrals are explicitly NOT decisions.

### Flow 2 — Ask (the money flow)
Anyone opens Precedent's assistant panel (or @mentions it in a channel) and asks in plain language: *"Which email vendor did we pick?"* A status appears — *"Searching your team's decisions…"* — while two lookups run:
1. the structured decision log (SQLite), and
2. **live workspace search** via Slack's Real-Time Search API (semantic first; automatic keyword fallback if results are thin).

Claude synthesizes both into a ≤120-word answer with one hard rule: **answer only from evidence, never invent.** The reply is a card: the decision, who made it, when, open action items — and the signature **"View source thread ↗" button** that jumps to the real conversation.

If nothing exists (e.g., the design team never actually decided on the onboarding redesign), Precedent says so honestly and points to the closest related discussion instead of hallucinating a verdict.

### Flow 3 — Supersession (the memory with history)
Teams change their minds. The team picked SendGrid for email; two weeks later deliverability testing showed 12% of sends landing in Outlook spam, so they switched to Postmark. Precedent caught both decisions and **linked them automatically** — the extractor sees existing decisions and recognizes when a new one replaces an old one. Ask "which email vendor?" and you get: *current answer (Postmark), plus the history (originally SendGrid, superseded, and why).* A hard timestamp invariant guarantees history can only flow forward — re-processing old threads can never rewrite it.

### Flow 4 — Follow-up + agent-to-agent (the loop closers)
- **Action items:** every decision's commitments are tracked. A weekday-morning cron DMs owners about open items with working **Mark done ✅ / Snooze 💤** buttons that update the message in place. Decisions stop being trivia and become tracked commitments.
- **MCP server:** the decision log is exposed via the Model Context Protocol. Claude Desktop (or any MCP client) can call `search_decisions`, `get_decision`, `list_open_action_items` against the live deployed database. Demo moment: ask Claude Desktop "what did my team decide about the email vendor?" and it answers from Slack's institutional memory — agent-to-agent. Your team's memory becomes infrastructure other AIs can build on.

Also: an **App Home dashboard** in Slack — active decisions, superseded history (shown struck-through with what replaced them), open action items with owners.

---

## 4. Signature demo moments (use these as visual/interactive beats on the site)

1. The 📌 appearing on a thread ~90 seconds after a decision — "the agent noticed."
2. Clicking **"View source thread ↗"** and landing on the exact conversation — the receipt.
3. The supersession answer: "Postmark — *originally SendGrid, but switched due to a 12% spam rate to Outlook inboxes*."
4. The honest miss: "No recorded decision covers the onboarding redesign — here's the closest discussion."
5. The nudge DM rewriting itself to ~~struck through~~ **Done** on click.
6. Claude Desktop calling `search_decisions("email vendor")` while the server logs `[MCP] search_decisions("email vendor")` — the plumbing shot.

---

## 5. Real demo content (usable as example copy / fake-Slack mockups on the site)

**The SendGrid → Postmark story (the flagship example):**
- Sofia Reyes: "Phoenix launch emails — we need to pick a transactional email provider this week. SendGrid has the best free tier and half the team has used it before."
- Jonas Weber: "Fine by me. Their template editor is decent and the Node SDK is solid."
- Sofia: "OK, decided: Phoenix will use SendGrid for transactional email. Jonas, please set up the account and domain authentication this week."
- *(two weeks later, new thread)* Jonas: "Update on the SendGrid setup: deliverability to Outlook has been rough in testing — about 12% of our test sends landed in spam. I trialed Postmark and the same batch delivered clean, plus their support answered in under an hour."
- Sofia: "That's a launch risk we can't take. Switching: Phoenix will use Postmark instead of SendGrid for transactional email. Jonas, migrate the templates by Wednesday and I'll update the budget sheet."

**Precedent's answer when asked "Which email vendor did we pick?":**
> **Postmark** — decided by Sofia Reyes on 2026-07-11. Originally SendGrid, but switched due to a 12% spam rate to Outlook inboxes. Postmark delivered cleanly in the same tests. Open action item: Jonas Weber still needs to migrate email templates to Postmark (due Wednesday).
> 📌 *Switch Phoenix transactional email from SendGrid to Postmark · ✅ active · decided by Sofia Reyes*
> [View source thread ↗]

**Other real examples:** "Use token bucket rate limiting backed by Redis (100 req/min per API key)" decided by Maya Chen with two owned action items; "Atlas infrastructure: Terraform → superseded by Pulumi (TypeScript)" after a license cost change; a #design onboarding-redesign debate that correctly was NOT logged (they deferred pending user interviews).

---

## 6. Technology & architecture (for a "under the hood" section)

Built for the **Slack Agent Builder Challenge** (Devpost, sponsored by Salesforce) and uses **all three** qualifying technologies, not just the required one:

1. **Slack AI assistant surface** — the panel with suggested prompts, live status, threaded answers.
2. **Real-Time Search API** (`assistant.search.context`) — live workspace retrieval with the ephemeral per-event `action_token`, semantic + keyword fallback.
3. **MCP server** — self-built, exposing the decision log to external agents.

**Architecture (3 zones):**
- **Slack workspace** — channels, assistant panel, nudge DMs, App Home.
- **Railway (always-on cloud)** — a single Node.js process: Bolt on Socket Mode (Detector → Claude Extractor → SQLite decision store on a persistent volume), Claude answer synthesis, cron follow-up engine, plus an Express REST bridge with bearer auth and a public `/health`.
- **Any MCP client** — the stdio MCP server runs locally, calls the bridge over HTTPS; Claude Desktop consumes it.

**Stack:** `@slack/bolt` (Socket Mode — no inbound URLs), `claude-sonnet-4-6` (two prompts: extraction + answer synthesis), `better-sqlite3`, Express, `@modelcontextprotocol/sdk`. Privacy-conscious by design: Precedent stores **structured records + permalinks, never message archives** — raw retrieval happens live through Slack's own search, respecting Slack's permissions.

**Engineering credibility (optional trust section):** shipped with a 20-case edge harness (short/long/multi-speaker threads, hostile input, honest-miss paths), adversarially reviewed pre-launch, graceful degradation at every layer (if live search fails, it answers from the log and *says so*), 24/7 uptime monitoring.

---

## 7. Facts, links, and boilerplate

- **Name:** Precedent · **Tagline options:** "Decision memory for Slack." / "Ask what was decided. Get receipts." / "Your team already made this decision. Precedent remembers it."
- **GitHub (MIT-licensed, self-hostable in ~10 min):** https://github.com/Danishlynx/precedent
- **Built by:** Danish Ali, for the Slack Agent Builder Challenge 2026 (New Slack Agent track)
- **Demo video:** YouTube link TBD — leave an embed placeholder
- **Brand cues (suggestions only, designer's call):** near-black `#1a1d21` as the brand ground, a brass/gold pushpin as the mark, white pin-on-dark app icon; monospace flavor suits the "system of record" personality. Tone of voice: confident, dry, concrete — "receipts, not vibes," never marketing-fluffy.
- **Audience for this site:** hackathon judges first (they'll skim: what is it, does it really work, is it novel), developers second (can I run this?).

## 8. Suggested content outline (structure only — layout/visuals are the designer's)

1. **Hero** — name, one-liner, the receipts philosophy, CTA buttons (Watch demo / GitHub).
2. **The problem** — decisions evaporate in chat (short, punchy).
3. **How it works** — the four flows, each with its signature moment (§3–4). A fake-Slack conversation mock of the SendGrid→Postmark story would be the strongest possible centerpiece (§5 has the full copy).
4. **The answer, anatomized** — show the answer card: decision, decider, history line, action item, source button.
5. **Under the hood** — three-technology badges + the 3-zone architecture (§6).
6. **Open source** — MIT, self-host in 4 steps, GitHub link.
7. **Footer** — built for the Slack Agent Builder Challenge, by Danish Ali.

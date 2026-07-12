# Precedent — Demo Video Script (target 2:55)

## Staging (before recording)
1. `…railway.app/health` returns ok. 2. Old test mentions deleted from #proj-phoenix.
3. Slack DESKTOP app, tidy sidebar. 4. Claude Desktop open, empty chat.
5. No music. Mic check. One dry run. 6. 1080p, full screen.
Compliance: no .env / tokens / Railway variables on screen; no music; < 3:00; upload YouTube PUBLIC.

## Beats

**1 · Hook · 0:00–0:12 · #proj-phoenix, slow scroll**
SAY: "Every team makes decisions in Slack. And every team loses them. Three weeks later it's — didn't we already decide this? This is Precedent. It remembers."

**2 · Capture · 0:12–0:45 · #eng-core**
DO: type + send: `Decision: we're adopting feature flags for every rollout. I'll set up the tooling by Friday.`
SAY: "Precedent watches quietly. No commands, no forms — people just talk. When a conversation goes quiet for about ninety seconds…"
DO: [EDIT CUT — caption "90 seconds later"] show 📌 + "Logged as a decision" reply.
SAY: "…it notices. Pinned, logged — the decision, who made it, and the action item with its deadline. Extracted automatically."

**3 · Ask · 0:45–1:20 · Precedent app → Chat tab**
DO: click suggested prompt "Which email vendor did we pick?" — let the status flash show.
SAY: "Weeks later, anyone can just ask. Precedent searches its decision log — plus live Slack history through the Real-Time Search API. And look at this answer: Postmark. But also the history — the team originally chose SendGrid, then reversed it over spam rates. Precedent tracked that reversal on its own."

**4 · Receipt · 1:20–1:32**
DO: click "View source thread ↗" → lands on the real thread.
SAY: "And this button is the whole philosophy. Every answer links to the actual conversation. Receipts — not vibes."

**5 · Honest miss · 1:32–1:44 · panel**
DO: type: `What did we decide about the onboarding redesign?`
SAY: "And when the team never actually decided? It says so — and points to the closest discussion. It never invents an answer."

**6 · App Home · 1:44–1:56 · Home tab**
SAY: "The Home tab is the running memory — active decisions, superseded history, and every open action item with its owner."

**7 · Follow-ups · 1:56–2:14 · Precedent DM**
DO: click "Mark done ✅" — message rewrites on camera.
SAY: "Decisions come with commitments, so Precedent follows up on open action items — and one click closes the loop."

**8 · MCP · 2:14–2:44 · Claude Desktop**
DO: type: `What did my team decide about the email vendor? Use the precedent tools.` — let the tool call show.
SAY: "One more thing — this memory isn't trapped inside Slack. Precedent is also an MCP server. This is Claude Desktop, a completely separate app, querying my team's live decision log — the same answer, the same receipts. Institutional memory, available to any agent."

**9 · Close · 2:44–2:55 · architecture diagram → GitHub repo**
SAY: "Slack's AI surface, Real-Time Search, and MCP — all three, one agent. It's open source, and it's running right now. Precedent: decisions, remembered."

## Editing
- Only mandatory cut: the 90s wait in Beat 2.
- Trim narration before trimming footage — footage is the evidence.

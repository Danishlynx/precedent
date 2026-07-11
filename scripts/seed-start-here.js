// Creates #start-here with a formatted walkthrough for judges. Idempotent-ish:
// re-running posts the message again — run once (or delete the old post first).
require('dotenv').config({ quiet: true });
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

const BLOCKS = [
  { type: 'header', text: { type: 'plain_text', text: '👋 Welcome — try Precedent in 4 steps' } },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Precedent* is a decision-memory agent. It watches team channels, logs decisions the moment they happen (📌 on the thread), tracks who owns which action item, and answers questions *with receipts* — every answer links to the real source thread.',
    },
  },
  { type: 'divider' },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text:
        '*1️⃣ Ask it something.* Open *Precedent* in the sidebar (Agents & apps) → *Chat* tab → click the suggested prompt _“Which email vendor did we pick?”_\n' +
        '→ You\'ll get the current decision (*Postmark*), the history (_it replaced SendGrid — see #proj-phoenix_), and a *View source thread ↗* button. Click it — that\'s the receipt.\n\n' +
        '*2️⃣ Watch it notice a decision.* Post something like _“Decision: we\'ll use blue for the header. I\'ll update the styles by Friday.”_ in any channel. Wait ~90 seconds → a 📌 appears and the decision is logged. No commands, no forms.\n\n' +
        '*3️⃣ Try the graceful miss.* Ask the panel _“What did we decide about the onboarding redesign?”_ → the team never decided (see #design) — Precedent says so honestly and points to the closest discussion instead of inventing an answer.\n\n' +
        '*4️⃣ See the memory.* Open the *Home* tab for the live dashboard: active decisions, superseded history, open action items.',
    },
  },
  { type: 'divider' },
  {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '🔌 Bonus plumbing: the decision log is also exposed as an *MCP server* — external agents (e.g. Claude Desktop) can call `search_decisions` against the same live database. · Demo data lives in #eng-core, #proj-phoenix, #proj-atlas, #design.',
      },
    ],
  },
];

(async () => {
  let channel;
  try {
    channel = (await client.conversations.create({ name: 'start-here' })).channel;
  } catch (err) {
    if (err.data?.error !== 'name_taken') throw err;
    let cursor;
    do {
      const res = await client.conversations.list({ types: 'public_channel', limit: 200, cursor });
      channel = res.channels.find((c) => c.name === 'start-here');
      cursor = res.response_metadata?.next_cursor;
    } while (!channel && cursor);
  }
  await client.conversations.join({ channel: channel.id });
  try {
    await client.conversations.invite({ channel: channel.id, users: process.env.DEMO_NUDGE_USER_ID });
  } catch { /* already in */ }
  await client.chat.postMessage({
    channel: channel.id,
    text: 'Welcome — try Precedent in 4 steps',
    blocks: BLOCKS,
    unfurl_links: false,
  });
  console.log(`#start-here ready (${channel.id})`);
})().catch((e) => { console.error('failed:', e.data || e.message); process.exit(1); });

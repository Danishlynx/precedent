// Precedent entry point: Bolt (Socket Mode) + Express REST bridge in one process.
require('dotenv').config();

const REQUIRED_ENV = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'ANTHROPIC_API_KEY', 'MCP_API_TOKEN'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')} — copy .env.example to .env and fill it in.`);
  process.exit(1);
}
if (!process.env.DEMO_NUDGE_USER_ID) {
  console.warn('⚠ DEMO_NUDGE_USER_ID is not set — follow-up nudge DMs will be silently skipped (§10 demo moment).');
}

const { App, LogLevel } = require('@slack/bolt');
const express = require('express');
const store = require('./store');
const detector = require('./detector');
const assistantModule = require('./assistant');
const followups = require('./followups');
const home = require('./home');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// --- Smoke test / live diagnostic: @Precedent <query> runs RTS from a channel ---
app.event('app_mention', async ({ event, client, say, logger }) => {
  try {
    const query = (event.text || '').replace(/<@[^>]+>/g, '').trim() || 'decisions this week';
    // Slack delivers the ephemeral RTS token nested under assistant_thread
    // (observed live), not at the top level as documented — accept both.
    const actionToken = event.action_token || event.assistant_thread?.action_token;
    if (!actionToken) {
      logger.error('[smoke] no action_token on app_mention — raw event:', JSON.stringify(event));
      await say({ text: 'RTS unavailable: no action_token on this event (logged raw event).', thread_ts: event.ts });
      return;
    }
    const matches = await assistantModule.rtsSearch(client, query, actionToken);
    const top = matches
      .slice(0, 3)
      .map((m, i) => `${i + 1}. <${m.permalink}|#${m.channel_name || m.channel_id}>: ${(m.content || '').slice(0, 80)}`)
      .join('\n');
    await say({
      text: `🔎 RTS found *${matches.length}* match(es) for "${query}"${top ? `\n${top}` : ''}`,
      thread_ts: event.ts,
    });
  } catch (err) {
    logger.error('[smoke] RTS failed:', err.data?.error || err.message);
    try {
      await say({ text: `RTS error: \`${err.data?.error || err.message}\``, thread_ts: event.ts });
    } catch { /* never crash a handler */ }
  }
});

// No-op ack for url buttons — Slack still sends an interaction payload for them.
app.action('view_source_thread', async ({ ack }) => {
  await ack();
});

detector.register(app);
assistantModule.register(app);
followups.register(app);
home.register(app);

app.error(async (err) => {
  console.error('[bolt] unhandled error:', err);
});

// --- Express REST bridge (serves the local MCP server + dev triggers) ---
const api = express();
api.use(express.json());

api.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), ...store.stats() });
});

api.use('/api', (req, res, next) => {
  if (req.headers.authorization !== `Bearer ${process.env.MCP_API_TOKEN}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

api.get('/api/decisions/search', (req, res) => {
  try {
    res.json({ decisions: store.searchDecisions(req.query.q || '') });
  } catch (err) {
    console.error('[bridge] search failed:', err);
    res.status(500).json({ error: 'search_failed' });
  }
});

api.get('/api/decisions/:id', (req, res) => {
  try {
    const decision = store.getDecision(Number(req.params.id));
    if (!decision) return res.status(404).json({ error: 'not_found' });
    res.json({ decision });
  } catch (err) {
    console.error('[bridge] get failed:', err);
    res.status(500).json({ error: 'get_failed' });
  }
});

api.get('/api/action-items', (req, res) => {
  try {
    const items = store.openActionItems();
    res.json({ action_items: req.query.status === 'open' || !req.query.status ? items : [] });
  } catch (err) {
    console.error('[bridge] action-items failed:', err);
    res.status(500).json({ error: 'list_failed' });
  }
});

// Dev trigger: sweep every thread in a channel through the extractor (demo determinism).
api.post('/api/dev/scan', async (req, res) => {
  const channel = req.query.channel;
  if (!channel) return res.status(400).json({ error: 'channel query param required' });
  try {
    const history = await app.client.conversations.history({ channel, limit: 100 });
    const parents = new Set();
    for (const msg of history.messages || []) {
      // Seeded persona posts (chat:write.customize) carry subtype bot_message —
      // they are exactly what we want to scan. Skip only join/edit/etc. noise.
      if (msg.subtype && msg.subtype !== 'bot_message') continue;
      parents.add(msg.thread_ts || msg.ts);
    }
    // Oldest first — supersession links require the superseded decision to
    // already be in the store when the newer thread is extracted.
    const ordered = [...parents].sort((a, b) => parseFloat(a) - parseFloat(b));
    const results = [];
    for (const ts of ordered) {
      const r = await detector.processThread(app.client, channel, ts);
      results.push({ thread_ts: ts, ...r });
    }
    res.json({ channel, scanned: results.length, results });
  } catch (err) {
    console.error('[bridge] scan failed:', err.data?.error || err.message);
    res.status(500).json({ error: err.data?.error || err.message });
  }
});

// Dev trigger: fire the follow-up nudge DMs now.
api.post('/api/dev/nudge', async (_req, res) => {
  try {
    const result = await followups.runNudges(app.client);
    res.json(result);
  } catch (err) {
    console.error('[bridge] nudge failed:', err.data?.error || err.message);
    res.status(500).json({ error: err.data?.error || err.message });
  }
});

process.on('unhandledRejection', (err) => console.error('[process] unhandled rejection:', err));

(async () => {
  await app.start(); // Socket Mode — no port
  const port = process.env.PORT || 3000;
  api.listen(port, '0.0.0.0', () => {
    console.log(`⚡ Precedent running — Socket Mode connected, REST bridge on :${port}`);
  });
})();

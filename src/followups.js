// Follow-up engine: weekday-9am nudge DMs for open action items, plus the
// Done/Snooze button handlers. All nudges go to DEMO_NUDGE_USER_ID (seed
// personas aren't real users).
const cron = require('node-cron');
const store = require('./store');
const { nudgeBlocks, nudgeResolvedBlocks } = require('./blocks');

// force: bypass the once-per-day gate (dev trigger for demo retakes).
async function runNudges(client, force = false) {
  // Trim + unquote: env vars pasted into dashboards often pick up invisible
  // whitespace or quotes, and conversations.open fails with user_not_found.
  const targetUser = (process.env.DEMO_NUDGE_USER_ID || '').trim().replace(/^["']+|["']+$/g, '');
  if (!targetUser) {
    console.error('[followups] DEMO_NUDGE_USER_ID not set — skipping nudges');
    return { sent: 0 };
  }
  const items = force ? store.openActionItems() : store.nudgeableActionItems();
  if (!items.length) {
    console.log('[followups] nothing to nudge');
    return { sent: 0 };
  }

  let dm;
  try {
    dm = await client.conversations.open({ users: targetUser });
  } catch (err) {
    console.error(`[followups] conversations.open failed for ${JSON.stringify(targetUser)}:`, err.data?.error || err.message);
    throw err;
  }
  let sent = 0;
  for (const item of items) {
    try {
      await client.chat.postMessage({
        channel: dm.channel.id,
        text: `Follow-up: ${item.description} (${item.owner_name || 'unassigned'})`,
        blocks: nudgeBlocks(item),
      });
      store.markNudged(item.id);
      sent++;
    } catch (err) {
      console.error('[followups] nudge failed for item', item.id, err.data?.error || err.message);
    }
  }
  console.log(`[followups] sent ${sent} nudge(s)`);
  return { sent };
}

function register(app) {
  cron.schedule('0 9 * * 1-5', () => {
    runNudges(app.client).catch((err) => console.error('[followups] cron run failed:', err));
  }, { timezone: 'America/Los_Angeles' });

  app.action('nudge_done', async ({ ack, body, action, client }) => {
    await ack();
    try {
      const id = Number(action.value);
      store.markActionItemDone(id);
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: 'Action item marked done ✅',
        blocks: nudgeResolvedBlocks(lookupItem(id), 'done'),
      });
    } catch (err) {
      console.error('[followups] nudge_done failed:', err.data?.error || err.message);
    }
  });

  app.action('nudge_snooze', async ({ ack, body, action, client }) => {
    await ack();
    try {
      const id = Number(action.value);
      store.markNudged(id); // skipped until tomorrow's run
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: 'Snoozed until tomorrow 💤',
        blocks: nudgeResolvedBlocks(lookupItem(id), 'snoozed'),
      });
    } catch (err) {
      console.error('[followups] nudge_snooze failed:', err.data?.error || err.message);
    }
  });
}

function lookupItem(id) {
  const row = store.db
    .prepare(`
      SELECT ai.*, d.title AS decision_title, d.permalink AS decision_permalink
      FROM action_items ai JOIN decisions d ON d.id = ai.decision_id
      WHERE ai.id = ?
    `)
    .get(id);
  return row || { description: 'Action item', decision_title: 'unknown decision' };
}

module.exports = { register, runNudges };

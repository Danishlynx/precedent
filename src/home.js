// App Home dashboard: stats, recent decisions, open action items.
const store = require('./store');

function buildHomeBlocks() {
  const stats = store.stats();
  const recent = store.recentDecisions(5);
  const openItems = store.openActionItems();

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '📌 Precedent — Decision Memory' } },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*${stats.active}* active decisions · *${stats.superseded}* superseded · *${stats.open_action_items}* open action items`,
        },
      ],
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*Recent decisions*' } },
  ];

  if (!recent.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_No decisions logged yet. I pin 📌 a thread when I log one._' } });
  }
  for (const d of recent) {
    const status = d.status === 'superseded' ? '⚠️ superseded' : '✅ active';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${d.title}*\n${status} · ${d.decider || 'unknown'} · ${(d.decided_at || '').slice(0, 10)}${d.permalink ? ` · <${d.permalink}|View thread ↗>` : ''}`,
      },
    });
  }

  blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: '*Open action items*' } });
  if (!openItems.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_All clear ✨_' } });
  }
  for (const ai of openItems.slice(0, 10)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `• *${ai.owner_name || 'unassigned'}*: ${ai.description}${ai.due_date ? ` _(due ${ai.due_date})_` : ''} — from _${ai.decision_title}_`,
      },
    });
  }

  return blocks;
}

function register(app) {
  app.event('app_home_opened', async ({ event, client, logger }) => {
    if (event.tab !== 'home') return;
    try {
      await client.views.publish({
        user_id: event.user,
        view: { type: 'home', blocks: buildHomeBlocks() },
      });
    } catch (err) {
      logger.error('[home] views.publish failed:', err.data?.error || err.message);
    }
  });
}

module.exports = { register };

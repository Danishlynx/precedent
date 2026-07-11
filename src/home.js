// App Home dashboard: stats, decisions grouped by status, open action items.
const store = require('./store');

function buildHomeBlocks() {
  const stats = store.stats();
  const recent = store.recentDecisions(10);
  const active = recent.filter((d) => d.status === 'active').slice(0, 5);
  const superseded = recent.filter((d) => d.status === 'superseded').slice(0, 3);
  const openItems = store.openActionItems();

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '📌 Precedent' } },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Your team's decision memory · *${stats.active}* active · *${stats.superseded}* superseded · *${stats.open_action_items}* open action items`,
        },
      ],
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*✅ Active decisions*' } },
  ];

  if (!active.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: "_Nothing logged yet. I watch your channels and pin 📌 a thread when a decision is made — no commands needed._" },
    });
  }
  for (const d of active) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${d.title}*\n${d.decider || 'unknown'} · ${(d.decided_at || '').slice(0, 10)}${d.supersedes?.length ? ` · replaced _${d.supersedes[0].title}_` : ''}${d.permalink ? `  ·  <${d.permalink}|source ↗>` : ''}`,
      },
    });
  }

  if (superseded.length) {
    blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: '*⚠️ Superseded (history preserved)*' } });
    for (const d of superseded) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `~${d.title}~ → _${d.superseded_by_title || 'replaced'}_${d.permalink ? `  ·  <${d.permalink}|source ↗>` : ''}`,
          },
        ],
      });
    }
  }

  blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: '*☑️ Open action items*' } });
  if (!openItems.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_All clear ✨_' } });
  }
  for (const ai of openItems.slice(0, 10)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `• *${ai.owner_name || 'unassigned'}* — ${ai.description}${ai.due_date ? `  _(due ${ai.due_date})_` : ''}`,
      },
    });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `from 📌 _${ai.decision_title}_` }],
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '💬 Ask me anything in my *Chat* tab · mention *@Precedent* in any channel · 📌 on a thread = decision logged',
        },
      ],
    }
  );

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

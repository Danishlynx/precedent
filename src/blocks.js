// Block Kit builders. Note: url buttons still send interaction payloads that
// must be ack()'d — app.js registers a no-op handler for 'view_source_thread'.

function decisionCard(answerText, decision, fallbackLink) {
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: answerText } },
  ];

  if (decision) {
    const status = decision.status === 'superseded' ? '⚠️ Superseded' : '✅ Active';
    const lines = [
      `📌 *${decision.title}*`,
      `${status} · decided by *${decision.decider || 'unknown'}* · ${(decision.decided_at || '').slice(0, 10)}`,
    ];
    if (decision.supersedes?.length) {
      lines.push(`↩️ Replaced: ${decision.supersedes.map((s) => `_${s.title}_`).join(' · ')}`);
    }
    if (decision.status === 'superseded' && decision.superseded_by_title) {
      lines.push(`➡️ Now superseded by: _${decision.superseded_by_title}_`);
    }
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: lines.join('\n') }],
    });
  }

  const link = decision?.permalink || fallbackLink?.url;
  if (link) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: fallbackLink && !decision?.permalink ? fallbackLink.label : 'View source thread ↗' },
          url: link,
          action_id: 'view_source_thread',
          style: 'primary',
        },
      ],
    });
  }

  return blocks;
}

// Compact in-thread confirmation posted when a NEW decision is captured live.
function loggedCard(decision) {
  return [
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📌 Logged as a decision: *${decision.title}* — decided by ${decision.decider || 'the team'}. I'll remember this; ask me _"what did we decide about…?"_ anytime.`,
        },
      ],
    },
  ];
}

function nudgeBlocks(item) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `👋 *Open action item*\n*${item.description}*`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Owner: *${item.owner_name || 'unassigned'}*${item.due_date ? ` · Due: *${item.due_date}*` : ''} · from 📌 _${item.decision_title}_${item.decision_permalink ? `  ·  <${item.decision_permalink}|source thread ↗>` : ''}`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Mark done ✅' },
          style: 'primary',
          action_id: 'nudge_done',
          value: String(item.id),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze 💤' },
          action_id: 'nudge_snooze',
          value: String(item.id),
        },
      ],
    },
  ];
}

function nudgeResolvedBlocks(item, resolution) {
  const line =
    resolution === 'done'
      ? `~${item.description}~ — ✅ *Done*`
      : `${item.description} — 💤 snoozed until tomorrow`;
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${line}\nfrom decision 📌 _${item.decision_title}_`,
      },
    },
  ];
}

module.exports = { decisionCard, loggedCard, nudgeBlocks, nudgeResolvedBlocks };

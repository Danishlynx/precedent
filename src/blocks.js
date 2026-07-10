// Block Kit builders. Note: url buttons still send interaction payloads that
// must be ack()'d — app.js registers a no-op handler for 'view_source_thread'.

function decisionCard(answerText, decision, fallbackLink) {
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: answerText } },
  ];

  if (decision) {
    const status = decision.status === 'superseded' ? '⚠️ superseded' : '✅ active';
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📌 *${decision.title}* · ${status} · decided by ${decision.decider || 'unknown'} · ${(decision.decided_at || '').slice(0, 10)}`,
        },
      ],
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
        },
      ],
    });
  }

  return blocks;
}

function nudgeBlocks(item) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `👋 *Follow-up on an action item*\n*${item.description}*${item.due_date ? `\nDue: ${item.due_date}` : ''}\nOwner: ${item.owner_name || 'unassigned'} · from decision *${item.decision_title}*${item.decision_permalink ? ` (<${item.decision_permalink}|source thread ↗>)` : ''}`,
      },
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
        text: `${line}\nfrom decision *${item.decision_title}*`,
      },
    },
  ];
}

module.exports = { decisionCard, nudgeBlocks, nudgeResolvedBlocks };

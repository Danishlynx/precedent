// Answer synthesis: question + stored decisions + live RTS matches -> short mrkdwn answer.
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You are Precedent, a decision-memory assistant for a Slack team. Answer the user's question using ONLY the decision records and search results provided. Never invent decisions, people, dates, or links.

Rules:
- 120 words maximum. Slack mrkdwn only: *bold*, _italic_, <URL|link text>. No headers, no markdown links.
- Lead with the answer (what was decided, by whom, when).
- If a decision was SUPERSEDED, state the CURRENT decision first, then note the history ("originally X, superseded by Y").
- Mention open action items when relevant to the question.
- If no stored decision answers the question, say plainly that no recorded decision covers it — then point to the most relevant search result as "the closest related discussion", if one exists.
- Plain text response, no JSON.`;

/**
 * @param {string} question
 * @param {object[]} decisions - hydrated store records
 * @param {object[]} rtsMatches - assistant.search.context results.messages
 * @param {object[]} openItems - open action items (owner, description, due_date, decision_title)
 * @param {boolean} rtsFailed - true when live search was unavailable (answer must say so)
 */
async function synthesizeAnswer(question, decisions, rtsMatches, openItems, rtsFailed) {
  const decisionsBlock = decisions.length
    ? decisions
        .map((d) => {
          const items = (d.action_items || [])
            .map((ai) => `    - [${ai.status}] ${ai.owner_name || '?'}: ${ai.description}${ai.due_date ? ` (due ${ai.due_date})` : ''}`)
            .join('\n');
          return `- id ${d.id} [${d.status.toUpperCase()}] "${d.title}" — decided by ${d.decider || 'unknown'} on ${(d.decided_at || '').slice(0, 10)}
  ${d.decision_text}
  ${d.status === 'superseded' && d.superseded_by_title ? `superseded by: "${d.superseded_by_title}"` : ''}${d.supersedes?.length ? `supersedes: ${d.supersedes.map((s) => `"${s.title}"`).join(', ')}` : ''}
  permalink: ${d.permalink || 'none'}${items ? `\n  action items:\n${items}` : ''}`;
        })
        .join('\n')
    : '(none found)';

  const rtsBlock = rtsFailed
    ? '(live workspace search was unavailable for this question — say the answer is from the decision log only)'
    : rtsMatches.length
      ? rtsMatches
          .slice(0, 6)
          .map((m) => `- #${m.channel_name || m.channel_id}: "${(m.content || '').slice(0, 300)}" — ${m.permalink}`)
          .join('\n')
      : '(no matches)';

  const itemsBlock = openItems.length
    ? openItems.map((ai) => `- ${ai.owner_name || '?'}: ${ai.description}${ai.due_date ? ` (due ${ai.due_date})` : ''} — from "${ai.decision_title}"`).join('\n')
    : '(none)';

  const user = `QUESTION: ${question}

STORED DECISION RECORDS:
${decisionsBlock}

OPEN ACTION ITEMS (all):
${itemsBlock}

LIVE WORKSPACE SEARCH RESULTS:
${rtsBlock}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  });
  const block = response.content.find((b) => b.type === 'text');
  return block ? block.text.trim() : 'I could not generate an answer.';
}

module.exports = { synthesizeAnswer };

// Decision extraction: Slack thread transcript -> structured JSON via Claude.
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You extract team decisions from Slack threads. Respond with ONLY a JSON object, no prose, no markdown fences.

A decision is a clear, committed choice ("we're going with X", "decided: ...", "switching to Y"). The following are NOT decisions:
- open-ended discussion, brainstorming, or weighing options without a commitment
- deferrals ("let's revisit later", "let's get more data first")
- status updates, reminders, logistics chatter

JSON shape:
{
  "is_decision": boolean,
  "confidence": number,          // 0-1, how clearly a decision was committed
  "title": string,               // short headline, e.g. "Use Postmark for transactional email"
  "decision_text": string,       // 1-2 sentences: what was decided and key rationale
  "decider": string,             // display name of the person who made/confirmed the call
  "topics": [string],            // 2-5 lowercase keywords, e.g. ["email", "postmark", "phoenix"]
  "action_items": [ { "owner_name": string, "description": string, "due_date": string|null } ],
  "supersedes_id": number|null   // id from EXISTING DECISIONS that this decision replaces, else null
}

Set "supersedes_id" ONLY when the new decision clearly reverses or replaces one of the listed existing decisions on the same subject. If is_decision is false, still return the full shape with empty/null fields.`;

function stripFences(text) {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

/**
 * @param {string} transcript - "Author: message" lines
 * @param {string} channelName
 * @param {string[]} existingDecisions - "id: title [topics]" lines
 * @returns extraction object; { is_decision: false } on any failure (never throws)
 */
async function extractDecision(transcript, channelName, existingDecisions) {
  const user = `EXISTING DECISIONS (active):
${existingDecisions.length ? existingDecisions.join('\n') : '(none)'}

THREAD from #${channelName}:
${transcript}`;

  let raw = '';
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    });
    const block = response.content.find((b) => b.type === 'text');
    raw = block ? block.text : '';
    const parsed = JSON.parse(stripFences(raw));
    if (typeof parsed.is_decision !== 'boolean') throw new Error('missing is_decision');
    return parsed;
  } catch (err) {
    console.error('[extract] failed:', err.message, raw ? `raw output: ${raw.slice(0, 500)}` : '');
    return { is_decision: false };
  }
}

module.exports = { extractDecision };

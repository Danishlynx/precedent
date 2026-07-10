// Assistant panel: greeting + suggested prompts, and the core Q&A-with-receipts flow.
const { Assistant } = require('@slack/bolt');
const store = require('./store');
const { synthesizeAnswer } = require('./answer');
const { decisionCard } = require('./blocks');

const GREETING =
  "Hi, I'm *Precedent* 📌 — your team's decision memory.\n" +
  'I watch your channels for decisions, log them with links to the source thread, and answer questions like _"what did we decide about X?"_ with receipts.';

const SUGGESTED_PROMPTS = [
  { title: 'Which email vendor did we pick?', message: 'Which email vendor did we pick for Phoenix?' },
  { title: 'What did we decide about rate limiting?', message: 'What did we decide about API rate limiting?' },
  { title: 'What action items are still open?', message: 'What action items are still open, and who owns them?' },
  { title: 'What about the onboarding redesign?', message: 'What did we decide about the onboarding redesign?' },
];

// Live workspace search (Real-Time Search API). Bot tokens require the ephemeral
// action_token from the triggering event — use it here and never store it.
async function rtsSearch(client, query, actionToken) {
  const res = await client.assistant.search.context({
    query,
    action_token: actionToken,
    content_types: ['messages'],
    channel_types: ['public_channel'],
    include_bots: true, // seeded demo data is bot-authored — without this, search returns nothing
    include_context_messages: true,
    limit: 15,
  });
  return res.results?.messages || [];
}

const assistant = new Assistant({
  threadStarted: async ({ say, setSuggestedPrompts, logger }) => {
    try {
      await say(GREETING);
      await setSuggestedPrompts({
        title: 'Try asking:',
        prompts: SUGGESTED_PROMPTS,
      });
    } catch (err) {
      logger.error('[assistant] threadStarted failed:', err);
    }
  },

  userMessage: async ({ client, message, say, setStatus, setTitle, logger }) => {
    const question = (message.text || '').trim();
    if (!question) return;

    try {
      await setTitle(question.slice(0, 60));
      await setStatus("Searching your team's decisions…");

      // 1. Structured decision log
      const decisions = store.searchDecisions(question);
      const openItems = store.openActionItems();

      // 2. Live retrieval via RTS — degrade gracefully to store-only if unavailable
      let rtsMatches = [];
      let rtsFailed = false;
      const actionToken = message.action_token;
      if (!actionToken) {
        rtsFailed = true;
        logger.error('[assistant] no action_token on event — raw message:', JSON.stringify(message));
      } else {
        try {
          rtsMatches = await rtsSearch(client, question, actionToken);
        } catch (err) {
          rtsFailed = true;
          logger.error('[assistant] RTS failed:', err.data?.error || err.message);
        }
      }

      // 3. Synthesize the answer with receipts
      const answerText = await synthesizeAnswer(question, decisions, rtsMatches, openItems, rtsFailed);

      // Primary receipt: best active decision, else best decision, else closest RTS thread.
      const primary = decisions.find((d) => d.status === 'active' && d.permalink) || decisions.find((d) => d.permalink);
      const closest = !primary && rtsMatches.find((m) => m.permalink);
      const blocks = decisionCard(
        answerText,
        primary || null,
        closest ? { url: closest.permalink, label: 'View closest thread ↗' } : null
      );

      await say({ text: answerText, blocks });
    } catch (err) {
      logger.error('[assistant] userMessage failed:', err);
      try {
        await say('Sorry — something went wrong while searching. Please try again.');
      } catch (sayErr) {
        logger.error('[assistant] failed to send error message:', sayErr);
      }
    }
  },
});

function register(app) {
  app.assistant(assistant);
}

module.exports = { register };

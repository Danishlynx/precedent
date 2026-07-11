// Assistant panel: greeting + suggested prompts, and the core Q&A-with-receipts flow.
const { Assistant } = require('@slack/bolt');
const store = require('./store');
const { synthesizeAnswer } = require('./answer');
const { decisionCard } = require('./blocks');
const { searchContext } = require('./rts');

const GREETING =
  "👋 I'm *Precedent* — I remember what your team decided, so you don't have to.\n" +
  'I quietly watch your channels: when a decision happens, I pin it 📌, log who decided what (and what replaced it), and track the action items. ' +
  'Ask me anything — every answer comes with a *link to the source thread*, so you never have to take my word for it.';

const SUGGESTED_PROMPTS = [
  { title: 'Which email vendor did we pick?', message: 'Which email vendor did we pick for Phoenix?' },
  { title: 'What did we decide about rate limiting?', message: 'What did we decide about API rate limiting?' },
  { title: 'What action items are still open?', message: 'What action items are still open, and who owns them?' },
  { title: 'What about the onboarding redesign?', message: 'What did we decide about the onboarding redesign?' },
];

const KEYWORD_STOPWORDS = new Set([
  'the', 'and', 'for', 'was', 'were', 'did', 'does', 'what', 'when', 'who', 'which',
  'about', 'decide', 'decided', 'our', 'are', 'you', 'have', 'has', 'that', 'this',
  'with', 'why', 'how', 'still', 'made', 'make', 'pick', 'picked', 'use', 'using',
]);

function keywordQuery(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !KEYWORD_STOPWORDS.has(w))
    .slice(0, 6)
    .join(' ');
}

// Live workspace search (Real-Time Search API). Bot tokens require the ephemeral
// action_token from the triggering event — use it here and never store it.
// Semantic search can whiff on phrasing (observed live), so thin results trigger
// a second keyword-only pass with semantics disabled.
async function rtsSearch(client, query, actionToken) {
  const base = {
    action_token: actionToken,
    content_types: ['messages'],
    channel_types: ['public_channel'],
    include_bots: true, // seeded demo data is bot-authored — without this, search returns nothing
    include_context_messages: true,
    limit: 15,
  };
  const res = await searchContext(client, { query, ...base });
  let matches = res.results?.messages || [];
  if (matches.length < 5) {
    const kw = keywordQuery(query);
    if (kw) {
      try {
        const res2 = await searchContext(client, { query: kw, disable_semantic_search: true, ...base });
        const seen = new Set(matches.map((m) => `${m.channel_id}:${m.message_ts}`));
        for (const m of res2.results?.messages || []) {
          if (!seen.has(`${m.channel_id}:${m.message_ts}`)) matches.push(m);
        }
      } catch (err) {
        console.error('[assistant] keyword-fallback RTS failed:', err.data?.error || err.message);
      }
    }
  }
  return filterSelfNoise(client, matches);
}

// Questions asked TO the bot and the bot's own answers match their own keywords
// and pollute later searches — drop them. Seeded persona posts are kept (they
// are bot-authored but never mention the bot or start with our answer marker).
let botUserId = null;
async function filterSelfNoise(client, matches) {
  if (!botUserId) {
    try {
      botUserId = (await client.auth.test()).user_id;
    } catch {
      return matches;
    }
  }
  return matches.filter((m) => {
    const text = m.content || '';
    return !text.includes(`<@${botUserId}>`) && !text.startsWith('🔎');
  });
}

// Full Q&A flow shared by the assistant panel and in-channel @mentions:
// store search + live RTS (degrading gracefully) -> synthesized answer + card.
async function answerQuestion(client, question, actionToken) {
  const decisions = store.searchDecisions(question);
  const openItems = store.openActionItems();

  let rtsMatches = [];
  let rtsFailed = false;
  if (!actionToken) {
    rtsFailed = true;
  } else {
    try {
      rtsMatches = await rtsSearch(client, question, actionToken);
    } catch (err) {
      rtsFailed = true;
      console.error('[assistant] RTS failed:', err.data?.error || err.message);
    }
  }

  const answerText = await synthesizeAnswer(question, decisions, rtsMatches, openItems, rtsFailed);

  // Primary receipt: best active decision, else best decision, else closest RTS thread.
  const primary = decisions.find((d) => d.status === 'active' && d.permalink) || decisions.find((d) => d.permalink);
  const closest = !primary && rtsMatches.find((m) => m.permalink);
  const blocks = decisionCard(
    answerText,
    primary || null,
    closest ? { url: closest.permalink, label: 'View closest thread ↗' } : null
  );
  return { text: answerText, blocks };
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

      // Token arrives nested under assistant_thread (observed live on app_mention;
      // same defensive lookup here) — accept both shapes, use immediately, never store.
      const actionToken = message.action_token || message.assistant_thread?.action_token;
      if (!actionToken) {
        logger.error('[assistant] no action_token on event — raw message:', JSON.stringify(message));
      }

      const { text, blocks } = await answerQuestion(client, question, actionToken);
      await say({ text, blocks });
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

module.exports = { register, rtsSearch, answerQuestion };

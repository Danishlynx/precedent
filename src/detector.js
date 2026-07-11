// Watches public channels; after a thread goes quiet for 90s, runs it through
// the extractor and stores any decision (with a visible 📌 on the thread).
const store = require('./store');
const { extractDecision } = require('./extract');
const { loggedCard } = require('./blocks');

const DEBOUNCE_MS = 90 * 1000;
const timers = new Map(); // "channel:thread_ts" -> timeout

const userNameCache = new Map();
async function authorName(client, msg) {
  if (msg.username) return msg.username; // chat:write.customize persona
  if (!msg.user) return 'unknown';
  if (userNameCache.has(msg.user)) return userNameCache.get(msg.user);
  try {
    const res = await client.users.info({ user: msg.user });
    const name = res.user.profile.display_name || res.user.real_name || res.user.name;
    userNameCache.set(msg.user, name);
    return name;
  } catch {
    return msg.user;
  }
}

const channelNameCache = new Map();
async function channelName(client, channelId) {
  if (channelNameCache.has(channelId)) return channelNameCache.get(channelId);
  try {
    const res = await client.conversations.info({ channel: channelId });
    channelNameCache.set(channelId, res.channel.name);
    return res.channel.name;
  } catch {
    return channelId;
  }
}

// Cap what we send to the extractor: keep the head (context) and tail (where
// decisions usually land) of oversized threads instead of failing or ballooning cost.
const MAX_MSG_CHARS = 2000;
const MAX_TRANSCRIPT_CHARS = 15000;
function buildTranscript(lines) {
  const clipped = lines.map((l) => (l.length > MAX_MSG_CHARS ? `${l.slice(0, MAX_MSG_CHARS)} …[truncated]` : l));
  let total = clipped.reduce((n, l) => n + l.length + 1, 0);
  if (total <= MAX_TRANSCRIPT_CHARS) return clipped.join('\n');
  const head = clipped.slice(0, 3);
  const tail = [];
  let budget = MAX_TRANSCRIPT_CHARS - head.reduce((n, l) => n + l.length + 1, 0) - 40;
  for (let i = clipped.length - 1; i >= 3 && budget > 0; i--) {
    budget -= clipped[i].length + 1;
    if (budget > 0) tail.unshift(clipped[i]);
  }
  return [...head, '…[thread truncated]…', ...tail].join('\n');
}

async function processThread(client, channel, threadTs) {
  const replies = await client.conversations.replies({ channel, ts: threadTs, limit: 50 });
  const messages = replies.messages || [];
  if (!messages.length) return { processed: false, reason: 'empty thread' };

  const lines = [];
  for (const msg of messages) {
    if (!msg.text) continue;
    lines.push(`${await authorName(client, msg)}: ${msg.text}`);
  }
  const transcript = buildTranscript(lines);
  const chName = await channelName(client, channel);

  const extraction = await extractDecision(transcript, chName, store.listActiveForPrompt());
  if (!extraction.is_decision || (extraction.confidence || 0) < 0.7) {
    console.log(`[detector] #${chName} ${threadTs}: no decision (confidence ${extraction.confidence ?? 'n/a'})`);
    return { processed: true, is_decision: false };
  }

  let permalink = null;
  try {
    const res = await client.chat.getPermalink({ channel, message_ts: threadTs });
    permalink = res.permalink;
  } catch (err) {
    console.error('[detector] getPermalink failed:', err.data?.error || err.message);
  }

  const { id, isNew } = store.upsertDecision(
    {
      title: extraction.title,
      decision_text: extraction.decision_text,
      decider: extraction.decider,
      decided_at: new Date(parseFloat(threadTs) * 1000).toISOString(),
      channel_id: channel,
      thread_ts: threadTs,
      permalink,
      topics: extraction.topics,
    },
    extraction.action_items
  );

  if (extraction.supersedes_id && store.getDecision(extraction.supersedes_id)) {
    if (store.supersede(extraction.supersedes_id, id)) {
      console.log(`[detector] decision ${id} supersedes ${extraction.supersedes_id}`);
    }
  }

  try {
    await client.reactions.add({ channel, timestamp: threadTs, name: 'pushpin' });
  } catch (err) {
    if (err.data?.error !== 'already_reacted') {
      console.error('[detector] reactions.add failed:', err.data?.error || err.message);
    }
  }

  // Visible capture moment — only on first log, never again on re-extraction.
  if (isNew) {
    try {
      const d = store.getDecision(id);
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `📌 Logged as a decision: ${extraction.title}`,
        blocks: loggedCard(d),
      });
    } catch (err) {
      console.error('[detector] logged-card post failed:', err.data?.error || err.message);
    }
  }

  console.log(`[detector] #${chName} ${threadTs}: logged decision ${id} "${extraction.title}" (${isNew ? 'new' : 'updated'})`);
  return { processed: true, is_decision: true, decision_id: id };
}

function register(app) {
  app.message(async ({ message, client }) => {
    try {
      if (message.subtype) return; // subtype guard — plain user/bot posts only
      if (message.channel_type !== 'channel') return; // public channels; DMs belong to the assistant
      const threadTs = message.thread_ts || message.ts;
      const key = `${message.channel}:${threadTs}`;
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          processThread(client, message.channel, threadTs).catch((err) =>
            console.error('[detector] processThread error:', err)
          );
        }, DEBOUNCE_MS)
      );
    } catch (err) {
      console.error('[detector] listener error:', err);
    }
  });
}

module.exports = { register, processThread };

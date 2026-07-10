// Seeds the sandbox with demo conversations via chat:write.customize personas.
// Rate limit is ~1 msg/sec/channel — the 1200ms sleep is load-bearing, never lower it.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { WebClient } = require('@slack/web-api');

if (!process.env.SLACK_BOT_TOKEN) {
  console.error('Missing SLACK_BOT_TOKEN in .env');
  process.exit(1);
}

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findChannelByName(name) {
  let cursor;
  do {
    const res = await client.conversations.list({
      types: 'public_channel',
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    const hit = res.channels.find((c) => c.name === name);
    if (hit) return hit;
    cursor = res.response_metadata && res.response_metadata.next_cursor;
  } while (cursor);
  return null;
}

async function ensureChannel(name) {
  let channel;
  try {
    const res = await client.conversations.create({ name });
    channel = res.channel;
    console.log(`Created #${name} (${channel.id})`);
  } catch (err) {
    if (err.data && err.data.error === 'name_taken') {
      channel = await findChannelByName(name);
      if (!channel) throw new Error(`#${name} is name_taken but not found in conversations.list`);
      console.log(`Found existing #${name} (${channel.id})`);
    } else {
      throw err;
    }
  }
  // Must be a member to receive message.channels events for this channel.
  await client.conversations.join({ channel: channel.id });
  return channel;
}

async function postAs(personaKey, channelId, text, threadTs) {
  const persona = data.personas[personaKey];
  if (!persona) throw new Error(`Unknown persona "${personaKey}" in seed-data.json`);
  const res = await client.chat.postMessage({
    channel: channelId,
    text,
    username: persona.username,
    icon_emoji: persona.icon_emoji,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
  await sleep(1200); // ~1 msg/sec/channel rate limit
  return res;
}

async function main() {
  const seeded = [];
  for (const ch of data.channels) {
    const channel = await ensureChannel(ch.name);
    for (const thread of ch.threads) {
      const [first, ...rest] = thread.messages;
      const parent = await postAs(first.persona, channel.id, first.text);
      for (const msg of rest) {
        await postAs(msg.persona, channel.id, msg.text, parent.ts);
      }
      console.log(`  seeded thread ${parent.ts} in #${ch.name} (${thread.messages.length} messages)`);
    }
    seeded.push(channel);
  }

  console.log('\nDone. Channel IDs:');
  for (const c of seeded) console.log(`  #${c.name}  ${c.id}`);
  console.log('\nNext: start the app (npm start), then sweep each channel through the extractor:');
  for (const c of seeded) {
    console.log(`  curl -X POST "http://localhost:3000/api/dev/scan?channel=${c.id}" -H "Authorization: Bearer $MCP_API_TOKEN"`);
  }
  console.log('\nNote: re-running this script re-posts all messages (duplicates).');
}

main().catch((err) => {
  console.error('Seed failed:', err.data || err);
  process.exit(1);
});

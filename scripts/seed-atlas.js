// Test-scenario seeder: populates #proj-atlas with fresh conversations for the
// live end-to-end test (decision + tabled debate + filler). Same rules as seed.js.
require('dotenv').config({ quiet: true });
const { WebClient } = require('@slack/web-api');

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PERSONAS = {
  maya: { username: 'Maya Chen', icon_emoji: ':female-technologist:' },
  dev: { username: 'Dev Patel', icon_emoji: ':male-technologist:' },
  priya: { username: 'Priya Nair', icon_emoji: ':female-scientist:' },
  sofia: { username: 'Sofia Reyes', icon_emoji: ':female-office-worker:' },
  jonas: { username: 'Jonas Weber', icon_emoji: ':male-office-worker:' },
};

const THREADS = [
  [
    ['maya', "Atlas infra — we keep hand-editing things in the AWS console and it's starting to bite. Time to pick: Terraform, Pulumi, or keep the bash scripts?"],
    ['dev', 'Terraform. Mature providers, half the team has written HCL before, and the module registry saves us weeks.'],
    ['priya', '+1 Terraform. State locking is a solved problem with S3 + DynamoDB.'],
    ['maya', 'Decision: Atlas infrastructure will be managed with Terraform. Dev sets up the repo and CI plan pipeline by next Thursday, Priya writes the module conventions doc.'],
  ],
  [
    ['jonas', 'Should Atlas support on-prem deployments? The big enterprise prospect asked about it again.'],
    ['sofia', "That's a product strategy call and needs pricing input — let's take it to the leadership sync rather than decide here."],
    ['jonas', 'Agreed, tabling it until then.'],
  ],
  [
    ['sofia', 'Atlas standup is 30 minutes later tomorrow only — dentist 🦷'],
  ],
];

async function main() {
  let channel;
  try {
    channel = (await client.conversations.create({ name: 'proj-atlas' })).channel;
    console.log(`created #proj-atlas (${channel.id})`);
  } catch (err) {
    if (err.data?.error !== 'name_taken') throw err;
    let cursor;
    do {
      const res = await client.conversations.list({ types: 'public_channel', limit: 200, cursor });
      channel = res.channels.find((c) => c.name === 'proj-atlas');
      cursor = res.response_metadata?.next_cursor;
    } while (!channel && cursor);
    console.log(`found existing #proj-atlas (${channel.id})`);
  }
  await client.conversations.join({ channel: channel.id });
  try {
    await client.conversations.invite({ channel: channel.id, users: process.env.DEMO_NUDGE_USER_ID });
    console.log('invited you to #proj-atlas');
  } catch (err) {
    if (err.data?.error !== 'already_in_channel') console.log('invite:', err.data?.error);
  }

  for (const thread of THREADS) {
    let parentTs;
    for (const [who, text] of thread) {
      const p = PERSONAS[who];
      const res = await client.chat.postMessage({
        channel: channel.id,
        text,
        username: p.username,
        icon_emoji: p.icon_emoji,
        ...(parentTs ? { thread_ts: parentTs } : {}),
      });
      parentTs = parentTs || res.ts;
      await sleep(1200);
    }
    console.log(`posted thread (${thread.length} messages), parent ${parentTs}`);
  }
  console.log(`\nCHANNEL_ID=${channel.id}`);
}

main().catch((e) => { console.error('failed:', e.data || e.message); process.exit(1); });

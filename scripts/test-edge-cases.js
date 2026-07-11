// Edge-case harness (dev tool, not part of the app). Exercises the REAL
// extractor / store / answer code against hostile inputs. Uses a temp DB.
// Run: node scripts/test-edge-cases.js   (makes ~8 small Anthropic calls)
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `precedent-edge-${process.pid}.db`);
require('dotenv').config({ quiet: true });

const store = require('../src/store');
const { extractDecision } = require('../src/extract');
const { synthesizeAnswer } = require('../src/answer');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function extractorCases() {
  console.log('\n=== EXTRACTOR: classification under weird inputs ===');

  const cases = [
    {
      name: 'too short / no content ("ok")',
      transcript: 'Maya Chen: ok',
      expect: false,
    },
    {
      name: 'deferral is not a decision',
      transcript: [
        'Priya Nair: Should we adopt the new design tokens now or wait for v2?',
        "Maya Chen: Let's wait until the v2 audit lands and revisit.",
        'Priya Nair: agreed, parking this.',
      ].join('\n'),
      expect: false,
    },
    {
      name: 'argument with no resolution',
      transcript: [
        'Dev Patel: We should rewrite the worker in Go, Node keeps OOMing.',
        "Jonas Weber: Strong disagree, the team doesn't know Go and the OOM is a leak we can fix.",
        'Dev Patel: The leak IS the runtime. This is the third time.',
        'Jonas Weber: And a rewrite is three months. Not convinced.',
      ].join('\n'),
      expect: false,
    },
    {
      name: 'one-liner decision (short but real)',
      transcript: "Sofia Reyes: Decision: standup moves to 9:30 daily starting Monday. I'll update the calendar invite by Friday.",
      expect: true,
    },
    {
      name: 'decision buried in a long noisy multi-person thread',
      transcript: [
        ...Array.from({ length: 12 }, (_, i) => `Person${(i % 8) + 1}: ${['morning all', 'did anyone see the game', 'coffee machine is broken again', 'lol', '+1', 'can someone review my PR?', 'the build is red', 'fixed it'][i % 8]}`),
        'Maya Chen: back on topic — after the load test results, we are going with the queue-based ingestion pipeline instead of direct writes. Dev owns the migration, due end of month.',
        ...Array.from({ length: 8 }, (_, i) => `Person${(i % 5) + 1}: ${['nice', 'sounds good', '🎉', 'ship it', 'ok'][i % 5]}`),
      ].join('\n'),
      expect: true,
      titleShould: /queue|ingest|pipeline/i,
    },
    {
      name: 'emoji + mention heavy decision',
      transcript: '<@U123ABC> Jonas Weber: ok final call 🔥 — we ship the dark theme 🌙 as default, <@U456DEF> owns the toggle, due Friday 🚀',
      expect: true,
    },
  ];

  for (const c of cases) {
    const res = await extractDecision(c.transcript, 'edge-test', []);
    let ok = res.is_decision === c.expect;
    if (ok && c.expect && res.is_decision) ok = (res.confidence || 0) >= 0.7 === c.expect;
    let detail = `is_decision=${res.is_decision} conf=${res.confidence ?? 'n/a'}`;
    if (ok && c.titleShould && !c.titleShould.test(res.title || '')) {
      ok = false;
      detail += ` title="${res.title}" (expected ${c.titleShould})`;
    }
    check(c.name, ok, detail);
  }

  // Oversized single message: 12KB of noise, decision at the end (also exercises
  // the detector's transcript cap indirectly — same shape of input).
  const noise = 'we discussed many unrelated things about the offsite agenda. '.repeat(200);
  const long = await extractDecision(
    `Maya Chen: ${noise}\nMaya Chen: Anyway, decided: the offsite is confirmed for Sept 12 in Lisbon. Sofia books the venue this week.`,
    'edge-test',
    []
  );
  check('12KB noisy input, decision at the end', long.is_decision === true, `is_decision=${long.is_decision} conf=${long.confidence}`);
}

function storeCases() {
  console.log('\n=== STORE: hostile inputs ===');

  // SQL-injection-shaped strings go through prepared statements untouched.
  const inj = store.upsertDecision(
    {
      title: `Robert'); DROP TABLE decisions;--`,
      decision_text: `quotes ' " and %_ wildcards`,
      decider: 'O\'Brien',
      channel_id: 'CEDGE',
      thread_ts: '1.1',
      permalink: null,
      topics: [`top'ic`, '100%'],
    },
    [{ owner_name: "D'Arcy", description: 'item with % and _ and 🚀' }]
  );
  check('injection-shaped strings stored safely', inj.id > 0);
  check('table still exists after "DROP TABLE" title', store.stats().total >= 1);

  const found = store.searchDecisions(`Robert drop table`);
  check('search finds the hostile-title decision', found.length === 1, `hits=${found.length}`);
  check('search with wildcard/quote query does not throw', Array.isArray(store.searchDecisions(`%_'";--`)));
  check('empty query returns results (not crash)', Array.isArray(store.searchDecisions('')));
  check('emoji-only query does not throw', Array.isArray(store.searchDecisions('🚀🔥')));

  // Very long text fields.
  const big = store.upsertDecision(
    {
      title: 'T'.repeat(500),
      decision_text: 'x'.repeat(50000),
      decider: 'Long Winded',
      channel_id: 'CEDGE',
      thread_ts: '2.2',
      permalink: null,
      topics: Array.from({ length: 50 }, (_, i) => `topic${i}`),
    },
    Array.from({ length: 30 }, (_, i) => ({ owner_name: `o${i}`, description: `task ${i}` }))
  );
  check('50KB decision_text + 30 action items stored', big.id > 0);
  check('hydrate returns 30 items', store.getDecision(big.id).action_items.length === 30);

  // Supersession edge: self and nonexistent ids must be no-ops.
  check('supersede(self) is a no-op', store.supersede(big.id, big.id) === false);
  check('supersede(nonexistent) is a no-op', store.supersede(99999, big.id) === false);

  // Duplicate action item descriptions in one extraction.
  const dup = store.upsertDecision(
    { title: 'dup items', decision_text: 'd', decider: 'x', channel_id: 'CEDGE', thread_ts: '3.3', permalink: null, topics: [] },
    [{ description: 'same task' }, { description: 'same task' }, { description: 'other task' }]
  );
  const dupItems = store.getDecision(dup.id).action_items;
  check('duplicate descriptions do not explode', dupItems.length >= 2 && dupItems.length <= 3, `stored=${dupItems.length}`);
}

async function answerCases() {
  console.log('\n=== ANSWER: graceful paths ===');
  const empty = await synthesizeAnswer('what did we decide about quantum blockchain?', [], [], [], true);
  const honest = /no(t| recorded| decision)|couldn.t find|don.t (have|see)|isn.t/i.test(empty);
  check('empty store + RTS down → honest no-answer (no invention)', honest && empty.length > 0, `"${empty.slice(0, 120)}"`);
  const words = empty.split(/\s+/).length;
  check('answer respects ~120 word cap', words <= 140, `${words} words`);
}

(async () => {
  await extractorCases();
  storeCases();
  await answerCases();
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('harness crashed:', e);
  process.exit(1);
});

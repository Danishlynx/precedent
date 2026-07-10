// SQLite decision store. Structured records + permalinks only — no message archives.
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'precedent.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  decision_text TEXT NOT NULL,
  decider       TEXT,
  decided_at    TEXT,
  channel_id    TEXT NOT NULL,
  thread_ts     TEXT NOT NULL,
  permalink     TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  superseded_by INTEGER,
  topics        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel_id, thread_ts)
);

CREATE TABLE IF NOT EXISTS action_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id    INTEGER NOT NULL REFERENCES decisions(id),
  owner_name     TEXT,
  owner_user_id  TEXT,
  description    TEXT NOT NULL,
  due_date       TEXT,
  status         TEXT NOT NULL DEFAULT 'open',
  last_nudged_at TEXT
);
`);

// --- decisions ---

const upsertStmt = db.prepare(`
  INSERT INTO decisions (title, decision_text, decider, decided_at, channel_id, thread_ts, permalink, topics)
  VALUES (@title, @decision_text, @decider, @decided_at, @channel_id, @thread_ts, @permalink, @topics)
  ON CONFLICT(channel_id, thread_ts) DO UPDATE SET
    title = excluded.title,
    decision_text = excluded.decision_text,
    decider = excluded.decider,
    decided_at = excluded.decided_at,
    permalink = excluded.permalink,
    topics = excluded.topics
`);

const getByThreadStmt = db.prepare(
  'SELECT * FROM decisions WHERE channel_id = ? AND thread_ts = ?'
);

// Upserts a decision keyed on (channel_id, thread_ts) and replaces its action items.
// topics: array of strings. actionItems: [{owner_name, description, due_date}].
const upsertDecision = db.transaction((decision, actionItems) => {
  const existing = getByThreadStmt.get(decision.channel_id, decision.thread_ts);
  upsertStmt.run({
    title: decision.title,
    decision_text: decision.decision_text,
    decider: decision.decider || null,
    decided_at: decision.decided_at || new Date().toISOString(),
    channel_id: decision.channel_id,
    thread_ts: decision.thread_ts,
    permalink: decision.permalink || null,
    topics: JSON.stringify(decision.topics || []),
  });
  const row = getByThreadStmt.get(decision.channel_id, decision.thread_ts);
  // Reconcile action items in place: item ids are embedded in already-sent
  // nudge buttons and done/nudged state must survive re-extraction of a thread.
  const current = db.prepare('SELECT * FROM action_items WHERE decision_id = ?').all(row.id);
  const byDescription = new Map(current.map((c) => [c.description, c]));
  const insertItem = db.prepare(`
    INSERT INTO action_items (decision_id, owner_name, owner_user_id, description, due_date)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateItem = db.prepare(
    'UPDATE action_items SET owner_name = ?, owner_user_id = ?, due_date = ? WHERE id = ?'
  );
  const keep = new Set();
  for (const item of actionItems || []) {
    if (!item || !item.description) continue;
    const match = byDescription.get(item.description);
    if (match) {
      updateItem.run(item.owner_name || null, item.owner_user_id || null, item.due_date || null, match.id);
      keep.add(match.id);
    } else {
      const res = insertItem.run(row.id, item.owner_name || null, item.owner_user_id || null, item.description, item.due_date || null);
      keep.add(Number(res.lastInsertRowid));
    }
  }
  for (const c of current) {
    if (!keep.has(c.id)) db.prepare('DELETE FROM action_items WHERE id = ?').run(c.id);
  }
  return { id: row.id, isNew: !existing };
});

function supersede(oldId, newId) {
  if (!oldId || oldId === newId) return false;
  const res = db
    .prepare("UPDATE decisions SET status = 'superseded', superseded_by = ? WHERE id = ? AND id != ?")
    .run(newId, oldId, newId);
  return res.changes > 0;
}

// One bad row must never break every future extraction — parse defensively.
function parseTopics(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Active decisions, compact form for the extraction prompt ("id: title [topics]").
function listActiveForPrompt() {
  return db
    .prepare("SELECT id, title, topics FROM decisions WHERE status = 'active' ORDER BY id")
    .all()
    .map((d) => `${d.id}: ${d.title} [${parseTopics(d.topics).join(', ')}]`);
}

function hydrate(row) {
  if (!row) return null;
  const items = db.prepare('SELECT * FROM action_items WHERE decision_id = ?').all(row.id);
  let supersededByTitle = null;
  if (row.superseded_by) {
    const s = db.prepare('SELECT title FROM decisions WHERE id = ?').get(row.superseded_by);
    supersededByTitle = s ? s.title : null;
  }
  const supersedes = db
    .prepare('SELECT id, title FROM decisions WHERE superseded_by = ?')
    .all(row.id);
  return {
    ...row,
    topics: parseTopics(row.topics),
    action_items: items,
    superseded_by_title: supersededByTitle,
    supersedes,
  };
}

function getDecision(id) {
  return hydrate(db.prepare('SELECT * FROM decisions WHERE id = ?').get(id));
}

// Keyword search: splits the query into terms, matches title/decision_text/topics,
// ranks by number of matching terms (active decisions first, then recency).
function searchDecisions(query, limit = 8) {
  const terms = String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const rows = db.prepare('SELECT * FROM decisions ORDER BY id DESC').all();
  const scored = rows
    .map((row) => {
      const haystack = `${row.title} ${row.decision_text} ${row.topics || ''}`.toLowerCase();
      const score = terms.reduce((n, t) => n + (haystack.includes(t) ? 1 : 0), 0);
      return { row, score };
    })
    .filter((s) => (terms.length ? s.score > 0 : true))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.row.status === 'active' ? -1 : 1) - (b.row.status === 'active' ? -1 : 1) ||
        b.row.id - a.row.id
    )
    .slice(0, limit);
  return scored.map((s) => hydrate(s.row));
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'was', 'were', 'did', 'does', 'what', 'when', 'who', 'which',
  'about', 'decide', 'decided', 'decision', 'decisions', 'our', 'are', 'you', 'have',
  'has', 'that', 'this', 'with', 'why', 'how', 'still', 'week', 'made', 'make', 'pick',
]);

function recentDecisions(limit = 10) {
  return db
    .prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map(hydrate);
}

// --- action items ---

function openActionItems() {
  return db
    .prepare(`
      SELECT ai.*, d.title AS decision_title, d.permalink AS decision_permalink
      FROM action_items ai JOIN decisions d ON d.id = ai.decision_id
      WHERE ai.status = 'open'
      ORDER BY ai.id
    `)
    .all();
}

function markActionItemDone(id) {
  return db.prepare("UPDATE action_items SET status = 'done' WHERE id = ?").run(id).changes > 0;
}

// Calendar date in the cron's timezone — UTC dates would suppress a whole
// next-day nudge run for anything nudged/snoozed after 5pm Pacific.
function laDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function markNudged(id) {
  db.prepare('UPDATE action_items SET last_nudged_at = ? WHERE id = ?').run(laDate(), id);
}

// Open items not yet nudged today (so the cron never double-DMs in a day).
function nudgeableActionItems() {
  const today = laDate();
  return openActionItems().filter((ai) => !ai.last_nudged_at || ai.last_nudged_at.slice(0, 10) < today);
}

function stats() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n;
  const active = db.prepare("SELECT COUNT(*) AS n FROM decisions WHERE status = 'active'").get().n;
  const superseded = db.prepare("SELECT COUNT(*) AS n FROM decisions WHERE status = 'superseded'").get().n;
  const openItems = db.prepare("SELECT COUNT(*) AS n FROM action_items WHERE status = 'open'").get().n;
  return { total, active, superseded, open_action_items: openItems };
}

module.exports = {
  db,
  upsertDecision,
  supersede,
  listActiveForPrompt,
  getDecision,
  searchDecisions,
  recentDecisions,
  openActionItems,
  nudgeableActionItems,
  markActionItemDone,
  markNudged,
  stats,
};

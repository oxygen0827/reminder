const path = require('path');
const Database = require('better-sqlite3');

const dataDir = process.env.DATA_DIR || __dirname;
const db = new Database(path.join(dataDir, 'todos.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#8B5CF6',
    created_at TEXT DEFAULT (datetime('now')),
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    due_date TEXT,
    due_time TEXT,
    remind_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_todos_list ON todos(list_id);
  CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_date);
`);

const defaultList = db.prepare('SELECT id FROM lists WHERE id = ?').get('default');
if (!defaultList) {
  db.prepare('INSERT INTO lists (id, name, color, sort_order) VALUES (?, ?, ?, ?)')
    .run('default', '待办', '#8B5CF6', 0);
}

module.exports = db;

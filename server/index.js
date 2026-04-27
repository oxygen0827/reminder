const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const distDir = process.env.DIST_DIR || path.join(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// ============ 列表 API ============

app.get('/api/lists', (req, res) => {
  res.json(db.prepare('SELECT * FROM lists ORDER BY sort_order').all());
});

app.post('/api/lists', (req, res) => {
  const { name, color = '#8B5CF6' } = req.body;
  const id = uuidv4();
  const sortOrder = (db.prepare('SELECT MAX(sort_order) as m FROM lists').get().m || 0) + 1;
  db.prepare('INSERT INTO lists (id, name, color, sort_order) VALUES (?, ?, ?, ?)').run(id, name, color, sortOrder);
  res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(id));
});

app.put('/api/lists/:id', (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;
  if (name !== undefined) db.prepare('UPDATE lists SET name = ? WHERE id = ?').run(name, id);
  if (color !== undefined) db.prepare('UPDATE lists SET color = ? WHERE id = ?').run(color, id);
  res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(id));
});

app.delete('/api/lists/:id', (req, res) => {
  if (req.params.id === 'default') return res.status(400).json({ error: 'Cannot delete default list' });
  db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ 待办事项 API ============

app.get('/api/lists/:listId/todos', (req, res) => {
  const { listId } = req.params;
  const { completed } = req.query;
  let query = 'SELECT * FROM todos WHERE list_id = ?';
  const params = [listId];
  if (completed !== undefined) { query += ' AND completed = ?'; params.push(completed === 'true' ? 1 : 0); }
  query += ' ORDER BY sort_order, created_at DESC';
  res.json(db.prepare(query).all(...params).map(t => ({ ...t, completed: !!t.completed })));
});

app.get('/api/todos', (req, res) => {
  const { search } = req.query;
  let query = 'SELECT * FROM todos';
  const params = [];
  if (search) { query += ' WHERE text LIKE ?'; params.push(`%${search}%`); }
  query += ' ORDER BY created_at DESC LIMIT 100';
  res.json(db.prepare(query).all(...params).map(t => ({ ...t, completed: !!t.completed })));
});

app.post('/api/todos', (req, res) => {
  const { list_id, text, due_date, due_time, remind_at } = req.body;
  const id = uuidv4();
  const sortOrder = (db.prepare('SELECT MAX(sort_order) as m FROM todos WHERE list_id = ?').get(list_id).m || 0) + 1;
  db.prepare('INSERT INTO todos (id, list_id, text, due_date, due_time, remind_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, list_id, text, due_date || null, due_time || null, remind_at || null, sortOrder);
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ ...todo, completed: !!todo.completed });
});

app.put('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  const { text, completed, due_date, due_time, remind_at, list_id } = req.body;
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });

  const fields = [], values = [];
  if (text !== undefined) { fields.push('text = ?'); values.push(text); }
  if (completed !== undefined) {
    fields.push('completed = ?', 'completed_at = ?');
    values.push(completed ? 1 : 0, completed ? new Date().toISOString() : null);
  }
  if (due_date !== undefined) { fields.push('due_date = ?'); values.push(due_date); }
  if (due_time !== undefined) { fields.push('due_time = ?'); values.push(due_time); }
  if (remind_at !== undefined) { fields.push('remind_at = ?'); values.push(remind_at); }
  if (list_id !== undefined) { fields.push('list_id = ?'); values.push(list_id); }
  if (fields.length > 0) db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);

  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ ...updated, completed: !!updated.completed });
});

app.delete('/api/todos/:id', (req, res) => {
  db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/todos/:id/toggle', (req, res) => {
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  const newCompleted = todo.completed ? 0 : 1;
  db.prepare('UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?')
    .run(newCompleted, newCompleted ? new Date().toISOString() : null, req.params.id);
  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  res.json({ ...updated, completed: !!updated.completed });
});

// SPA 兜底
app.get('*', (req, res) => {
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Not found');
});

app.listen(PORT, () => console.log(`Remind server running on http://localhost:${PORT}`));

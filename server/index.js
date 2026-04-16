const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ============ 列表 API ============

// 获取所有列表
app.get('/api/lists', (req, res) => {
  const lists = db.prepare('SELECT * FROM lists ORDER BY sort_order').all();
  res.json(lists);
});

// 创建列表
app.post('/api/lists', (req, res) => {
  const { name, color = '#8B5CF6' } = req.body;
  const id = uuidv4();
  
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM lists').get();
  const sortOrder = (maxOrder.m || 0) + 1;
  
  db.prepare('INSERT INTO lists (id, name, color, sort_order) VALUES (?, ?, ?, ?)')
    .run(id, name, color, sortOrder);
  
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  res.json(list);
});

// 更新列表
app.put('/api/lists/:id', (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;
  
  if (name !== undefined) {
    db.prepare('UPDATE lists SET name = ? WHERE id = ?').run(name, id);
  }
  if (color !== undefined) {
    db.prepare('UPDATE lists SET color = ? WHERE id = ?').run(color, id);
  }
  
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  res.json(list);
});

// 删除列表
app.delete('/api/lists/:id', (req, res) => {
  const { id } = req.params;
  if (id === 'default') {
    return res.status(400).json({ error: 'Cannot delete default list' });
  }
  db.prepare('DELETE FROM lists WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============ 待办事项 API ============

// 获取某个列表的所有待办
app.get('/api/lists/:listId/todos', (req, res) => {
  const { listId } = req.params;
  const { completed } = req.query;
  
  let query = 'SELECT * FROM todos WHERE list_id = ?';
  const params = [listId];
  
  if (completed !== undefined) {
    query += ' AND completed = ?';
    params.push(completed === 'true' ? 1 : 0);
  }
  
  query += ' ORDER BY sort_order, created_at DESC';
  
  const todos = db.prepare(query).all(...params);
  res.json(todos.map(t => ({ ...t, completed: !!t.completed })));
});

// 获取所有待办（跨列表，用于搜索）
app.get('/api/todos', (req, res) => {
  const { search } = req.query;
  
  let query = 'SELECT * FROM todos';
  const params = [];
  
  if (search) {
    query += ' WHERE text LIKE ?';
    params.push(`%${search}%`);
  }
  
  query += ' ORDER BY created_at DESC LIMIT 100';
  
  const todos = db.prepare(query).all(...params);
  res.json(todos.map(t => ({ ...t, completed: !!t.completed })));
});

// 创建待办
app.post('/api/todos', (req, res) => {
  const { list_id, text, due_date, due_time, remind_at } = req.body;
  const id = uuidv4();
  
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM todos WHERE list_id = ?').get(list_id);
  const sortOrder = (maxOrder.m || 0) + 1;
  
  db.prepare(`
    INSERT INTO todos (id, list_id, text, due_date, due_time, remind_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, list_id, text, due_date || null, due_time || null, remind_at || null, sortOrder);
  
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ ...todo, completed: !!todo.completed });
});

// 更新待办
app.put('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  const { text, completed, due_date, due_time, remind_at, list_id } = req.body;
  
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  
  if (text !== undefined) {
    db.prepare('UPDATE todos SET text = ? WHERE id = ?').run(text, id);
  }
  if (completed !== undefined) {
    const completedAt = completed ? new Date().toISOString() : null;
    db.prepare('UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?')
      .run(completed ? 1 : 0, completedAt, id);
  }
  if (due_date !== undefined) {
    db.prepare('UPDATE todos SET due_date = ? WHERE id = ?').run(due_date, id);
  }
  if (due_time !== undefined) {
    db.prepare('UPDATE todos SET due_time = ? WHERE id = ?').run(due_time, id);
  }
  if (remind_at !== undefined) {
    db.prepare('UPDATE todos SET remind_at = ? WHERE id = ?').run(remind_at, id);
  }
  if (list_id !== undefined) {
    db.prepare('UPDATE todos SET list_id = ? WHERE id = ?').run(list_id, id);
  }
  
  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ ...updated, completed: !!updated.completed });
});

// 删除待办
app.delete('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  res.json({ success: true });
});

// 切换完成状态
app.post('/api/todos/:id/toggle', (req, res) => {
  const { id } = req.params;
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  
  const newCompleted = todo.completed ? 0 : 1;
  const completedAt = newCompleted ? new Date().toISOString() : null;
  
  db.prepare('UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?')
    .run(newCompleted, completedAt, id);
  
  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ ...updated, completed: !!updated.completed });
});

// 获取需要提醒的待办（用于定时检查）
app.get('/api/todos/due-soon', (req, res) => {
  const now = new Date().toISOString();
  const in15min = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  
  const todos = db.prepare(`
    SELECT * FROM todos 
    WHERE completed = 0 
    AND remind_at IS NOT NULL 
    AND remind_at <= ?
    AND remind_at >= ?
  `).all(in15min, now);
  
  res.json(todos.map(t => ({ ...t, completed: !!t.completed })));
});

// 提供前端静态文件
// 优先使用 Electron 主进程设置的 DIST_DIR，否则回退到相对路径 ../dist
const fs = require('fs');
const distPath = process.env.DIST_DIR || path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA 回退：所有非 /api 路由都返回 index.html
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.status(503).send('前端文件未找到，请先运行 npm run build');
  });
}

app.listen(PORT, () => {
  console.log(`Remind server running on http://localhost:${PORT}`);
});

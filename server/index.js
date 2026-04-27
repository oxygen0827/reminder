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

// 生产环境下托管前端静态文件
const distDir = process.env.DIST_DIR || path.join(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// ============ 列表 API ============

app.get('/api/lists', (req, res) => {
  const lists = db.prepare('SELECT * FROM lists ORDER BY sort_order').all();
  res.json(lists);
});

app.post('/api/lists', (req, res) => {
  const { name, color = '#8B5CF6' } = req.body;
  const id = uuidv4();
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM lists').get();
  const sortOrder = (maxOrder.m || 0) + 1;
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
  const { id } = req.params;
  if (id === 'default') return res.status(400).json({ error: 'Cannot delete default list' });
  db.prepare('DELETE FROM lists WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============ 待办事项 API ============

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

app.post('/api/todos', (req, res) => {
  const { list_id, text, due_date, due_time, remind_at } = req.body;
  const id = uuidv4();
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM todos WHERE list_id = ?').get(list_id);
  const sortOrder = (maxOrder.m || 0) + 1;
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

  const fields = [];
  const values = [];

  if (text !== undefined) { fields.push('text = ?'); values.push(text); }
  if (completed !== undefined) {
    fields.push('completed = ?', 'completed_at = ?');
    values.push(completed ? 1 : 0, completed ? new Date().toISOString() : null);
  }
  if (due_date !== undefined) { fields.push('due_date = ?'); values.push(due_date); }
  if (due_time !== undefined) { fields.push('due_time = ?'); values.push(due_time); }
  if (remind_at !== undefined) { fields.push('remind_at = ?'); values.push(remind_at); }
  if (list_id !== undefined) { fields.push('list_id = ?'); values.push(list_id); }

  if (fields.length > 0) {
    db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  }

  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ ...updated, completed: !!updated.completed });
});

app.delete('/api/todos/:id', (req, res) => {
  db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/todos/:id/toggle', (req, res) => {
  const { id } = req.params;
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  const newCompleted = todo.completed ? 0 : 1;
  const completedAt = newCompleted ? new Date().toISOString() : null;
  db.prepare('UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?').run(newCompleted, completedAt, id);
  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ ...updated, completed: !!updated.completed });
});

app.get('/api/todos/pending', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 3, 20);
  const todos = db.prepare(`
    SELECT * FROM todos WHERE completed = 0
    ORDER BY CASE WHEN due_date IS NOT NULL THEN 0 ELSE 1 END, due_date ASC, due_time ASC, created_at ASC
    LIMIT ?
  `).all(limit);
  res.json(todos.map(t => ({ ...t, completed: !!t.completed })));
});

// ============ AI 聊天 API ============

const aiConfigPath = () => path.join(process.env.DATA_DIR || '.', 'ai-config.json');
const chatHistoryPath = () => path.join(process.env.DATA_DIR || '.', 'chat-history.json');

function loadAiConfig() {
  try { return JSON.parse(fs.readFileSync(aiConfigPath(), 'utf8')); } catch { return null; }
}
function loadChatHistory() {
  try { return JSON.parse(fs.readFileSync(chatHistoryPath(), 'utf8')); } catch { return []; }
}
function saveChatHistory(h) {
  fs.writeFileSync(chatHistoryPath(), JSON.stringify(h));
}

app.get('/api/ai-config', (req, res) => {
  const cfg = loadAiConfig();
  if (!cfg) return res.json({ configured: false });
  res.json({ configured: true, endpoint: cfg.endpoint, model: cfg.model });
});

app.post('/api/ai-config', (req, res) => {
  const { endpoint, apiKey, model } = req.body;
  if (!endpoint || !apiKey) return res.status(400).json({ error: 'endpoint and apiKey required' });
  fs.writeFileSync(aiConfigPath(), JSON.stringify({ endpoint, apiKey, model: model || 'gpt-3.5-turbo' }));
  res.json({ ok: true });
});

app.get('/api/chat/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(loadChatHistory().slice(-limit));
});

app.delete('/api/chat/history', (req, res) => {
  saveChatHistory([]);
  res.json({ ok: true });
});

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_todos',
      description: '获取用户当前未完成的待办事项列表',
      parameters: { type: 'object', properties: {} }
    }
  }
];

async function executeTool(name) {
  if (name === 'get_todos') {
    try {
      const todos = db.prepare(`
        SELECT text, due_date, due_time FROM todos
        WHERE completed = 0
        ORDER BY CASE WHEN due_date IS NOT NULL THEN 0 ELSE 1 END, due_date ASC, due_time ASC
        LIMIT 10
      `).all();
      if (todos.length === 0) return '用户当前没有未完成的待办事项';
      return '用户未完成的待办事项：\n' + todos.map((t, i) => {
        const due = t.due_date ? `（截止 ${t.due_date}${t.due_time ? ' ' + t.due_time.slice(0, 5) : ''}）` : '';
        return `${i + 1}. ${t.text}${due}`;
      }).join('\n');
    } catch (e) {
      return `查询待办失败：${e.message}`;
    }
  }
  return '未知工具';
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const cfg = loadAiConfig();
  if (!cfg) return res.status(400).json({ error: 'AI not configured' });

  const history = loadChatHistory();
  const messages = [
    { role: 'system', content: '你是一个贴心的待办助手，性格温暖有趣。你可以帮用户查待办事项、出谋划策、聊天。回复简洁，通常不超过3句话。' },
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  const callModel = async (msgs, useTools) => {
    const body = { model: cfg.model, messages: msgs, max_tokens: 300 };
    if (useTools) { body.tools = TOOLS; body.tool_choice = 'auto'; }
    const r = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const t = await r.text(); throw Object.assign(new Error(t), { status: r.status }); }
    return r.json();
  };

  try {
    const data = await callModel(messages, true);
    const assistantMsg = data.choices?.[0]?.message;
    if (!assistantMsg) return res.status(500).json({ error: '模型无响应' });

    let reply;

    if (assistantMsg.tool_calls?.length > 0) {
      messages.push(assistantMsg);
      for (const tc of assistantMsg.tool_calls) {
        const result = await executeTool(tc.function.name);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      const data2 = await callModel(messages, false);
      reply = data2.choices?.[0]?.message?.content?.trim() || '...';
    } else {
      reply = assistantMsg.content?.trim() || '...';
    }

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    if (history.length > 100) history.splice(0, history.length - 100);
    saveChatHistory(history);
    res.json({ reply });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// 前端路由兜底（SPA）
app.get('*', (req, res) => {
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

app.listen(PORT, () => {
  console.log(`Remind server running on http://localhost:${PORT}`);
});

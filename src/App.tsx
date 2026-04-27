import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Trash2, Plus, Calendar, Bell, Search, X, Circle, Clock, Pencil, CalendarDays, CheckCircle2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from './api';
import type { List, Todo } from './types';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import './App.css';

const COLORS = [
  '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#EF4444', '#14B8A6'
];

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

function App() {
  const [lists, setLists] = useState<List[]>([]);
  const [activeList, setActiveList] = useState<string>('default');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState(COLORS[0]);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [newTodoHour, setNewTodoHour] = useState('09');
  const [newTodoMinute, setNewTodoMinute] = useState('00');
  const [editingTodo, setEditingTodo] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editRemindDate, setEditRemindDate] = useState('');
  const [editRemindHour, setEditRemindHour] = useState('09');
  const [editRemindMinute, setEditRemindMinute] = useState('00');

  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(320);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );
  const [reminderEnabled, setReminderEnabled] = useState(() =>
    localStorage.getItem('reminderEnabled') !== 'false'
  );

  const firedReminders = useRef<Set<string>>(new Set());

  const handleMouseMoveLeft = useCallback((e: MouseEvent) => {
    if (!isDraggingLeft) return;
    setLeftWidth(Math.max(180, Math.min(400, e.clientX)));
  }, [isDraggingLeft]);

  const handleMouseMoveRight = useCallback((e: MouseEvent) => {
    if (!isDraggingRight) return;
    setRightWidth(Math.max(240, Math.min(500, window.innerWidth - e.clientX)));
  }, [isDraggingRight]);

  useEffect(() => {
    if (!isDraggingLeft) return;
    const up = () => setIsDraggingLeft(false);
    document.addEventListener('mousemove', handleMouseMoveLeft);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', handleMouseMoveLeft); document.removeEventListener('mouseup', up); };
  }, [isDraggingLeft, handleMouseMoveLeft]);

  useEffect(() => {
    if (!isDraggingRight) return;
    const up = () => setIsDraggingRight(false);
    document.addEventListener('mousemove', handleMouseMoveRight);
    document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', handleMouseMoveRight); document.removeEventListener('mouseup', up); };
  }, [isDraggingRight, handleMouseMoveRight]);

  const loadLists = useCallback(async () => {
    try {
      const data = await api.getLists();
      setLists(data);
      setActiveList(prev => data.find(l => l.id === prev) ? prev : data[0]?.id ?? 'default');
    } catch (e) { console.error('Failed to load lists:', e); }
  }, []);

  const loadTodos = useCallback(async () => {
    try {
      const data = searchQuery ? await api.getAllTodos(searchQuery) : await api.getTodos(activeList);
      setTodos(data);
    } catch (e) { console.error('Failed to load todos:', e); }
  }, [activeList, searchQuery]);

  useEffect(() => { loadLists(); }, []);
  useEffect(() => { if (activeList) loadTodos(); }, [activeList, loadTodos]);

  useEffect(() => {
    if (addingTodo && !newTodoDueDate) setNewTodoDueDate(format(new Date(), 'yyyy-MM-dd'));
  }, [addingTodo, newTodoDueDate]);

  useEffect(() => {
    if ('Notification' in window) setNotifPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!reminderEnabled || notifPermission !== 'granted') return;
    const check = () => {
      const now = new Date();
      todos.forEach(todo => {
        if (!todo.remind_at || todo.completed || firedReminders.current.has(todo.id)) return;
        const diff = now.getTime() - parseISO(todo.remind_at).getTime();
        if (diff >= 0 && diff <= 30000) {
          firedReminders.current.add(todo.id);
          new Notification('🔔 提醒', { body: todo.text });
        }
      });
    };
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [todos, reminderEnabled, notifPermission]);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    await api.createList(newListName, newListColor);
    setNewListName(''); setShowAddList(false); loadLists();
  };

  const handleEditListName = async (id: string) => {
    if (!editingListName.trim()) { setEditingListId(null); return; }
    await api.updateList(id, { name: editingListName });
    setEditingListId(null); setEditingListName(''); loadLists();
  };

  const handleDeleteList = async (id: string) => {
    if (id === 'default') return;
    await api.deleteList(id);
    if (activeList === id) setActiveList('default');
    loadLists();
  };

  const handleAddTodo = async () => {
    if (!newTodoText.trim()) return;
    await api.createTodo({
      list_id: activeList,
      text: newTodoText,
      due_date: newTodoDueDate || undefined,
      remind_at: newTodoDueDate ? `${newTodoDueDate}T${newTodoHour}:${newTodoMinute}:00` : undefined,
    });
    setNewTodoText(''); setNewTodoDueDate(''); setNewTodoHour('09'); setNewTodoMinute('00');
    setAddingTodo(false); loadTodos();
  };

  const handleToggleTodo = async (id: string) => { await api.toggleTodo(id); loadTodos(); };

  const handleDeleteTodo = async (id: string) => {
    await api.deleteTodo(id);
    firedReminders.current.delete(id);
    loadTodos();
  };

  const handleEditTodo = async (id: string) => {
    if (!editText.trim()) return;
    await api.updateTodo(id, {
      text: editText,
      remind_at: editRemindDate ? `${editRemindDate}T${editRemindHour}:${editRemindMinute}:00` : null,
    });
    setEditingTodo(null); setEditText(''); setEditRemindDate(''); loadTodos();
  };

  const formatDueDate = (date: string | null, time: string | null) => {
    if (!date) return null;
    const d = parseISO(date);
    let text = isToday(d) ? '今天' : isTomorrow(d) ? '明天' : format(d, 'M月d日', { locale: zhCN });
    if (time) text += ` ${time}`;
    return text;
  };

  const isOverdue = (todo: Todo) => {
    if (!todo.due_date || todo.completed) return false;
    const d = parseISO(todo.due_date);
    if (todo.due_time) { const [h, m] = todo.due_time.split(':').map(Number); d.setHours(h, m); }
    return isPast(d) && !isToday(d);
  };

  const activeListData = lists.find(l => l.id === activeList);
  const incompleteTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  return (
    <div className="app">
      <aside className="sidebar" style={{ width: leftWidth }}>
        <div className="sidebar-header">
          <h1 className="logo">Remind</h1>
        </div>

        {notifPermission !== 'granted' && (
          <div className="notif-banner" onClick={() => 'Notification' in window && Notification.requestPermission().then(p => setNotifPermission(p))}>
            <Bell size={16} />
            <span>开启提醒通知</span>
            <CheckCircle2 size={16} className="check-icon" />
          </div>
        )}

        <nav className="lists">
          {lists.map(list => (
            <div key={list.id} className={`list-item ${activeList === list.id ? 'active' : ''}`} onClick={() => setActiveList(list.id)}>
              <span className="list-dot" style={{ background: list.color }} />
              {editingListId === list.id ? (
                <div className="list-rename-form" onClick={e => e.stopPropagation()}>
                  <input className="list-name-input" value={editingListName}
                    onChange={e => setEditingListName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleEditListName(list.id); if (e.key === 'Escape') setEditingListId(null); }}
                    autoFocus />
                  <button className="rename-confirm" onClick={() => handleEditListName(list.id)}><Check size={12} /></button>
                </div>
              ) : (
                <span className="list-name" onDoubleClick={e => {
                  if (list.id === 'default') return;
                  e.stopPropagation(); setEditingListId(list.id); setEditingListName(list.name);
                }}>{list.name}</span>
              )}
              <div className="list-actions">
                {list.id !== 'default' && editingListId !== list.id && (<>
                  <button className="list-action-btn" title="重命名"
                    onClick={e => { e.stopPropagation(); setEditingListId(list.id); setEditingListName(list.name); }}>
                    <Pencil size={12} />
                  </button>
                  <button className="list-action-btn delete" title="删除"
                    onClick={e => { e.stopPropagation(); handleDeleteList(list.id); }}>
                    <X size={14} />
                  </button>
                </>)}
              </div>
            </div>
          ))}

          {showAddList ? (
            <div className="add-list-form">
              <input type="text" placeholder="列表名称" value={newListName}
                onChange={e => setNewListName(e.target.value)} autoFocus />
              <div className="color-picker">
                {COLORS.map(c => (
                  <span key={c} className={`color-option ${newListColor === c ? 'selected' : ''}`}
                    style={{ background: c }} onClick={() => setNewListColor(c)} />
                ))}
              </div>
              <div className="add-list-actions">
                <button onClick={handleCreateList}>添加</button>
                <button onClick={() => setShowAddList(false)}>取消</button>
              </div>
            </div>
          ) : (
            <button className="add-list-btn" onClick={() => setShowAddList(true)}>
              <Plus size={16} /> 新建列表
            </button>
          )}
        </nav>
      </aside>

      <div className="resize-handle left" style={{ left: leftWidth }} onMouseDown={() => setIsDraggingLeft(true)} />

      <main className="main" style={{ marginLeft: leftWidth, marginRight: rightWidth }}>
        <header className="main-header">
          <div className="header-title">
            <h2 style={{ color: activeListData?.color }}>{activeListData?.name || '待办'}</h2>
            <span className="todo-count">{incompleteTodos.length} 项</span>
          </div>
          <div className="header-center">
            <div className="search-box">
              <Search size={18} />
              <input type="text" placeholder="搜索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && <button onClick={() => setSearchQuery('')}><X size={16} /></button>}
            </div>
          </div>
          <div className="header-right">
            <button className={`reminder-toggle ${reminderEnabled ? 'active' : ''}`}
              onClick={() => { const next = !reminderEnabled; setReminderEnabled(next); localStorage.setItem('reminderEnabled', String(next)); }}
              title={reminderEnabled ? '提醒已开启' : '提醒已关闭'}>
              <Bell size={18} />
              <span>{reminderEnabled ? '开' : '关'}</span>
            </button>
          </div>
        </header>

        <div className="todos">
          {addingTodo ? (
            <div className="add-todo-form">
              <input type="text" placeholder="添加待办..." value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)} autoFocus />
              <div className="add-todo-options">
                <label className="date-select">
                  <Calendar size={16} />
                  <select value={newTodoDueDate} onChange={e => setNewTodoDueDate(e.target.value)}>
                    <option value="">不设置</option>
                    <option value={format(new Date(), 'yyyy-MM-dd')}>今天</option>
                    <option value={format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')}>明天</option>
                    <option value={format(new Date(Date.now() + 86400000 * 2), 'yyyy-MM-dd')}>后天</option>
                    {newTodoDueDate && ![format(new Date(), 'yyyy-MM-dd'), format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'), format(new Date(Date.now() + 86400000 * 2), 'yyyy-MM-dd')].includes(newTodoDueDate) && (
                      <option value={newTodoDueDate}>{newTodoDueDate}</option>
                    )}
                  </select>
                  <label className="calendar-icon-btn">
                    <CalendarDays size={14} />
                    <input type="date" value={newTodoDueDate} onChange={e => setNewTodoDueDate(e.target.value)} className="date-actual" />
                  </label>
                </label>
                <label className="time-select">
                  <Clock size={16} />
                  <select value={newTodoHour} onChange={e => setNewTodoHour(e.target.value)}>
                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="time-sep">:</span>
                  <select value={newTodoMinute} onChange={e => setNewTodoMinute(e.target.value)}>
                    {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
              <div className="add-todo-actions">
                <button className="btn-primary" onClick={handleAddTodo}>添加</button>
                <button onClick={() => { setAddingTodo(false); setNewTodoDueDate(''); setNewTodoHour('09'); setNewTodoMinute('00'); }}>取消</button>
              </div>
            </div>
          ) : (
            <button className="add-todo-btn" onClick={() => setAddingTodo(true)}>
              <Plus size={20} /><span>添加待办</span>
            </button>
          )}

          {incompleteTodos.map(todo => (
            <div key={todo.id} className={`todo-item ${isOverdue(todo) ? 'overdue' : ''}`}>
              <button className="todo-check" onClick={() => handleToggleTodo(todo.id)}><Circle size={22} /></button>
              <div className="todo-content">
                {editingTodo === todo.id ? (
                  <div className="todo-edit">
                    <input type="text" value={editText} onChange={e => setEditText(e.target.value)} autoFocus />
                    <div className="todo-edit-remind">
                      <input type="date" value={editRemindDate} onChange={e => setEditRemindDate(e.target.value)} title="提醒日期" />
                      <select value={editRemindHour} onChange={e => setEditRemindHour(e.target.value)}>
                        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span>:</span>
                      <select value={editRemindMinute} onChange={e => setEditRemindMinute(e.target.value)}>
                        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="todo-edit-actions">
                      <button onClick={() => handleEditTodo(todo.id)}>保存</button>
                      <button onClick={() => setEditingTodo(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="todo-text" onDoubleClick={() => {
                      setEditingTodo(todo.id); setEditText(todo.text);
                      if (todo.remind_at) {
                        const [d, t] = todo.remind_at.split('T');
                        setEditRemindDate(d || '');
                        const [h, m] = (t || '09:00').split(':');
                        setEditRemindHour(h || '09'); setEditRemindMinute(m || '00');
                      } else { setEditRemindDate(''); setEditRemindHour('09'); setEditRemindMinute('00'); }
                    }}>{todo.text}</span>
                    {todo.due_date && (
                      <span className={`todo-due ${isOverdue(todo) ? 'overdue' : ''}`}>
                        <Calendar size={12} />{formatDueDate(todo.due_date, todo.due_time)}
                      </span>
                    )}
                    {todo.remind_at && (
                      <span className="todo-remind">
                        <Bell size={12} />{formatDueDate(todo.remind_at.split('T')[0], todo.remind_at.split('T')[1]?.substring(0, 5))}
                      </span>
                    )}
                  </>
                )}
              </div>
              <button className="todo-delete" onClick={() => handleDeleteTodo(todo.id)}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      </main>

      <div className="resize-handle right" style={{ right: rightWidth }} onMouseDown={() => setIsDraggingRight(true)} />

      <aside className="completed-panel" style={{ width: rightWidth }}>
        <div className="completed-header">
          <h3>已完成</h3>
          <span className="completed-count">{completedTodos.length} 项</span>
          {completedTodos.length > 0 && (
            <button className="completed-toggle-btn" onClick={() => setShowCompleted(v => !v)}
              title={showCompleted ? '收起' : '展开'}>
              {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
        {completedTodos.length === 0 ? (
          <div className="completed-empty"><span>暂无已完成项</span></div>
        ) : showCompleted ? (
          <div className="completed-list">
            {completedTodos.map(todo => (
              <div key={todo.id} className="todo-item completed">
                <button className="todo-check checked" onClick={() => handleToggleTodo(todo.id)}><Check size={18} /></button>
                <div className="todo-content">
                  <span className="todo-text">{todo.text}</span>
                  {todo.completed_at && (
                    <span className="todo-completed-at">完成于 {format(parseISO(todo.completed_at), 'M月d日 HH:mm')}</span>
                  )}
                </div>
                <button className="todo-restore" onClick={() => handleToggleTodo(todo.id)} title="恢复为待办"><RotateCcw size={16} /></button>
                <button className="todo-delete" onClick={() => handleDeleteTodo(todo.id)}><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        ) : (
          <button className="show-completed" onClick={() => setShowCompleted(true)}>显示已完成 {completedTodos.length} 项</button>
        )}
      </aside>
    </div>
  );
}

export default App;

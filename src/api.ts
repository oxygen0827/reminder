import type { List, Todo, CreateTodoInput, UpdateTodoInput } from './types';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getLists: () => fetchJSON<List[]>('/api/lists'),

  createList: (name: string, color: string) =>
    fetchJSON<List>('/api/lists', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),

  updateList: (id: string, data: { name?: string; color?: string }) =>
    fetchJSON<List>(`/api/lists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteList: (id: string) =>
    fetchJSON<{ success: boolean }>(`/api/lists/${id}`, { method: 'DELETE' }),

  getTodos: (listId: string, completed?: boolean) => {
    const url = `/api/lists/${listId}/todos${completed !== undefined ? `?completed=${completed}` : ''}`;
    return fetchJSON<Todo[]>(url);
  },

  getAllTodos: (search?: string) => {
    const url = search ? `/api/todos?search=${encodeURIComponent(search)}` : '/api/todos';
    return fetchJSON<Todo[]>(url);
  },

  createTodo: (data: CreateTodoInput) =>
    fetchJSON<Todo>('/api/todos', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTodo: (id: string, data: UpdateTodoInput) =>
    fetchJSON<Todo>(`/api/todos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTodo: (id: string) =>
    fetchJSON<{ success: boolean }>(`/api/todos/${id}`, { method: 'DELETE' }),

  toggleTodo: (id: string) =>
    fetchJSON<Todo>(`/api/todos/${id}/toggle`, { method: 'POST' }),
};

export interface List {
  id: string;
  name: string;
  color: string;
  created_at: string;
  sort_order: number;
}

export interface Todo {
  id: string;
  list_id: string;
  text: string;
  completed: boolean;
  due_date: string | null;
  due_time: string | null;
  remind_at: string | null;
  created_at: string;
  completed_at: string | null;
  sort_order: number;
}

export interface CreateTodoInput {
  list_id: string;
  text: string;
  due_date?: string;
  due_time?: string;
  remind_at?: string;
}

export interface UpdateTodoInput {
  text?: string;
  completed?: boolean;
  due_date?: string | null;
  due_time?: string | null;
  remind_at?: string | null;
  list_id?: string;
}

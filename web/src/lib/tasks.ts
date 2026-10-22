import type { Task, TaskStatus } from '@/lib/api';
import { daysUntil } from '@/lib/utils';

export function isTaskOverdue(task: Pick<Task, 'due_date' | 'status'>) {
  if (task.status === 'done' || !task.due_date) return false;
  const days = daysUntil(task.due_date);
  return days !== null && days < 0;
}

export function isTaskDueToday(task: Pick<Task, 'due_date' | 'status'>) {
  if (task.status === 'done' || !task.due_date) return false;
  return daysUntil(task.due_date) === 0;
}

export function taskDueState(task: Pick<Task, 'due_date' | 'status'>) {
  if (task.status === 'done') {
    return { label: 'Completed', variant: 'success' as const };
  }

  const days = daysUntil(task.due_date);
  if (days === null) {
    return { label: 'No due date', variant: 'secondary' as const };
  }
  if (days < 0) {
    return { label: `${Math.abs(days)}d overdue`, variant: 'destructive' as const };
  }
  if (days === 0) {
    return { label: 'Due today', variant: 'warning' as const };
  }
  if (days === 1) {
    return { label: 'Due tomorrow', variant: 'warning' as const };
  }
  if (days <= 7) {
    return { label: `${days}d left`, variant: 'warning' as const };
  }
  return { label: `${days}d left`, variant: 'secondary' as const };
}

export function formatTaskPriority(priority: Task['priority']) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatTaskStatus(status: TaskStatus) {
  return status === 'done' ? 'Done' : 'Open';
}

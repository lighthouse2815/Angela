import type { Task } from './task-schema'

import { localDate, taskDue } from './task-time'

/** Bounded authoritative state for normal prompts. Full retained history remains available through task_list. */
export function commitmentContext(tasks: readonly Task[], now: number, timezone: string) {
  const today = localDate(now, timezone)
  const pending = tasks.filter(task => task.status === 'pending')
    .sort((a, b) => (taskDue(a) ?? a.dueDate ?? '9999').localeCompare(taskDue(b) ?? b.dueDate ?? '9999') || a.id.localeCompare(b.id))
  const date = (task: Task) => taskDue(task) ? localDate(Date.parse(taskDue(task)!), timezone) : task.dueDate
  return {
    overdue: pending.filter(task => taskDue(task) ? Date.parse(taskDue(task)!) < now : Boolean(task.dueDate && task.dueDate < today)).slice(0, 8),
    today: pending.filter(task => date(task) === today && (!taskDue(task) || Date.parse(taskDue(task)!) >= now)).slice(0, 8),
    upcoming: pending.filter(task => Boolean(date(task) && date(task)! > today)).slice(0, 6),
    unscheduled: pending.filter(task => !taskDue(task) && !task.dueDate).slice(0, 5),
    recentlyCompleted: tasks.filter(task => task.status === 'completed' && Date.parse(task.completedAt ?? task.updatedAt) >= now - 7 * 86_400_000)
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt) || a.id.localeCompare(b.id))
      .slice(0, 3),
  }
}

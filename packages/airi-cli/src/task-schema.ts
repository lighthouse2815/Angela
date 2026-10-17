import * as v from 'valibot'

export const taskId = v.pipe(v.string(), v.uuid())
export const taskDate = v.pipe(v.string(), v.isoDate(), v.check(value => new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value))
export const taskTime = v.pipe(v.string(), v.isoTimestamp(), v.check(value => /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && v.is(taskDate, value.slice(0, 10)) && Number.isFinite(Date.parse(value))), v.transform(value => new Date(value).toISOString()))
export const taskZone = v.pipe(v.string(), v.check((zone) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format()
    return true
  }
  catch {
    return false
  }
}))
const recurrence = v.pipe(v.strictObject({
  type: v.picklist(['daily', 'weekly']),
  interval: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(52)), 1),
  daysOfWeek: v.optional(v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), v.minLength(1), v.maxLength(7))),
}), v.check(value => !value.daysOfWeek || (value.type === 'weekly' && new Set(value.daysOfWeek).size === value.daysOfWeek.length)))
const fields = {
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  type: v.picklist(['todo', 'reminder', 'deadline', 'routine', 'follow_up']),
  dueAt: v.optional(taskTime),
  dueDate: v.optional(taskDate),
  timezone: v.optional(taskZone),
  recurrence: v.optional(recurrence),
  context: v.optional(v.pipe(v.string(), v.maxLength(300))),
}
export const taskCreate = v.strictObject(fields)
export const taskUpdate = v.strictObject({
  title: v.optional(fields.title),
  type: v.optional(fields.type),
  dueAt: v.optional(v.nullable(taskTime)),
  dueDate: v.optional(v.nullable(taskDate)),
  timezone: v.optional(taskZone),
  recurrence: v.optional(v.nullable(recurrence)),
  context: v.optional(v.nullable(fields.context)),
})
export const taskSchema = v.pipe(v.object({
  ...fields,
  id: taskId,
  timezone: taskZone,
  status: v.picklist(['pending', 'completed', 'cancelled']),
  createdAt: taskTime,
  updatedAt: taskTime,
  completedAt: v.optional(taskTime),
  lastNotifiedAt: v.optional(taskTime),
  notifiedFor: v.optional(taskTime),
  delivery: v.optional(v.variant('status', [
    v.object({ status: v.literal('pending'), occurrence: taskTime, retryAt: taskTime }),
    v.object({ status: v.literal('claimed'), occurrence: taskTime, token: taskId, claimedAt: taskTime, leaseUntil: taskTime }),
    v.object({ status: v.literal('delivered'), occurrence: taskTime, deliveredAt: taskTime }),
  ])),
  snoozedUntil: v.optional(taskTime),
  recurrenceAnchor: v.optional(taskTime),
}), v.check(task => !task.dueAt || !task.dueDate), v.check(task => !task.recurrence || Boolean(task.dueAt && task.recurrenceAnchor)), v.check(task => task.type !== 'routine' || Boolean(task.recurrence)))
export const taskState = v.pipe(v.object({ version: v.literal(1), tasks: v.array(taskSchema) }), v.check(state => new Set(state.tasks.map(task => task.id)).size === state.tasks.length), v.check(state => JSON.stringify(state).length <= 128_000))

/** A saved everyday task. Recurring tasks retain their first local occurrence as the calendar anchor. */
export type Task = v.InferOutput<typeof taskSchema>
export type TaskInput = v.InferInput<typeof taskCreate>
export type TaskPatch = v.InferInput<typeof taskUpdate>

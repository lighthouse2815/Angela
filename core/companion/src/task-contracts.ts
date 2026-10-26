import type { Task } from './task-schema'

import * as v from 'valibot'

import { taskCreate, taskId, taskTime, taskUpdate } from './task-schema'

/** Explicit task commands validate at the host boundary and never authorize delivery or memory projection metadata. */
export const taskCommandSchema = v.variant('type', [
  v.strictObject({ type: v.literal('list') }),
  v.strictObject({ type: v.literal('create'), input: taskCreate }),
  v.strictObject({ type: v.literal('update'), id: taskId, changes: taskUpdate }),
  v.strictObject({ type: v.literal('complete'), id: taskId }),
  v.strictObject({ type: v.literal('cancel'), id: taskId }),
  v.strictObject({ type: v.literal('snooze'), id: taskId, until: taskTime }),
])

export type TaskCommand = v.InferInput<typeof taskCommandSchema>

/** A fresh, character-scoped snapshot after persistence. The timezone owns calendar scheduling defaults. */
export interface TaskResponse {
  tasks: Task[]
  timezone: string
  task?: Task
}

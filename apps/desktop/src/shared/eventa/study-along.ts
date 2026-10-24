import type { LocalModelStatus, StudyAlongSettings, StudyAlongSnapshot } from '../study-along'

import { defineInvokeEventa } from '@moeru/eventa'

export const studyAlongGetSettings = defineInvokeEventa<StudyAlongSnapshot>('eventa:invoke:study-along:settings-get')
export const studyAlongSaveSettings = defineInvokeEventa<StudyAlongSnapshot, StudyAlongSettings>('eventa:invoke:study-along:settings-save')
/** The native file picker chooses the model. Renderer input cannot select arbitrary main-process paths. */
export const studyAlongImportModel = defineInvokeEventa<LocalModelStatus, { sha256: string }>('eventa:invoke:study-along:model-import')
export const studyAlongCancelModel = defineInvokeEventa<void>('eventa:invoke:study-along:model-cancel')

export const studyAlongOpenExtension = defineInvokeEventa<void>('eventa:invoke:study-along:extension-folder')

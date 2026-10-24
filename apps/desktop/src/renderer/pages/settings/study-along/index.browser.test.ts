import type { StudyAlongSettings, StudyAlongSnapshot } from '../../../../shared/study-along'

import en from '@angela/i18n/locales/en'

import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import StudyAlongSettingsPage from './index.vue'

import { defaultStudyAlongSettings } from '../../../../shared/study-along'

const ipc = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), importModel: vi.fn(), cancel: vi.fn(), pair: vi.fn(), revoke: vi.fn(), open: vi.fn(), diagnostics: vi.fn() }))
vi.mock('@angela/electron-vueuse', async importOriginal => ({
  ...await importOriginal<typeof import('@angela/electron-vueuse')>(),
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    const id = event.receiveEvent?.id ?? ''
    if (id.includes('settings-get'))
      return ipc.get
    if (id.includes('settings-save'))
      return ipc.save
    if (id.includes('model-import'))
      return ipc.importModel
    if (id.includes('model-cancel'))
      return ipc.cancel
    if (id.includes('browser-pair'))
      return ipc.pair
    if (id.includes('browser-revoke'))
      return ipc.revoke
    if (id.includes('extension-folder'))
      return ipc.open
    if (id.includes('diagnostics'))
      return ipc.diagnostics
    throw new Error(`Unexpected IPC contract: ${id}`)
  },
}))
const key = (suffix: string) => createI18n({ legacy: false, locale: 'en', messages: { en } }).global.t(`tamagotchi.settings.study-along.${suffix}`)
let snapshot: StudyAlongSnapshot
beforeEach(() => {
  vi.resetAllMocks()
  snapshot = {
    settings: { ...defaultStudyAlongSettings },
    providers: [{ id: 'saved-cloud', label: 'Saved audio provider', models: ['whisper-1'], customModel: false, ready: true }],
    model: { state: 'MISSING', progress: 0, sha256: null, error: null },
    browser: { connected: false, paired: false, error: null },
  }
  ipc.get.mockImplementation(async () => structuredClone(snapshot))
  ipc.save.mockImplementation(async (settings: StudyAlongSettings) => ({ ...snapshot, settings }))
  ipc.importModel.mockResolvedValue({ ...snapshot.model, state: 'IMPORTING' })
})

async function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/settings/providers', component: { template: '<div />' } }] })
  await router.push('/')
  await router.isReady()
  const screen = await render(StudyAlongSettingsPage, { global: { plugins: [createPinia(), router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })] } })
  onTestFinished(() => screen.unmount())
  await expect.element(page.getByRole('button', { name: key('save'), exact: true })).toBeEnabled()
}

describe('study Along desktop settings', () => {
  it('saves an enabled local source without granting cloud audio permission', async () => {
    await mountPage()
    await page.getByRole('combobox', { name: key('audio-source') }).click()
    await page.getByRole('option', { name: key('mode-local'), exact: true }).click()
    await page.getByRole('button', { name: key('save'), exact: true }).click()
    await vi.waitFor(() => expect(ipc.save).toHaveBeenCalledWith({ ...defaultStudyAlongSettings, transcriptionMode: 'local' }))
    expect(ipc.importModel).not.toHaveBeenCalled()
    await expect.element(page.getByText(key('saved'), { exact: true })).toBeVisible()
  })

  it('requires an explicit upload toggle for a saved cloud source', async () => {
    snapshot.settings = { ...defaultStudyAlongSettings, transcriptionMode: 'cloud', cloudProviderId: 'saved-cloud', cloudModel: 'whisper-1' }
    await mountPage()
    const upload = page.getByRole('switch', { name: key('allow-upload') })
    await expect.element(upload).not.toBeChecked()
    await page.getByRole('button', { name: key('save'), exact: true }).click()
    expect(ipc.save).toHaveBeenLastCalledWith(expect.objectContaining({ allowCloudAudioUpload: false }))
    await upload.click()
    await page.getByRole('button', { name: key('save'), exact: true }).click()
    await vi.waitFor(() => expect(ipc.save).toHaveBeenLastCalledWith(expect.objectContaining({ allowCloudAudioUpload: true })))
    expect(JSON.stringify(ipc.save.mock.calls)).not.toMatch(/apiKey|Authorization/u)
  })

  it('requires a checksum and uses the native file picker contract without a filesystem path', async () => {
    await mountPage()
    const install = page.getByRole('button', { name: key('model-import'), exact: true })
    await expect.element(install).toBeDisabled()
    await page.getByRole('textbox', { name: key('checksum') }).fill('a'.repeat(64))
    await install.click()
    await vi.waitFor(() => expect(ipc.importModel).toHaveBeenCalledWith({ sha256: 'a'.repeat(64) }))
    expect(ipc.get.mock.calls.length).toBeGreaterThan(1)
  })

  it('reports persistence failure without claiming settings were saved', async () => {
    ipc.save.mockRejectedValue(new Error('Invalid timestamp-capable model'))
    await mountPage()
    await page.getByRole('button', { name: key('save'), exact: true }).click()
    await expect.element(page.getByRole('alert')).toHaveTextContent('Invalid timestamp-capable model')
    await expect.element(page.getByText(key('saved'), { exact: true })).not.toBeInTheDocument()
  })
})

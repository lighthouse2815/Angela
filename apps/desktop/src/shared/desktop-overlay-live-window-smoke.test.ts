import { describe, expect, it } from 'vitest'

import { resolveDesktopOverlaySmokeExecutor, selectDesktopOverlaySmokeCandidateId } from './desktop-overlay-live-window-smoke'

describe('selectDesktopOverlaySmokeCandidateId', () => {
  it('prefers the smoke button label', () => {
    const candidateId = selectDesktopOverlaySmokeCandidateId({
      lastGroundingSnapshot: {
        targetCandidates: [
          { id: 'first', label: 'Something else', role: 'link', source: 'chrome_dom' },
          { id: 'smoke', label: 'Angela Desktop Overlay Smoke Button', role: 'button', source: 'chrome_dom' },
        ],
      },
    })

    expect(candidateId).toBe('smoke')
  })

  it('requires the smoke button to come from chrome_dom', () => {
    expect(() => {
      selectDesktopOverlaySmokeCandidateId({
        lastGroundingSnapshot: {
          targetCandidates: [
            { id: 'ax-smoke', label: 'Angela Desktop Overlay Smoke Button', role: 'button', source: 'ax' },
          ],
        },
      })
    }).toThrow('desktop_observe did not return the Angela Desktop Overlay Smoke Button chrome_dom candidate')
  })

  it('fails when the smoke label is missing', () => {
    expect(() => {
      selectDesktopOverlaySmokeCandidateId({
        lastGroundingSnapshot: {
          targetCandidates: [
            { id: 'first', label: 'Alpha', role: 'link' },
            { id: 'second', label: 'Beta', role: 'button' },
          ],
        },
      })
    }).toThrow('desktop_observe did not return the Angela Desktop Overlay Smoke Button chrome_dom candidate')
  })

  it('throws when no candidate ids exist', () => {
    expect(() => {
      selectDesktopOverlaySmokeCandidateId({
        lastGroundingSnapshot: {
          targetCandidates: [{ label: 'Missing id', role: 'button' }],
        },
      })
    }).toThrow('desktop_observe did not return the Angela Desktop Overlay Smoke Button chrome_dom candidate')
  })
})

describe('live smoke executor prerequisites', () => {
  it('accepts the local executor only on macOS', () => {
    expect(resolveDesktopOverlaySmokeExecutor({}, 'darwin')).toBe('macos-local')
    expect(() => resolveDesktopOverlaySmokeExecutor({}, 'linux')).toThrow('SMOKE_HOST_UNSUPPORTED')
    expect(() => resolveDesktopOverlaySmokeExecutor({}, 'win32')).toThrow('SMOKE_HOST_UNSUPPORTED')
  })

  it('requires a configured remote host for Linux X11', () => {
    expect(() => resolveDesktopOverlaySmokeExecutor({ COMPUTER_USE_SMOKE_EXECUTOR: 'linux-x11' }, 'linux')).toThrow('SMOKE_HOST_UNCONFIGURED')
    expect(resolveDesktopOverlaySmokeExecutor({
      COMPUTER_USE_SMOKE_EXECUTOR: 'linux-x11',
      COMPUTER_USE_REMOTE_SSH_HOST: 'test.example',
      COMPUTER_USE_REMOTE_SSH_USER: 'test-user',
    }, 'linux')).toBe('linux-x11')
  })

  it('honors the smoke-specific setting and rejects dry runs as live evidence', () => {
    expect(resolveDesktopOverlaySmokeExecutor({ COMPUTER_USE_SMOKE_EXECUTOR: 'macos-local', COMPUTER_USE_EXECUTOR: 'dry-run' }, 'darwin')).toBe('macos-local')
    expect(() => resolveDesktopOverlaySmokeExecutor({ COMPUTER_USE_EXECUTOR: 'dry-run' }, 'darwin')).toThrow('SMOKE_EXECUTOR_INVALID')
  })
})

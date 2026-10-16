import { PassThrough } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { Output } from './output'

afterEach(() => vi.useRealTimers())

function render(tty = false) {
  const stdout = Object.assign(new PassThrough(), { isTTY: tty })
  const stderr = Object.assign(new PassThrough(), { isTTY: tty, columns: 80 })
  let answer = ''
  let progress = ''
  stdout.on('data', chunk => answer += chunk)
  stderr.on('data', chunk => progress += chunk)
  return { output: new Output(cliMessages.vi, stdout, stderr), answer: () => answer, progress: () => progress }
}

it('shows activity without printing reasoning tokens or polluting piped answers', () => {
  const { output, answer, progress } = render()
  output.start()
  output.event({ type: 'reasoning-delta', text: 'private reasoning tokens' })
  output.event({ type: 'text-delta', text: 'Xin ' })
  output.event({ type: 'text-delta', text: 'chào' })
  output.stop()
  expect(answer()).toBe('Xin chào\n')
  expect(progress()).toContain('Đang suy nghĩ')
  expect(progress()).not.toContain('private reasoning')
  expect(progress()).not.toContain('\u001B')
})

it('clears the interactive display and separates agent replies from the user prompt', () => {
  const { output, answer, progress } = render(true)
  output.intro()
  expect(progress()).toContain('\u001B[3J')
  expect(progress()).toContain('◕ ◕')
  expect(progress()).toContain('ANGELA')
  expect(output.prompt()).toContain('\u001B[32m')
  output.start()
  output.event({ type: 'text-delta', text: 'Xin ' })
  output.event({ type: 'text-delta', text: 'chào' })
  output.stop()
  expect(answer()).toContain('\u001B[36m')
  expect(stripVTControlCharacters(answer())).toBe('✦ Angela\nXin chào\n')
  output.start()
  output.event({ type: 'text-delta', text: 'Một lượt mới' })
  output.stop()
  expect(stripVTControlCharacters(answer()).match(/✦ Angela/g)).toHaveLength(2)
})

it('keeps redirected output free of banners, screen clearing, and color codes', () => {
  const { output, answer, progress } = render()
  output.intro()
  expect(progress()).toBe('')
  expect(output.prompt()).toBe('> ')
  output.start()
  output.event({ type: 'text-delta', text: 'Plain answer' })
  output.stop()
  expect(answer()).toBe('Plain answer\n')
  expect(progress()).not.toContain('\u001B')
})

// Tool discovery previously printed every schema as a serialized stream event.
it('summarizes discovery without dumping the tool schemas', () => {
  const { output, progress } = render()
  output.start()
  output.event({ type: 'tool-call', toolCallId: 'list', toolName: 'builtIn_mcpListTools', toolCallType: 'function', args: '{}' })
  output.event({ type: 'tool-result', toolCallId: 'list', result: JSON.stringify([{ name: 'terminal_exec', inputSchema: { properties: { privateSchemaField: {} } } }]) })
  output.stop()
  expect(progress()).toContain('✓ Đang tìm công cụ')
  expect(progress()).not.toContain('inputSchema')
  expect(progress()).not.toContain('privateSchemaField')
})

it('correlates parallel results and detects command failures inside successful MCP envelopes', () => {
  const { output, progress } = render()
  output.start()
  for (const [id, name] of [['first', 'terminal_exec'], ['second', 'pty_read']])
    output.event({ type: 'tool-call', toolCallId: id, toolName: 'builtIn_mcpCallTool', toolCallType: 'function', args: JSON.stringify({ name }) })
  output.event({ type: 'tool-result', toolCallId: 'second', result: JSON.stringify({ content: [{ type: 'text', text: 'Ready' }] }) })
  output.event({ type: 'tool-result', toolCallId: 'first', result: JSON.stringify({
    content: [{ type: 'text', text: 'Internal description' }],
    structuredContent: { launchContext: { privateMetadata: true }, backendResult: { stdout: '', stderr: 'Permission denied', exitCode: 1 } },
  }) })
  output.stop()
  expect(progress()).toContain('✓ pty_read: Đã xong')
  expect(progress()).toContain('✗ terminal_exec: Thất bại')
  expect(progress()).toContain('Mã thoát: 1')
  expect(progress()).toContain('Permission denied')
  expect(progress()).not.toContain('privateMetadata')
  expect(progress()).not.toContain('Internal description')
})

it('bounds tool output and keeps actionable errors visible', () => {
  const { output, progress } = render()
  output.start()
  output.event({ type: 'tool-call', toolCallId: 'call', toolName: 'read', toolCallType: 'function', args: '{}' })
  output.event({ type: 'tool-result', toolCallId: 'call', result: JSON.stringify({ content: [{ type: 'text', text: 'a'.repeat(5000) }] }) })
  output.event({ type: 'tool-error', toolCallId: 'error', isError: true, result: 'Connection closed' })
  output.stop()
  expect(progress()).toContain('Đã rút gọn đầu ra')
  expect(progress()).not.toContain('a'.repeat(601))
  expect(progress()).toContain('Connection closed')
  expect(progress()).toContain('Thất bại')
})

it('shows the full pending action without dumping unrelated approval metadata', () => {
  const { output, progress } = render()
  const command = `printf '%s' '${'content'.repeat(200)}' > test.txt`
  output.start()
  output.approval({ name: 'desktop_approve_pending_action', arguments: {
    id: 'pending-id',
    pending: { action: { kind: 'terminal_exec', input: { command, cwd: '/workspace' } }, context: { privateMetadata: true } },
  } })
  output.decided(true)
  output.stop()
  expect(progress()).toContain(command)
  expect(progress()).toContain('cwd: /workspace')
  expect(progress()).toContain('Đang chạy công cụ: terminal_exec')
  expect(progress()).not.toContain('privateMetadata')
  expect(progress()).not.toContain('desktop_approve_pending_action')
})

it('shows every custom tool argument and resumes output after denied approval', () => {
  const { output, progress, answer } = render()
  output.start()
  output.approval({ name: 'custom_tool', arguments: { pending: { action: { kind: 'another_tool', input: {} } }, target: '/workspace/file' } })
  output.event({ type: 'text-delta', text: 'The tool was denied.' })
  expect(answer()).toBe('')
  output.decided(false)
  output.stop()
  expect(progress()).toContain('Công cụ: custom_tool')
  expect(progress()).toContain('target: /workspace/file')
  expect(progress()).toContain('another_tool')
  expect(answer()).toBe('The tool was denied.\n')
})

it('pauses the TTY spinner for approval and answers, then cleans it up on failure', () => {
  vi.useFakeTimers()
  const { output, answer, progress } = render(true)
  output.start()
  vi.advanceTimersByTime(1200)
  expect(progress()).toContain('(1s)')
  output.approval({ name: 'terminal_exec', arguments: { command: 'pwd' } })
  const waiting = progress()
  output.event({ type: 'reasoning-delta', text: 'Still waiting' })
  output.event({ type: 'tool-error', toolCallId: 'parallel', isError: true, result: 'Parallel tool failed' })
  vi.advanceTimersByTime(1000)
  expect(progress()).toBe(waiting)
  output.decided(true)
  expect(progress()).toContain('Parallel tool failed')
  expect(vi.getTimerCount()).toBe(1)
  output.event({ type: 'text-delta', text: 'Done' })
  expect(vi.getTimerCount()).toBe(0)
  output.stop()
  expect(answer()).toBe('Done\n')
  output.start()
  expect(() => output.event({ type: 'error', error: new Error('Failed') })).toThrow('Failed')
  output.stop()
  expect(vi.getTimerCount()).toBe(0)
})

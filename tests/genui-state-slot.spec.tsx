// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GenuiBlock } from '../src/client/GenuiBlock.tsx'
import { GenuiActionContext } from '../src/client/action-context.ts'
import { renderGenuiFence } from '../src/client/fence-render.tsx'
import { repairGenuiSpec } from '../src/client/guard.ts'
import {
  fenceStateKey, loadBlockState, panelSlotKey, saveBlockState, slotOfStateKey, stateSlotKey, toolStateKey,
} from '../src/client/interaction-store.ts'

const source = { id: 'assistant:7:fence:0', order: [7, 0, 0] as const }

function inputSpec(slot: string | undefined, extra: Record<string, unknown> = {}) {
  return repairGenuiSpec({
    ...(slot === undefined ? {} : { state: slot }),
    ...(extra.title === undefined ? {} : { title: extra.title }),
    items: [
      { type: 'input', id: 'name', label: '姓名' },
      { type: 'text', content: '说明' },
    ],
  })!
}

function renderFence(spec: unknown, sessionId = 's1') {
  const raw = JSON.stringify(spec)
  return render(
    <GenuiActionContext.Provider value={() => {}}>
      {renderGenuiFence(raw, 0, { sessionId, source })}
    </GenuiActionContext.Provider>,
  )
}

function fieldValue(): string {
  return (screen.getByRole('textbox', { name: '姓名' }) as HTMLInputElement).value
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

describe('cross-turn state slots', () => {
  it('restores a slot value even when the spec content changed', () => {
    const first = inputSpec('profile')
    renderFence(first)
    fireEvent.change(screen.getByRole('textbox', { name: '姓名' }), { target: { value: 'Alice' } })
    act(() => { vi.advanceTimersByTime(300) })

    // The next turn renders NEW content under the SAME slot.
    cleanup()
    const second = inputSpec('profile', { title: '第二步' })
    renderFence(second)
    expect(fieldValue()).toBe('Alice')
  })

  it('does not leak state between different slots', () => {
    renderFence(inputSpec('profile'))
    fireEvent.change(screen.getByRole('textbox', { name: '姓名' }), { target: { value: 'Alice' } })
    act(() => { vi.advanceTimersByTime(300) })

    cleanup()
    renderFence(inputSpec('other'))
    expect(fieldValue()).toBe('')
  })

  it('keeps the legacy fingerprint behavior when no slot is declared', () => {
    renderFence(inputSpec(undefined))
    fireEvent.change(screen.getByRole('textbox', { name: '姓名' }), { target: { value: 'Alice' } })
    act(() => { vi.advanceTimersByTime(300) })

    cleanup()
    // Different content, no slot → a fresh interaction lifetime.
    renderFence(inputSpec(undefined, { title: '新内容' }))
    expect(fieldValue()).toBe('')
  })

  it('writes the content fingerprint alongside slot state', () => {
    const spec = inputSpec('profile')
    renderFence(spec)
    fireEvent.change(screen.getByRole('textbox', { name: '姓名' }), { target: { value: 'Alice' } })
    act(() => { vi.advanceTimersByTime(300) })

    const stored = loadBlockState(stateSlotKey('s1', 'profile'))
    expect(stored?.fields?.name).toBe('Alice')
    expect(typeof stored?.content).toBe('string')
    expect(stored?.content).not.toBe('')
  })

  it('restores a grading lock only when the content fingerprint matches', () => {
    const quizSpec = repairGenuiSpec({
      items: [{ type: 'radio', label: '题目', group: 'q1', options: ['A 选项', 'B 选项'] }],
    })!

    const staleKey = stateSlotKey('s1', 'quiz-stale')
    saveBlockState(staleKey, { locked: true, content: 'old-content' })
    const stale = render(<GenuiBlock spec={quizSpec} stateKey={staleKey} stateContent="new-content" />)
    // A stale lock must not survive a new paper.
    expect((screen.getByRole('radio', { name: 'A 选项' }) as HTMLInputElement).disabled).toBe(false)
    stale.unmount()

    const sameKey = stateSlotKey('s1', 'quiz-same')
    saveBlockState(sameKey, { locked: true, content: 'same-content' })
    render(<GenuiBlock spec={quizSpec} stateKey={sameKey} stateContent="same-content" />)
    // Same content: the graded paper stays locked.
    expect((screen.getByRole('radio', { name: 'A 选项' }) as HTMLInputElement).disabled).toBe(true)
  })
})

describe('spec.state guard', () => {
  it('keeps a valid slot name through repair', () => {
    expect(repairGenuiSpec({ state: 'order-filter', items: [{ type: 'text', content: 'x' }] })?.state).toBe('order-filter')
  })

  it('drops an invalid slot name (falls back to the legacy key)', () => {
    expect(repairGenuiSpec({ state: 'has space', items: [{ type: 'text', content: 'x' }] })?.state).toBeUndefined()
    expect(repairGenuiSpec({ state: 'a/b', items: [{ type: 'text', content: 'x' }] })?.state).toBeUndefined()
    expect(repairGenuiSpec({ state: 'x'.repeat(65), items: [{ type: 'text', content: 'x' }] })?.state).toBeUndefined()
  })
})

describe('slot key helpers', () => {
  it('builds distinct keys per surface', () => {
    expect(stateSlotKey('s1', 'profile')).toBe('s:s1:profile')
    expect(toolStateKey('s1', 'call-1', 'profile')).toBe('s:s1:profile')
    expect(toolStateKey('s1', 'call-1')).toBe('t:s1:call-1')
    expect(panelSlotKey('s1', 'profile')).toBe('p:s1:slot:profile')
  })

  it('extracts the slot from a slot key only', () => {
    expect(slotOfStateKey('s:s1:profile')).toBe('profile')
    expect(slotOfStateKey('t:s1:call-1')).toBeUndefined()
    expect(slotOfStateKey(fenceStateKey('s1', 'fence', 'raw'))).toBeUndefined()
  })
})

// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearSession, clearSlot, listSlots, readSlot, sanitizeSlotState, sessionPathFor, validSessionId, validSlot, writeSlot,
} from '../src/plugin/state-store.ts'

let root: string
let env: NodeJS.ProcessEnv

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-genui-state-'))
  env = { ...process.env, DSH_GENUI_STATE_DIR: root }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('genui state store', () => {
  it('round-trips a slot and lists newest first', async () => {
    await writeSlot('session-1', 'profile', { fields: { name: 'Alice' } }, 'fp-1', env)
    await writeSlot('session-1', 'cart', { answers: { q1: 'A' } }, undefined, env)

    const profile = await readSlot('session-1', 'profile', env)
    expect(profile?.state.fields?.name).toBe('Alice')
    expect(profile?.content).toBe('fp-1')

    const slots = await listSlots('session-1', env)
    expect(slots.map(s => s.slot)).toEqual(['cart', 'profile'])
  })

  it('isolates sessions', async () => {
    await writeSlot('session-1', 'profile', { fields: { name: 'Alice' } }, undefined, env)
    expect(await readSlot('session-2', 'profile', env)).toBeNull()
    expect(sessionPathFor('session-1', env)).not.toBe(sessionPathFor('session-2', env))
  })

  it('clears one slot and the whole session', async () => {
    await writeSlot('session-1', 'a', { fields: { x: '1' } }, undefined, env)
    await writeSlot('session-1', 'b', { fields: { y: '2' } }, undefined, env)
    await clearSlot('session-1', 'a', env)
    expect(await readSlot('session-1', 'a', env)).toBeNull()
    expect(await readSlot('session-1', 'b', env)).not.toBeNull()

    await clearSession('session-1', env)
    expect(await listSlots('session-1', env)).toEqual([])
  })

  it('rejects unsafe identifiers before touching the filesystem', async () => {
    expect(validSessionId('../escape')).toBe(false)
    expect(validSessionId('ok-session_1')).toBe(true)
    expect(validSlot('has space')).toBe(false)
    expect(validSlot('ok.slot_1')).toBe(true)
    await expect(writeSlot('../escape', 'slot', {}, undefined, env)).rejects.toThrow()
    expect(await readSlot('../escape', 'slot', env)).toBeNull()
  })

  it('bounds the number of slots per session (oldest evicted)', async () => {
    for (let i = 0; i < 66; i++) {
      await writeSlot('session-1', `slot-${i}`, { fields: { i: String(i) } }, undefined, env)
      // Ensure distinct timestamps for deterministic eviction.
      await new Promise(resolve => setTimeout(resolve, 2))
    }
    const slots = await listSlots('session-1', env)
    expect(slots.length).toBe(64)
    expect(slots.some(s => s.slot === 'slot-0')).toBe(false)
    expect(slots.some(s => s.slot === 'slot-65')).toBe(true)
  })

  it('sanitizes untrusted payloads and drops non-string values', () => {
    expect(sanitizeSlotState(null)).toBeNull()
    expect(sanitizeSlotState('nope')).toBeNull()
    expect(sanitizeSlotState({ answers: { q1: 'A', q2: 3 }, fields: { name: 'Alice' }, locked: true })).toEqual({
      answers: { q1: 'A' },
      fields: { name: 'Alice' },
      locked: true,
    })
    expect(sanitizeSlotState({ multiAnswers: { styles: ['a', 1, 'b'] } })).toEqual({ multiAnswers: { styles: ['a', 'b'] } })
  })
})

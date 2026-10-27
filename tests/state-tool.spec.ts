// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGenuiStateTool } from '../src/plugin/state-tool.ts'
import { writeSlot } from '../src/plugin/state-store.ts'

let root: string
let previous: string | undefined

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-genui-state-tool-'))
  previous = process.env.DSH_GENUI_STATE_DIR
  process.env.DSH_GENUI_STATE_DIR = root
})

afterEach(async () => {
  if (previous === undefined) delete process.env.DSH_GENUI_STATE_DIR
  else process.env.DSH_GENUI_STATE_DIR = previous
  await rm(root, { recursive: true, force: true })
})

const exec = (sessionId: string) => ({ agent: { sessionId } }) as never

async function run(args: Record<string, unknown>, sessionId = 'session-1'): Promise<Record<string, unknown>> {
  const tool = createGenuiStateTool()
  const value = await tool.execute(args, exec(sessionId))
  return JSON.parse(String(value)) as Record<string, unknown>
}

describe('genui_state tool', () => {
  it('reads the slot the user last touched', async () => {
    await writeSlot('session-1', 'profile', { fields: { name: 'Alice' }, answers: { q1: 'A' } }, 'fp')

    const result = await run({ action: 'get', slot: 'profile' })
    expect(result).toMatchObject({
      ok: true,
      slot: 'profile',
      found: true,
      state: { fields: { name: 'Alice' }, answers: { q1: 'A' } },
    })
  })

  it('reports a missing slot without failing', async () => {
    expect(await run({ action: 'get', slot: 'nope' })).toEqual({ ok: true, slot: 'nope', found: false })
  })

  it('lists every slot of the session', async () => {
    await writeSlot('session-1', 'a', { fields: { x: '1' } })
    await writeSlot('session-1', 'b', { answers: { q1: 'B' } })
    const result = await run({ action: 'list' })
    expect(result.ok).toBe(true)
    expect((result.slots as Array<{ slot: string }>).map(s => s.slot).sort()).toEqual(['a', 'b'])
  })

  it('sets and clears a slot', async () => {
    expect(await run({ action: 'set', slot: 'profile', state: { fields: { name: 'Bob' } } })).toMatchObject({ ok: true })
    expect(await run({ action: 'get', slot: 'profile' })).toMatchObject({ found: true, state: { fields: { name: 'Bob' } } })

    expect(await run({ action: 'clear', slot: 'profile' })).toMatchObject({ ok: true, cleared: true })
    expect(await run({ action: 'get', slot: 'profile' })).toMatchObject({ found: false })
  })

  it('never crosses sessions', async () => {
    await writeSlot('session-1', 'profile', { fields: { name: 'Alice' } })
    expect(await run({ action: 'get', slot: 'profile' }, 'session-2')).toMatchObject({ found: false })
  })

  it('rejects invalid input with stable error codes', async () => {
    expect(await run({ action: 'get', slot: 'bad slot' })).toMatchObject({ ok: false, error: 'invalid_slot' })
    expect(await run({ action: 'set', slot: 'ok', state: 'nope' })).toMatchObject({ ok: false, error: 'invalid_state' })
    expect(await run({ action: 'dance' })).toMatchObject({ ok: false, error: 'invalid_action' })
  })
})

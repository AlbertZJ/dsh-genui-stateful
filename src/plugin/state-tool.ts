/**
 * The `genui_state` tool: the model's side of cross-turn UI state.
 *
 * The browser keeps the authoritative copy for rendering; this tool exposes
 * the same slots the user touched so the NEXT Agent turn can continue from
 * their choices instead of asking again. Plain `ToolDefinition` object with
 * JSON Schema arguments — the node half takes no harness runtime import, only
 * types.
 * @module dsh-genui-stateful/plugin/state-tool
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { JsonSchemaNode, ToolDefinition } from '@deepseek-ai/dsh-tools'
import { clearSlot, listSlots, readSlot, sanitizeSlotState, validSlot, writeSlot } from './state-store.ts'

const STATE_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['list', 'get', 'set', 'clear'],
      description: 'list: every slot of this session; get: one slot; set: overwrite a slot; clear: forget a slot.',
    },
    slot: {
      type: 'string',
      description: 'Slot name (1-64 chars, [A-Za-z0-9._-]). Required for get/set/clear.',
    },
    state: {
      type: 'object',
      description: 'For set: { answers?, multiAnswers?, fields?, locked? } — the same shape the UI reports on submit.',
    },
    content: {
      type: 'string',
      description: 'For set: optional content fingerprint of the spec this state belongs to (normally not needed; the browser maintains it).',
    },
  },
  required: ['action'],
  additionalProperties: false,
}

const STATE_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'string',
  description: 'JSON envelope: { ok, ... } with slots/state, or a stable error code.',
}

const DESCRIPTION = [
  'Read or clear the cross-turn state slots of the interactive GenUI surfaces in THIS session.',
  'A spec with a top-level `"state": "<slot>"` keeps the user\'s choices (radio/checkbox/submit answers and input values) across Agent turns.',
  'Before answering a follow-up that continues a previous interactive UI, call `genui_state {action:"get", slot:"<slot>"}` and reuse the returned values instead of asking the user again.',
  'Never call this tool for secrets: password fields are not synced to the host.',
  'Returns compact JSON; an empty result means the user has not interacted yet.',
].join(' ')

function envelope(value: Record<string, unknown>): JsonValue {
  return JSON.stringify(value) as unknown as JsonValue
}

function sessionOf(exec: { agent?: { sessionId?: unknown } }): string | undefined {
  const sessionId = exec.agent?.sessionId
  return typeof sessionId === 'string' ? sessionId : undefined
}

export function createGenuiStateTool(): ToolDefinition {
  return {
    name: 'genui_state',
    description: DESCRIPTION,
    parameters: STATE_PARAMETERS,
    output: {
      schema: STATE_OUTPUT_SCHEMA,
      render(_args: unknown, value: JsonValue): ContentBlock[] {
        return [{ type: 'text', text: String(value) }]
      },
    },
    async execute(args: unknown, exec): Promise<JsonValue> {
      const sessionId = sessionOf(exec as { agent?: { sessionId?: unknown } })
      if (sessionId === undefined) return envelope({ ok: false, error: 'no_session' })
      if (typeof args !== 'object' || args === null) return envelope({ ok: false, error: 'invalid_arguments' })
      const record = args as Record<string, unknown>
      const action = record.action

      if (action === 'list') {
        const slots = await listSlots(sessionId)
        return envelope({
          ok: true,
          slots: slots.map(({ slot, stored }) => ({
            slot,
            answers: stored.state.answers ?? {},
            multiAnswers: stored.state.multiAnswers ?? {},
            fields: stored.state.fields ?? {},
            locked: stored.state.locked === true,
            updatedAt: stored.updatedAt,
          })),
        })
      }

      if (action === 'get') {
        if (!validSlot(record.slot)) return envelope({ ok: false, error: 'invalid_slot' })
        const stored = await readSlot(sessionId, record.slot)
        return stored === null
          ? envelope({ ok: true, slot: record.slot, found: false })
          : envelope({
            ok: true,
            slot: record.slot,
            found: true,
            state: stored.state,
            ...(stored.content === undefined ? {} : { content: stored.content }),
            updatedAt: stored.updatedAt,
          })
      }

      if (action === 'set') {
        if (!validSlot(record.slot)) return envelope({ ok: false, error: 'invalid_slot' })
        const state = sanitizeSlotState(record.state)
        if (state === null) return envelope({ ok: false, error: 'invalid_state' })
        const content = typeof record.content === 'string' && record.content !== '' ? record.content : undefined
        await writeSlot(sessionId, record.slot, state, content)
        return envelope({ ok: true, slot: record.slot, written: true })
      }

      if (action === 'clear') {
        if (!validSlot(record.slot)) return envelope({ ok: false, error: 'invalid_slot' })
        await clearSlot(sessionId, record.slot)
        return envelope({ ok: true, slot: record.slot, cleared: true })
      }

      return envelope({ ok: false, error: 'invalid_action' })
    },
  }
}

/**
 * Cross-turn GenUI state slots, persisted on the HOST.
 *
 * The browser already keeps a local copy (localStorage) so the UI restores
 * itself; this store exists for the MODEL: the `genui_state` tool reads the
 * same slot the user was interacting with, so the next Agent turn can answer
 * with the user's actual choices instead of asking again.
 *
 * Scope: one JSON file per session under `<root>/genui-state/`. Records stay
 * small (answer maps + touched field values), bounded by the same limits the
 * browser store uses, and secret fields never reach the host at all — the
 * client strips them before syncing.
 *
 * Deliberately dependency-free (node:fs + node:path): an external plugin's
 * host half must not depend on the harness module graph at runtime.
 * @module dsh-genui-stateful/plugin/state-store
 */
/** Durable interaction state of one slot (mirrors the browser contract). */
export interface SlotState {
    /** group → chosen option label (radio aggregation answers). */
    answers?: Record<string, string>;
    /** group → selected source labels (checkbox groups). */
    multiAnswers?: Record<string, string[]>;
    /** True after local grading. */
    locked?: boolean;
    /** field id → current value (non-secret fields only). */
    fields?: Record<string, string>;
}
/** One stored slot with its content fingerprint and timestamp. */
export interface StoredSlot {
    state: SlotState;
    /** Fingerprint of the spec the state was written against. */
    content?: string;
    updatedAt: number;
}
/** Refuse absurd payloads before parsing them. */
export declare const MAX_STATE_BODY_BYTES: number;
/** Default root; `DSH_GENUI_STATE_DIR` overrides it (tests, custom homes). */
export declare function stateRoot(env?: NodeJS.ProcessEnv): string;
export declare function validSessionId(sessionId: unknown): sessionId is string;
export declare function validSlot(slot: unknown): slot is string;
/** Read one slot, or null when unknown. */
export declare function readSlot(sessionId: string, slot: string, env?: NodeJS.ProcessEnv): Promise<StoredSlot | null>;
/** All slots of a session, newest first. */
export declare function listSlots(sessionId: string, env?: NodeJS.ProcessEnv): Promise<Array<{
    slot: string;
    stored: StoredSlot;
}>>;
/** Upsert one slot; LRU-evicts the oldest entries beyond MAX_SLOTS. */
export declare function writeSlot(sessionId: string, slot: string, state: SlotState, content?: string, env?: NodeJS.ProcessEnv): Promise<void>;
/** Delete one slot (no-op when absent). */
export declare function clearSlot(sessionId: string, slot: string, env?: NodeJS.ProcessEnv): Promise<void>;
/** Normalize an untrusted slot payload from the wire/tool arguments. */
export declare function sanitizeSlotState(value: unknown): SlotState | null;
/** Test seam: remove the whole session file. */
export declare function clearSession(sessionId: string, env?: NodeJS.ProcessEnv): Promise<void>;
/** Test seam: the directory a session file lands in. */
export declare function sessionPathFor(sessionId: string, env?: NodeJS.ProcessEnv): string;

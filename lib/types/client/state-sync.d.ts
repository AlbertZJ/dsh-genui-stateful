/**
 * Browser → host sync for cross-turn state SLOTS.
 *
 * Rendering is local-first: the browser store already restores the UI. This
 * module mirrors slot snapshots to the host so the MODEL can read them with
 * the `genui_state` tool on the next turn. Sync is best-effort and debounced
 * (typing fires per keystroke); a failed POST never affects the UI.
 *
 * Only slots named by `spec.state` sync — legacy fingerprint-keyed blocks
 * stay purely local.
 * @module dsh-genui-stateful/client/state-sync
 */
import type { BlockInteractionState } from './interaction-store.ts';
/**
 * A STABLE observer for one slot. GenuiBlock compares callbacks by identity,
 * so building a fresh closure per render would re-fire the snapshot effect.
 */
export declare function slotObserver(sessionId: string, slot: string): (state: BlockInteractionState) => void;
/** Flush every pending write immediately (tests, unload handlers). */
export declare function flushSlotSync(): void;
/** Drop cached observers/sent payloads (tests, session teardown). */
export declare function resetSlotSync(): void;

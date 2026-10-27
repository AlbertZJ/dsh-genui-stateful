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
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
export declare function createGenuiStateTool(): ToolDefinition;

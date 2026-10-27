# dsh-genui-stateful

**Stateful GenUI for DeepSeek Harness** — the community `dsh-ui` fence renderer
with **cross-turn state slots**: the user's choices and inputs survive into the
next Agent turn, and the model can read them back.

A fork of [`omdsh-dev/dsh-genui`](https://github.com/omdsh-dev/dsh-genui) v0.15.0
(MIT). Upstream persists interaction state per *content fingerprint* — replaying
the same UI restores it, but a new reply with new content starts from zero. This
fork adds a model-declared **state slot** that outlives content changes.

## What is new

| Capability | Upstream | This fork |
| --- | --- | --- |
| State survives refresh / session reopen | ✅ same content only | ✅ same content |
| State survives a NEW reply (cross-turn) | ❌ resets | ✅ by `state` slot |
| Model can read the user's last choices | ❌ | ✅ `genui_state` tool |
| Stale grading lock on new content | n/a (new key) | ✅ lock restores only on identical content |
| Password values reach the host | — | ❌ never synced |

## Quick start

```sh
# From npm (once published)
dsh plugin --profile web add dsh-genui-stateful

# Or straight from GitHub (the repo is private: git/pnpm must already be
# authenticated, e.g. via `gh auth setup-git` or a stored credential)
dsh plugin --profile web add github:AlbertZJ/dsh-genui-stateful
```

Restart the DSH web service and hard-refresh the browser. The rest of the
fence vocabulary, components, panels, actions and the bundled `genui` skill are
unchanged from upstream.

## Cross-turn state in practice

Turn 1 — the model renders an interactive surface with a slot:

```json
{
  "state": "order-filter",
  "items": [
    { "type": "select", "id": "region", "label": "区域", "options": ["华东", "华南"] },
    { "type": "slider", "id": "minAmount", "label": "最低金额", "min": 0, "max": 100000, "value": 0 },
    { "type": "button", "label": "开始筛选", "action": "filter" }
  ]
}
```

The user picks 华南 and drags the slider to 50000.

Turn 2 — the model reads the slot before answering:

```
genui_state { "action": "get", "slot": "order-filter" }
→ { "ok": true, "found": true, "state": { "fields": { "region": "华南", "minAmount": "50000" } } }
```

Then renders a new spec under the same `state` — the controls are already
filled with the user's values, and the model answers with the right data.

Slot values that no longer exist in the current spec are dropped, so the new
surface can grow or shrink freely. Radio/checkbox answers, input/textarea
values, select/slider values and the local grading lock all participate.

## Tool: `genui_state`

| Action | Arguments | Result |
| --- | --- | --- |
| `list` | — | every slot of this session, newest first |
| `get` | `slot` | the slot state, or `found: false` |
| `set` | `slot`, `state` | overwrite a slot (normally unnecessary) |
| `clear` | `slot` | forget a slot |

State is stored on the host per session under `~/.dsh/genui-state/`
(override with `DSH_GENUI_STATE_DIR`). The browser keeps its own local copy
for rendering; the host copy exists so the model can read it.

Set `"stateTool": false` in the plugin config to skip tool registration — the
UI still restores cross-turn, the model just cannot read it.

## Security notes

- Password/secret fields are stripped in the browser before any sync and never
  reach the host or the model.
- Slot names are restricted to `[A-Za-z0-9._-]{1,64}`; session ids are validated
  before they become file names.
- The state route accepts bounded JSON bodies (64 KiB) and rejects unknown
  shapes; the tool returns stable error codes.
- Rendering remains declarative: no model-authored code is executed.

## Development

```sh
pnpm install
pnpm test
pnpm build
```

## License and attribution

MIT. Derived from `dsh-genui` by changfenhuang / the omdsh-dev organization and
its contributors; see `LICENSE`, `CHANGELOG.md` and the upstream repository for
the full history. New work in this fork: cross-turn state slots, the
`genui_state` tool, host-side slot storage and sync (2026).

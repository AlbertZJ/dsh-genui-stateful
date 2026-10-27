# dsh-genui-stateful

**DeepSeek Harness 的有状态 GenUI 插件** —— 在社区 `dsh-ui` 围栏渲染器基础上加入**跨轮状态槽**：用户的选择和输入能保留到下一轮 Agent，模型也能读回来。

派生自 [`omdsh-dev/dsh-genui`](https://github.com/omdsh-dev/dsh-genui) v0.15.0（MIT）。上游按「会话 + 内容指纹」持久化交互状态——重放同一份内容能恢复，但模型下一轮输出新内容就从头开始。本派生版加入模型可声明的**状态槽**，身份与内容解耦。

## 相比上游新增

| 能力 | 上游 | 本派生版 |
| --- | --- | --- |
| 刷新页面 / 重开会话后恢复 | ✅ 仅相同内容 | ✅ 相同内容 |
| 跨轮（新回答、新内容）恢复 | ❌ 重置 | ✅ 按 `state` 槽位 |
| 模型读取用户上一轮的选择 | ❌ | ✅ `genui_state` 工具 |
| 换新内容时残留的判卷锁定 | 不适用（新键） | ✅ 仅内容一致时恢复锁定 |
| 密码字段到达宿主 | — | ❌ 从不同步 |

## 快速开始

```sh
# npm 发布后
dsh plugin --profile web add dsh-genui-stateful

# 或直接从 GitHub 安装
dsh plugin --profile web add github:AlbertZJ/dsh-genui-stateful
```

重启 dsh web 服务并硬刷新浏览器。其余围栏语法、组件、面板、动作回传和内置 `genui` skill 与上游一致。

## 跨轮状态怎么用

第一轮——模型渲染一个带槽位的交互界面：

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

用户选了「华南」，把滑块拖到 50000。

第二轮——模型先读槽位再回答：

```
genui_state { "action": "get", "slot": "order-filter" }
→ { "ok": true, "found": true, "state": { "fields": { "region": "华南", "minAmount": "50000" } } }
```

然后沿用同一个 `state` 渲染新 spec——控件已经带着用户的值，模型据此给出正确数据。

当前 spec 里已经不存在字段会自动丢弃，新界面可自由增删字段。radio/checkbox 答案、input/textarea 值、select/slider 值和本地判卷锁定都参与跨轮保留。

## 工具 `genui_state`

| action | 参数 | 返回 |
| --- | --- | --- |
| `list` | — | 当前会话所有槽位，最新在前 |
| `get` | `slot` | 槽位状态，或 `found: false` |
| `set` | `slot`、`state` | 覆盖槽位（通常不需要） |
| `clear` | `slot` | 删除槽位 |

宿主按会话把状态存在 `~/.dsh/genui-state/`（可用 `DSH_GENUI_STATE_DIR` 覆盖）。浏览器保留自己的本地副本用于渲染，宿主副本专供模型读取。

插件配置 `"stateTool": false` 可关闭工具注册——UI 仍跨轮恢复，只是模型读不到。

## 安全

- 密码/秘密字段在浏览器侧同步前就被剥离，永远不会到达宿主或模型。
- 槽名限定 `[A-Za-z0-9._-]{1,64}`；会话 id 在变成文件名前先校验。
- 状态路由限制请求体（64 KiB）并拒绝未知形状；工具返回稳定错误码。
- 渲染仍是声明式：不执行模型生成的代码。

## 开发

```sh
pnpm install
pnpm test
pnpm build
```

## 许可与致谢

MIT。派生自 changfenhuang / omdsh-dev 组织及贡献者维护的 `dsh-genui`；完整历史见 `LICENSE`、`CHANGELOG.md` 和上游仓库。本派生版新增：跨轮状态槽、`genui_state` 工具、宿主侧槽存储与同步（2026）。

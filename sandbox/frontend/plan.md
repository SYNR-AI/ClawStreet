# Story Mode -> Live Agent Integration Plan

## Current State

- 按钮点击 → 切换本地 `messages.json` 中的假消息
- 无 WebSocket，无网络请求
- `messages.json` 包含 `text_en` / `text_zh` 双语展示文本

## Target State

- 按钮点击 → 通过 WebSocket 发送预设消息给 OpenClaw agent
- 接收 agent 流式回复 → 投影到相框（打字机效果）
- 时钟显示预设消息的时间

## Gateway Protocol Summary

基于 `sandbox/send-test-message.mjs` 和 `src/gateway/` 源码：

```
Client                          Gateway                    Agent
  |                               |                          |
  |<-- event(connect.challenge) --|                          |
  |--- req(connect, auth) ------->|                          |
  |<-- res(ok, connId) ----------|                          |
  |                               |                          |
  |--- req(chat.send) ----------->|                          |
  |<-- res(status:"started") ----|--- invoke agent -------->|
  |                               |                  [running]
  |<-- event(chat, delta) -------|<-- stream chunk ---------|
  |<-- event(chat, delta) -------|<-- stream chunk ---------|
  |<-- event(chat, final) -------|<-- done -----------------|
```

### Frame Types

```ts
// 发送请求
{ type: "req", id: string, method: string, params?: unknown }

// 接收响应
{ type: "res", id: string, ok: boolean, payload?: unknown, error?: { code, message } }

// 接收事件（服务器推送）
{ type: "event", event: string, payload?: unknown }
```

### Chat Event Payload States

| state       | 含义                       | payload.message     |
| ----------- | -------------------------- | ------------------- |
| `"delta"`   | 流式文本片段（150ms 节流） | 有，累积文本        |
| `"final"`   | 完整回复                   | 有，最终文本        |
| `"error"`   | agent 报错                 | 无，有 errorMessage |
| `"aborted"` | 被取消                     | 无，有 stopReason   |

## Implementation Plan

### Step 1: Config

**新建 `sandbox/frontend/config.ts`**

```ts
export const GATEWAY_WS_URL = "ws://192.168.8.82:10011/ws";
export const GATEWAY_TOKEN = "8888";
export const SESSION_KEY = "agent:main:main";
```

集中管理连接参数，方便切换环境。

---

### Step 2: WebSocket Hook

**新建 `sandbox/frontend/hooks/useGateway.ts`**

职责：管理 WebSocket 生命周期、握手、RPC 请求/响应、事件监听。

```ts
interface UseGatewayReturn {
  status: "connecting" | "connected" | "disconnected" | "error";
  rpc: (method: string, params: unknown) => Promise<unknown>;
  onEvent: (event: string, handler: (payload: unknown) => void) => () => void;
}
```

核心逻辑：

1. 组件挂载时创建 WebSocket 连接
2. 收到 `connect.challenge` 事件 → 自动发 `connect` RPC 握手
3. 握手成功 → status 变为 `"connected"`
4. `rpc()` 发送 req 帧，等待匹配 id 的 res 帧（Promise）
5. `onEvent()` 注册事件监听器，返回取消函数
6. 断线自动重连（指数退避）

---

### Step 3: Chat Hook

**新建 `sandbox/frontend/hooks/useChat.ts`**

职责：封装 `chat.send` + 监听 chat event，暴露回复状态。

```ts
interface UseChatReturn {
  reply: string; // 当前回复文本（delta 实时更新）
  chatState: "idle" | "sending" | "streaming" | "done" | "error";
  error: string | null;
  send: (message: string) => void; // 发送消息
}
```

核心逻辑：

1. 调用 `send(message)` → `rpc("chat.send", { sessionKey, message, idempotencyKey })`
2. 收到 `res { status: "started" }` → chatState 变为 `"streaming"`
3. 监听 `chat` event，按 `runId` 过滤：
   - `delta` → 更新 `reply` 文本
   - `final` → 设置最终 `reply`，chatState 变为 `"done"`
   - `error` → 设置 error，chatState 变为 `"error"`
   - `aborted` → chatState 变为 `"error"`
4. `"done"` 或 `"error"` 后按钮解锁，可发下一条

---

### Step 4: Messages 数据改为用户消息

**修改 `sandbox/frontend/messages.json`**

从"展示内容"变为"发给 agent 的预设消息队列"：

```json
[
  {
    "message_en": "Good morning. What's our portfolio looking like today?",
    "message_zh": "早上好。我们的投资组合今天怎么样？"
  },
  {
    "message_en": "Any interesting opportunities in the market?",
    "message_zh": "市场上有什么有趣的机会吗？"
  }
]
```

按钮点击 → 取出 messages[index] → 根据语言选文本 → 发给 agent。

---

### Step 5: Component Changes

#### `GameInterface.tsx`

```diff
- import messages from "../messages.json";
+ import { useGateway } from "../hooks/useGateway";
+ import { useChat } from "../hooks/useChat";
+ import userMessages from "../messages.json";

  const GameInterface = () => {
-   const [messageIndex, setMessageIndex] = useState(0);
+   const gateway = useGateway();
+   const chat = useChat(gateway);
+   const [messageIndex, setMessageIndex] = useState(0);

    const handleNext = () => {
-     setMessageIndex(prev => (prev + 1) % messages.length);
+     if (chat.chatState === "streaming" || chat.chatState === "sending") return;
+     const msg = userMessages[messageIndex];
+     const text = isChinese ? msg.message_zh : msg.message_en;
+     chat.send(text);
+     setMessageIndex(prev => (prev + 1) % userMessages.length);
    };
  };
```

传给子组件的 props：

- `WallSection`: `replyText`, `chatState`, `isChinese`
- `DeskSection`: `onNext`, `disabled`

#### `WallSection.tsx`

```diff
  interface WallSectionProps {
-   message?: { time, date, text };
+   replyText: string;
+   chatState: "idle" | "sending" | "streaming" | "done" | "error";
    isChinese?: boolean;
  }
```

- `sending` → 显示 "..." 或加载动画
- `streaming` / `done` → 显示 `replyText`（流式更新自动触发 re-render）
- `error` → 显示错误提示
- 时钟回归真实时间（去掉 overrideTime/overrideDate）
- 光束在 streaming/done 时亮起

#### `Clock.tsx`

去掉 `overrideTime` / `overrideDate`，恢复为纯真实时钟。

#### `DeskSection.tsx` / `Controls.tsx`

- 新增 `disabled` prop
- disabled 时按钮视觉变灰、不触发 onPress

---

### Step 6: Streaming Display

gateway 已做 150ms 节流，前端直接渲染 `replyText` 就有自然的打字效果，不需要额外逐字动画。

---

## File Summary

| 文件                  | 操作 | 说明                                            |
| --------------------- | ---- | ----------------------------------------------- |
| `config.ts`           | 新建 | Gateway URL / Token / SessionKey                |
| `hooks/useGateway.ts` | 新建 | WebSocket 连接 + 握手 + RPC + 事件监听          |
| `hooks/useChat.ts`    | 新建 | chat.send + 监听回复 + 状态管理                 |
| `messages.json`       | 改   | 从展示内容变为预设用户消息                      |
| `GameInterface.tsx`   | 改   | 引入 hooks，按钮触发真实消息发送                |
| `WallSection.tsx`     | 改   | 显示 agent 回复（流式），去掉 message.time/date |
| `Clock.tsx`           | 改   | 去掉 override props                             |
| `DeskSection.tsx`     | 改   | 传递 disabled 状态                              |
| `Controls.tsx`        | 改   | 支持 disabled 样式                              |

## Open Questions

1. **Gateway 地址和 Token** — 还是 `ws://192.168.8.82:10010/ws` + `8888`？需要支持配置切换吗？
2. **预设消息内容** — 每次点击发什么给 agent？固定列表还是每次相同？
3. **Session 管理** — 每次页面加载是新 session 还是复用 `agent:main:main`？
4. **断线处理** — 需要自动重连吗？重连后是否恢复上下文？
5. **Clock** — live 模式下时钟显示真实时间还是隐藏？

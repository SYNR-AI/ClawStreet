# ClawStreet 技术架构设计文档

> 本文档基于当前代码库的实际实现编写，旨在为后续模块开发提供架构指南，确保代码风格和设计模式的一致性。

---

## 1. 系统全景

### 1.1 技术栈总结

| 层级     | 技术选型                         | 说明                                    |
| -------- | -------------------------------- | --------------------------------------- |
| 运行时   | Node.js 22+ / Bun                | 生产构建用 Node，开发和脚本执行优先 Bun |
| 语言     | TypeScript (ESM, strict)         | 全栈 TypeScript，严格类型检查           |
| 后端框架 | 自建 Gateway                     | WebSocket RPC 网关 + AI Agent 宿主      |
| 前端框架 | Lit (Web Components)             | 基于标准 Web Components 的轻量级 UI     |
| 前端构建 | Vite 7                           | HMR 开发 + 生产构建                     |
| 后端构建 | tsdown                           | TypeScript 到 ESM 的编译打包            |
| 包管理   | pnpm (workspace)                 | 多包工作区，支持 extensions 插件        |
| 代码质量 | Oxlint + Oxfmt                   | 类型感知 lint + 格式化                  |
| 测试     | Vitest                           | 单元/集成/E2E，V8 覆盖率阈值 70%        |
| AI Agent | Pi Agent (第三方) + 自定义工具链 | AI 代理运行时 + TypeBox 工具 schema     |

### 1.2 核心运行逻辑

系统由单一 **Gateway 网关服务**（端口 18789）组成，包含：

- WebSocket RPC 服务器
- AI Agent 宿主
- 消息通道路由器
- Portfolio 模拟交易模块（进程内，异步 I/O）

架构示意：

```
┌─────────────────────────────────────────────────────┐
│                   Control UI (Lit/Vite)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Views    │→ │Controllers│→ │GatewayBrowserClient│  │
│  │ (Lit)    │  │ (函数式)  │  │  (WebSocket)      │  │
│  └──────────┘  └──────────┘  └────────┬───────────┘  │
│                                       │              │
│       所有模块（含 Portfolio）        │              │
│       统一走 WebSocket RPC            │              │
│                                       ↓              │
└───────────────────────────────────────┼──────────────┘
                                        │ WebSocket :18789
┌───────────────────────────────────────▼──────────────┐
│                    Gateway Server                     │
│  ┌───────────────────────────────────────────────┐   │
│  │ server-methods/* (RPC Handler Registry)       │   │
│  │   ├── portfolio.ts (portfolio.get/trade/...)   │   │
│  │   ├── chat.ts, config.ts, ...                 │   │
│  │   └── ...                                     │   │
│  └───────────────────┬───────────────────────────┘   │
│  ┌───────────────────▼───────────────────────────┐   │
│  │ AI Agent Runtime                              │   │
│  │   └── tools → 进程内直接调用 Portfolio 模块    │   │
│  └───────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────┐   │
│  │ Portfolio 模块 (src/portfolio/)               │   │
│  │   ├── TradingEngine (交易执行)                │   │
│  │   ├── MarketData (Binance REST, 30s 缓存)     │   │
│  │   ├── Portfolio (异步领域模型)                 │   │
│  │   └── PortfolioStore (~/.clawstreet/)         │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 1.3 通信协议

**Gateway WebSocket RPC**（UI ↔ Gateway）：

- **请求帧**: `{ type: "req", id: "<uuid>", method: "<namespace.action>", params: {...} }`
- **响应帧**: `{ type: "res", id: "<uuid>", ok: true|false, payload?: {...}, error?: {...} }`
- **事件帧**: `{ type: "event", event: "<name>", payload?: {...}, seq?: number }`

方法命名约定为 `<namespace>.<action>`，如 `chat.send`、`portfolio.trade`。

---

## 2. 项目结构映射

### 2.1 顶层目录

```
ClawStreet/
├── src/                    # 后端核心源码（CLI、Gateway、Agent、领域模型）
├── ui/                     # 前端 Control UI（独立 Vite 项目）
├── apps/                   # 原生客户端（iOS/Android/macOS）
├── extensions/             # 插件/扩展（独立 workspace 包）
├── docs/                   # Mintlify 文档站
├── scripts/                # 构建/发布/运维脚本
├── skills/                 # Agent 技能定义
├── experiments/            # 实验性代码片段（如 binance_api.py）
├── test/                   # 全局测试配置/fixture
├── dist/                   # 构建产物
└── packages/               # 共享内部包
```

### 2.2 后端核心 (`src/`)

后端按**职责域**组织，每个子目录对应系统的一个关注点：

| 目录                          | 职责                         | 关键文件示例                                    |
| ----------------------------- | ---------------------------- | ----------------------------------------------- |
| `src/cli/`                    | CLI 命令注册和入口           | `run-main.ts`, `deps.ts`                        |
| `src/commands/`               | 各 CLI 命令的实现            | `health.ts`, `send.ts`                          |
| `src/gateway/`                | WebSocket 网关核心           | `server-methods.ts`                             |
| `src/gateway/server-methods/` | RPC 方法处理器（按模块）     | `chat.ts`, `config.ts`, `portfolio.ts`          |
| `src/portfolio/`              | 模拟交易领域模型             | `portfolio.ts`, `market-data.ts`, `index.ts`    |
| `src/agents/`                 | AI 代理运行时 + 工具定义     | `openclaw-tools.ts`, `tools/portfolio-tools.ts` |
| `src/config/`                 | 配置管理                     | 读写 `~/.openclaw/openclaw.json`                |
| `src/channels/`               | 消息通道抽象层               | 通道插件注册、路由                              |
| `src/infra/`                  | 基础设施（环境变量、网络等） | `env.ts`                                        |
| `src/routing/`                | 会话路由                     | `session-key.ts`                                |
| `src/cron/`                   | 定时任务服务                 | `service.ts`                                    |
| `src/security/`               | 安全/鉴权                    | 设备认证、令牌管理                              |

**逻辑分层**：

```
CLI 层  →  命令层  →  Gateway 层  →  领域模型层  →  持久化层
(入口)    (编排)     (RPC + 鉴权)   (业务逻辑)     (文件 I/O)
                        │
                        └── AI Agent Tools → 进程内直接调用
```

### 2.3 前端 Control UI (`ui/`)

前端是一个独立的 Vite 项目，使用 Lit Web Components 构建：

| 目录/文件                     | 职责                                              |
| ----------------------------- | ------------------------------------------------- |
| `ui/src/main.ts`              | 入口：导入样式 + 注册根组件                       |
| `ui/src/ui/app.ts`            | 根组件 `<openclaw-app>`：全局状态容器             |
| `ui/src/ui/app-view-state.ts` | `AppViewState` 类型定义：UI 全局状态的形状        |
| `ui/src/ui/app-render.ts`     | 主渲染逻辑：Tab 路由 + 组件分发                   |
| `ui/src/ui/navigation.ts`     | 导航系统：Tab 定义、路径映射、图标/标题           |
| `ui/src/ui/gateway.ts`        | `GatewayBrowserClient`：浏览器端 WebSocket 客户端 |
| `ui/src/ui/controllers/`      | **控制器层**：每个模块一个文件，封装 RPC 调用     |
| `ui/src/ui/views/`            | **视图层**：每个页面一个 Lit 组件或渲染函数       |
| `ui/src/styles/`              | 全局 CSS（布局、组件、主题）                      |

**前端分层模式**（所有模块统一）：

```
View (Lit Component)
  ↓ 调用
Controller (纯函数，封装 RPC)
  ↓ 通过
GatewayBrowserClient.request()
  ↓ WebSocket
Gateway Server
```

---

## 3. Portfolio 模块详解

Portfolio 是一个进程内模拟交易模块，支持 Binance 实时行情，通过 Gateway RPC 和 Agent 工具对外提供服务。

### 3.1 模块结构 (`src/portfolio/`)

| 文件                 | 职责                                         |
| -------------------- | -------------------------------------------- |
| `portfolio-store.ts` | 原子化 JSON 文件持久化层                     |
| `portfolio.ts`       | 异步 Portfolio 领域模型（工厂模式）          |
| `market-data.ts`     | Binance REST API 行情数据 + 内存缓存         |
| `trading-engine.ts`  | 交易执行引擎（市价/限价）                    |
| `index.ts`           | 单例管理 + enriched snapshot + 类型/模块导出 |

### 3.2 持久化层 (`portfolio-store.ts`)

```typescript
export class PortfolioStore {
  // 存储路径: ~/.clawstreet/portfolio.json
  async load(): Promise<PortfolioData>; // 首次运行返回 $100,000 初始资金
  async save(data: PortfolioData): void; // 原子写入：temp file + rename
}
```

**设计要点**：

- **存储隔离**：使用 `~/.clawstreet/` 而非 `~/.openclaw/`，避免与 Gateway 配置数据冲突
- **原子写入**：`writeFile(tmpPath)` → `rename(tmpPath, storagePath)`，防止写入中断导致数据损坏
- **全异步 I/O**：使用 `fs.promises`，不阻塞事件循环
- **默认数据**：初始现金余额 $100,000

数据结构：

```typescript
interface PortfolioData {
  cash: number;
  holdings: Record<string, Holding>; // { "BTCUSDT": { quantity, averagePrice } }
  transactionHistory: Transaction[];
}
```

### 3.3 Portfolio 领域模型 (`portfolio.ts`)

**工厂模式**：

```typescript
export class Portfolio {
  static async create(store: PortfolioStore): Promise<Portfolio>; // 从文件加载
  async buyStock(ticker, quantity, price): Promise<{ success; message }>;
  async sellStock(ticker, quantity, price): Promise<{ success; message }>;
  getSnapshot(): PortfolioData; // 内存快照
  getPortfolioValue(currentPrices): { totalValue; stockValue }; // 估值计算
}
```

### 3.4 行情数据 (`market-data.ts`)

集成 Binance REST API，提供实时加密货币价格：

```typescript
export class MarketData {
  private cache = new Map<string, CachedQuote>(); // TTL 30s
  async fetchQuote(symbol: string): Promise<{ symbol; price }>;
  async fetchQuotes(symbols: string[]): Promise<Array<{ symbol; price }>>;
}
```

**设计要点**：

- **缓存策略**：内存 Map，30 秒 TTL，避免频繁 API 调用
- **批量查询优化**：`fetchQuotes` 先检查缓存，只对缓存失效的 symbol 发起 Binance API 请求
- **Binance 批量 API**：`GET /api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT"]`
- **错误传播**：API 错误直接抛出，由调用方（TradingEngine 或 RPC handler）处理

### 3.5 交易引擎 (`trading-engine.ts`)

编排交易执行流程：

```typescript
export class TradingEngine {
  constructor(portfolio: Portfolio, marketData: MarketData);
  async executeBuy(ticker, quantity, price?): Promise<TradeResult>;
  async executeSell(ticker, quantity, price?): Promise<TradeResult>;
}
```

执行流程：

1. 参数校验（正数检查）
2. 若未提供 price，自动从 Binance 获取市价
3. 委托 `portfolio.buyStock()` / `portfolio.sellStock()` 执行
4. 返回 `{ success, message, transaction? }` 结果

### 3.6 单例管理 (`index.ts`)

```typescript
export function getPortfolioService(): Promise<PortfolioService>;
export async function getEnrichedSnapshot(portfolio, marketData): Promise<PortfolioSnapshot>;
```

- `getPortfolioService()` 懒初始化单例，缓存 init Promise 防竞态
- `getEnrichedSnapshot()` 批量获取 Binance 价格，计算逐笔 P&L，返回完整快照

### 3.7 Gateway RPC 方法

| 方法                     | 类型  | 实现                                                   |
| ------------------------ | ----- | ------------------------------------------------------ |
| `portfolio.get`          | READ  | `getEnrichedSnapshot()` → respond                      |
| `portfolio.trade`        | WRITE | `tradingEngine.executeBuy/Sell()` + broadcast 事件     |
| `portfolio.transactions` | READ  | `portfolio.transactionHistory.slice(-limit).reverse()` |
| `portfolio.quote`        | READ  | `marketData.fetchQuote/fetchQuotes()`                  |

交易成功后通过 Gateway WebSocket 广播 `portfolio.updated` 事件。

---

## 4. Portfolio 模块集成

### 4.1 AI Agent 工具 (`src/agents/tools/portfolio-tools.ts`)

Agent 工具通过进程内直接调用 Portfolio 模块，不走 HTTP：

```typescript
export function createPortfolioTools(): AnyAgentTool[] {
  return [
    { name: "portfolio_get",     → getEnrichedSnapshot() },
    { name: "portfolio_buy",     → tradingEngine.executeBuy() },
    { name: "portfolio_sell",    → tradingEngine.executeSell() },
    { name: "market_data_quote", → marketData.fetchQuote() },
  ];
}
```

**要点**：

- 进程内调用，无网络开销
- `price` 参数使用 `Type.Optional(Type.Number())`，省略时自动使用 Binance 市价
- 所有工具在出错时返回 `{ success: false, error: "..." }` 而非抛异常
- 通过 `readStringParam` / `readNumberParam` 安全提取参数

### 4.2 前端 Controller (`ui/src/ui/controllers/portfolio.ts`)

**通过 Gateway WebSocket RPC 调用**（与其他模块一致）：

```typescript
interface PortfolioState {
  client: GatewayBrowserClient | null;
  connected: boolean;
}

export async function loadPortfolio(state: PortfolioState): Promise<PortfolioData>;
export async function loadTransactions(state, limit?): Promise<{ transactions; total }>;
export async function buyStock(state, ticker, quantity, price?): Promise<{ success; message }>;
export async function sellStock(state, ticker, quantity, price?): Promise<{ success; message }>;
```

### 4.3 前端 View (`ui/src/ui/views/portfolio.ts`)

Lit 自定义元素 `<openclaw-portfolio-page>`：

- **接收 `client` 和 `connected` 属性**：由 `app-render.ts` 传入
- **自动刷新**：30 秒间隔轮询（匹配行情缓存 TTL）
- **数据格式**：使用 RPC 返回的 `holdings` 数组（含 `currentPrice`、`pnl`、`pnlPercent`）
- **交易表单**：买入/卖出支持可选 price 字段（留空 = 市价单）
- **连接检查**：`loadData()` 开头检查 `client && connected`，未连接时静默返回

### 4.4 导航集成

在 `ui/src/ui/navigation.ts` 中：

1. `TAB_GROUPS` → "Control" 组包含 `"portfolio"`
2. `Tab` 类型联合包含 `"portfolio"`
3. `TAB_PATHS` → `portfolio: "/portfolio"`
4. `iconForTab` → `"dollarSign"`
5. `titleForTab` → `"Portfolio"`
6. `subtitleForTab` → `"Track your stock holdings and transactions."`

在 `ui/src/ui/app-render.ts` 中：

1. 顶部 side-effect import：`import "./views/portfolio.ts";`
2. Tab 分发：传入 `client` 和 `connected` 属性

---

## 5. 数据流 (Data Flow)

### 5.1 UI 操作 → 交易执行（以买入为例）

```
用户在 Portfolio 页面点击 "Buy"
  ↓
PortfolioPage.handleBuy()
  ↓
buyStock(state, "BTCUSDT", 0.1)               // Controller（price 留空 = 市价）
  ↓ WebSocket RPC
Gateway portfolio.trade { action: "buy", ticker: "BTCUSDT", quantity: 0.1 }
  ↓
TradingEngine.executeBuy()
  ├── MarketData.fetchQuote("BTCUSDT")         // 从 Binance 获取市价
  └── Portfolio.buyStock("BTCUSDT", 0.1, 97500)
       ├── 更新内存状态（cash、holdings、transactionHistory）
       └── PortfolioStore.save() → atomic write ~/.clawstreet/portfolio.json
  ↓
Response: { success: true, message: "...", transaction: {...} }
  ↓
WebSocket broadcast: portfolio.updated
  ↓
Controller 返回 { success: true }
  ↓
PortfolioPage 调用 loadData() 重新拉取最新状态
  ↓
Lit 响应式更新 → 界面重新渲染
```

### 5.2 AI Agent 操作持仓

```
用户通过聊天发送："帮我买入 0.1 个 BTC"
  ↓
Agent Runtime 解析意图 → 选择工具 portfolio_buy
  ↓
portfolio-tools.ts execute()
  ↓ 进程内调用
tradingEngine.executeBuy("BTCUSDT", 0.1)
  ↓
（同上：TradingEngine → MarketData → Portfolio → PortfolioStore）
  ↓
工具返回 jsonResult({ success: true, ... })
  ↓
Agent 生成自然语言回复："已以 $97,500 买入 0.1 BTC"
```

**关键点**：UI 操作通过 Gateway RPC，Agent 操作通过进程内直接调用，数据一致性由进程内单例 Portfolio 保证。

### 5.3 实时数据刷新

```
PortfolioPage connectedCallback()
  ↓
setInterval(loadData, 30_000)   // 每 30 秒
  ↓
loadData()
  ├── loadPortfolio(state)      → RPC portfolio.get（Gateway 实时查询 Binance 价格）
  └── loadTransactions(state)   → RPC portfolio.transactions
  ↓
Lit @state 更新 → 界面自动重渲染
```

### 5.4 状态管理模式

前端采用**统一模式**：所有模块通过 Gateway WebSocket RPC 通信。

```
OpenClawApp (@state 状态池)
  ↓ AppViewState (props + callbacks)
  ├── renderOverview({ connected, hello, ... })         // Gateway RPC
  ├── renderChat({ chatMessages, ... })                 // Gateway RPC
  └── <openclaw-portfolio-page .client .connected>       // Gateway RPC
       ├── @state portfolioData ← RPC portfolio.get
       ├── @state transactions  ← RPC portfolio.transactions
       └── handleBuy/Sell       → RPC portfolio.trade
```

---

## 6. 扩展性指南 (Extensibility)

### 6.1 新增 Portfolio 功能

在 Portfolio 模块内添加新功能（如止损单、K 线数据），标准清单：

| #   | 文件                                      | 操作                   |
| --- | ----------------------------------------- | ---------------------- |
| 1   | `src/portfolio/<module>.ts`               | **新建** 领域模型      |
| 2   | `src/portfolio/index.ts`                  | **修改** 导出新类/函数 |
| 3   | `src/gateway/server-methods/portfolio.ts` | **修改** 添加 RPC 方法 |

### 6.2 新增 Agent 工具

如果新功能需要 AI Agent 访问：

| #   | 文件                                 | 操作                            |
| --- | ------------------------------------ | ------------------------------- |
| 1   | `src/agents/tools/<module>-tools.ts` | **新建** 工具定义（进程内调用） |
| 2   | `src/agents/openclaw-tools.ts`       | **修改** 导入 + 展开到工具集    |

### 6.3 新增 Gateway UI Tab

| #   | 文件                                | 操作                                                |
| --- | ----------------------------------- | --------------------------------------------------- |
| 1   | `ui/src/ui/controllers/<module>.ts` | **新建** Controller（RPC 调用）                     |
| 2   | `ui/src/ui/views/<module>.ts`       | **新建** View（Lit 组件或渲染函数）                 |
| 3   | `ui/src/ui/navigation.ts`           | **修改** TAB_GROUPS / Tab 类型 / 路径 / 图标 / 标题 |
| 4   | `ui/src/ui/app-render.ts`           | **修改** side-effect import + Tab 分发渲染          |

### 6.4 Agent 工具设计模式

```typescript
// src/agents/tools/<module>-tools.ts
import { Type } from "@sinclair/typebox";
import { jsonResult, type AnyAgentTool, readStringParam } from "./common.js";

export function create<Module>Tools(): AnyAgentTool[] {
  return [
    {
      label: "Tool Label",
      name: "<module>_<action>",     // snake_case
      description: "...",
      parameters: Type.Object({
        param: Type.String({ description: "..." }),
        optionalParam: Type.Optional(Type.Number({ description: "..." })),
      }),
      execute: async (_toolCallId, args) => {
        // 1. 解析参数
        // 2. 进程内调用领域模型
        // 3. 返回 jsonResult(...)
      },
    },
  ];
}
```

**约定**：

- 工具名 snake*case：`<module>*<action>`
- 避免 `Type.Union`；可选参数用 `Type.Optional()`
- 错误时返回 `{ success: false, error: "..." }` 而非抛异常
- 使用 `readStringParam` / `readNumberParam` 从 args 中安全提取参数

### 6.5 命名与文件组织规范

| 项目            | 约定                                | 示例                           |
| --------------- | ----------------------------------- | ------------------------------ |
| Portfolio 模块  | `src/portfolio/<module>.ts`         | `src/portfolio/market-data.ts` |
| Agent 工具名    | `<module>_<action>` (snake_case)    | `market_data_quote`            |
| Tool factory    | `create<Module>Tools()`             | `createPortfolioTools()`       |
| Controller 文件 | `ui/src/ui/controllers/<module>.ts` | `controllers/portfolio.ts`     |
| View 文件       | `ui/src/ui/views/<module>.ts`       | `views/portfolio.ts`           |
| 自定义元素      | `openclaw-<module>-page`            | `<openclaw-portfolio-page>`    |
| Tab 名          | kebab-case 字符串                   | `"portfolio"`                  |
| RPC 方法名      | `<namespace>.<action>`              | `portfolio.trade`              |
| Portfolio 存储  | `~/.clawstreet/`                    | `~/.clawstreet/portfolio.json` |
| Gateway 存储    | `~/.openclaw/`                      | `~/.openclaw/openclaw.json`    |
| 测试文件        | 同名 `*.test.ts`                    | `trading-engine.test.ts`       |

### 6.6 注意事项

1. **TypeBox Schema 限制**：Agent 工具参数中避免使用 `Type.Union`、`anyOf`、`oneOf`。字符串枚举用 `stringEnum`，可选值用 `Type.Optional()`。
2. **文件大小**：单文件控制在 ~500 LOC 以内。
3. **CSS 变量**：UI 组件使用 `var(--theme-*)` CSS 变量以支持深色/浅色主题切换。
4. **错误处理**：RPC handler 通过 `respond(false, undefined, { code, message })` 返回错误；Agent 工具捕获异常返回 `{ success: false, error }`；UI Controller 抛出异常让 View 决定展示策略。
5. **持久化**：Portfolio 使用异步 JSON + 原子写入。数据量增大后可考虑 SQLite。

---

## 7. 构建与开发命令

### 7.1 构建

```bash
pnpm install                    # 安装所有依赖
pnpm build                      # 构建 Gateway 后端（tsdown）
pnpm ui:build                   # 构建 Gateway 前端（Vite）
```

### 7.2 开发

```bash
pnpm dev                        # 启动 Gateway
pnpm ui:dev                     # 启动 Gateway 前端（Vite dev server）
```

---

## 附录：experiments/ 目录

`experiments/` 目录存放独立的实验性代码片段，不参与主项目构建：

- `binance_api.py` — Binance REST API 价格查询脚本（Python），作为 `src/portfolio/market-data.ts` 的参考实现

这些代码片段可作为未来集成外部数据源的参考，但不应直接复制到生产代码中。

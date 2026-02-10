# ClawCapital — AI-Powered Paper Trading Sandbox

**ClawCapital** gives you a dedicated AI fund manager that's online 24/7. $100K simulated account, US stocks, crypto, up to 150x leveraged perpetual futures, and stock options — all powered by real-time market data. You set the direction, your AI handles the research, execution, and post-trade review.

> Fork of OpenClaw. `main` syncs upstream. All the fun stuff lives on [`clawcapital`](../../tree/clawcapital).

<p align="center">
  <img src="assets/image.png" alt="ClawCapital UI" width="900">
</p>

## Why ClawCapital?

You get a dedicated AI fund manager — it monitors markets, researches opportunities, executes trades, and journals every decision. You can review holdings, adjust strategy, or give direct orders at any time. No real money at risk — let it prove itself on paper first.

## 4 Product Lines, 1 Cash Pool

All products share a unified cash balance. Buy AAPL stock, open a 50x BTC long, and hedge with NVDA puts — from the same $100K account.

| Product                 | What                            | Direction            | Leverage | Data Source            |
| ----------------------- | ------------------------------- | -------------------- | -------- | ---------------------- |
| **US Stock Spot**       | AAPL, NVDA, TSLA...             | Long only            | 1x       | Yahoo Finance          |
| **Crypto Spot**         | BTC, ETH, SOL...                | Long only            | 1x       | Binance                |
| **Crypto Perp Futures** | BTC-PERP, ETH-PERP...           | Long & Short         | 1x–150x  | Binance                |
| **US Stock Options**    | NVDA Call/Put, AAPL Call/Put... | Long Call / Long Put | Built-in | Yahoo + Simplified BSM |

### Crypto Perpetual Futures

The headline feature. Your AI can go long or short on crypto with configurable leverage.

- **Isolated margin** — each position's risk is capped, one bad trade won't blow up the account
- **Tiered maintenance margin** — Binance-style tiers (0.4%–2.5% based on notional)
- **Auto-liquidation** — background engine checks prices every 10 seconds, force-closes positions when they hit liquidation price
- **ROE tracking** — 10x leverage + 5% price move = 50% return on equity

```
Example: Long 1 BTC @ $60,000, 20x leverage
  Margin required:  $3,000
  BTC hits $63,000:  P&L = +$3,000, ROE = +100%
  BTC hits $57,000:  P&L = -$3,000, ROE = -100% → liquidation
```

### US Stock Options

Simplified options with real-time pricing. Buy calls to bet up, buy puts to bet down. Max loss = premium paid. No margin, no liquidation.

- **Auto-generated option chains** — strike prices centered on current stock price, 4 expiry dates (weekly + monthly)
- **Simplified BSM pricing** — intrinsic value + time value, with per-stock implied volatility (NVDA 45%, GME 80%, AAPL 25%)
- **Auto-settlement** — expired options settle every hour. ITM options pay out, OTM options expire worthless
- **Days-to-expiry tracking** — premium decays as expiry approaches

```
Example: Buy 2 NVDA $850 Put, NVDA @ $800, 30 days to expiry
  Premium: ~$103/share × 100 × 2 = ~$20,600
  NVDA drops to $700:
    Intrinsic: ($850-$700) × 100 × 2 = $30,000
    Profit: $30,000 - $20,600 = +$9,400
  NVDA stays above $850:
    Option expires worthless. Loss = $20,600
```

## What Makes It Fun

**The AI trades autonomously.** Give your OpenClaw agent the trading tools, and it will research, trade, and journal every decision. Each position has a "story" — thesis, context memo, and full trade history with reasoning.

**Real prices, fake money.** Binance for crypto (24/7), Yahoo Finance for US stocks. Every trade executes at the real market price.

**Watchlist with AI intel.** The agent maintains a watchlist with per-ticker monitoring focus ("watching AAPL for $180 breakout"), heat ratings (cold/warm/hot), and an intelligence feed of AI-pushed market observations.

**Portfolio Dashboard.** Sub-tabbed UI: Overview → Spot → Futures → Options. Expandable position rows with thesis, transaction timeline, and liquidation warnings.

## Agent Tools

The AI uses these tools autonomously during conversations:

| Tool                                       | Does                                               |
| ------------------------------------------ | -------------------------------------------------- |
| `portfolio_get`                            | Check all holdings, cash, P&L across product lines |
| `portfolio_buy` / `portfolio_sell`         | Trade spot stocks & crypto                         |
| `portfolio_set_meta`                       | Record thesis & context on positions               |
| `market_data_quote`                        | Get live price for any symbol                      |
| `futures_open_long` / `futures_open_short` | Open leveraged crypto positions                    |
| `futures_close`                            | Close futures (partial or full)                    |
| `futures_set_leverage`                     | Set leverage 1x–150x per ticker                    |
| `futures_get`                              | Check positions, margin, liq prices                |
| `options_buy`                              | Buy calls or puts                                  |
| `options_sell`                             | Close options before expiry                        |
| `options_chain`                            | Browse available strikes & premiums                |
| `options_quote`                            | Price a specific contract                          |
| `options_get`                              | Check option positions & P&L                       |
| `watchlist_add` / `watchlist_remove`       | Manage watched tickers                             |
| `watchlist_update`                         | Update monitoring focus & heat                     |
| `watchlist_add_intel`                      | Push intelligence to feed                          |

## Quick Start

```bash
git clone <this-repo>
cd ClawCapital && git checkout clawcapital

pnpm install && pnpm ui:build && pnpm build

pnpm openclaw onboard --install-daemon
pnpm openclaw gateway --port 18789
```

Open `http://localhost:18789` — the Portfolio and Watchlist pages are in the sidebar.

Data lives at `~/.openclaw/`:

```
portfolio.json           # Spot holdings & transactions
futures-positions.json   # Futures positions & leverage settings
options-positions.json   # Options positions
watchlist.json           # Watchlist & intelligence feed
```

## How It Differs from OpenClaw

OpenClaw is a multi-channel AI agent framework (WhatsApp, Telegram, Slack, Discord, voice, cron, skills, etc.). ClawCapital adds a complete simulated trading layer on top:

|                  | OpenClaw                      | ClawCapital                                          |
| ---------------- | ----------------------------- | ---------------------------------------------------- |
| Core purpose     | Multi-channel AI assistant    | AI portfolio manager                                 |
| Trading          | None                          | 4 product lines with real market data                |
| Portfolio        | None                          | $100K simulated account with P&L tracking            |
| Futures          | None                          | 1x–150x leveraged crypto perps with auto-liquidation |
| Options          | None                          | US stock options with BSM pricing & auto-settlement  |
| Watchlist        | None                          | AI-maintained ticker watchlist with intel feed       |
| Agent tools      | Messaging, web, browser, cron | All OpenClaw tools + 17 trading tools                |
| Background tasks | Cron jobs                     | + Liquidation engine (10s) + Options expiry (1h)     |
| Dashboard UI     | Gateway control panel         | + Portfolio sub-tabs + Watchlist pages               |

Everything else — messaging, voice, canvas, browser, cron, skills — comes from OpenClaw upstream.

## Architecture

```
src/
├── portfolio/              # Spot trading engine, market data, Portfolio class
├── futures/                # Perpetual futures engine, margin calc, liquidation
├── options/                # Options engine, BSM pricing, chain generation
├── watchlist/              # AI watchlist with heat & intel
├── account/                # Unified account model
├── agents/tools/           # Agent tool definitions (TypeBox schemas)
│   ├── portfolio-tools.ts  #   spot buy/sell/get/meta/quote
│   ├── futures-tools.ts    #   open/close/leverage/positions
│   └── options-tools.ts    #   buy/sell/chain/quote/positions
├── gateway/server-methods/ # WebSocket RPC handlers
│   ├── portfolio.ts        #   portfolio.get/reset/transactions
│   ├── futures.ts          #   futures.open/close/positions/leverage/account
│   ├── options.ts          #   options.buy/sell/positions/chain/quote
│   └── watchlist.ts        #   watchlist.get/add/remove/update/intel
└── gateway/server.impl.ts  # Liquidation interval (10s) + Options expiry (1h)

ui/src/ui/
├── controllers/portfolio.ts  # Portfolio data interfaces
└── views/
    ├── portfolio.ts          # Portfolio page (Overview/Spot/Futures/Options tabs)
    └── watchlist.ts          # Watchlist page (Intel feed, ticker board, radar)
```

## License

MIT — same as OpenClaw.

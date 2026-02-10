import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import {
  loadPortfolio,
  loadTransactions,
  resetPortfolio,
  type PortfolioData,
  type TransactionEntry,
  type HoldingWithPnL,
  type FuturesPositionSummary,
  type OptionsPositionSummary,
  type AnyPositionSummary,
} from "../controllers/portfolio.ts";
import { icons } from "../icons.ts";

type SubTab = "overview" | "spot" | "futures" | "options";

const REFRESH_INTERVAL_MS = 30_000;

@customElement("openclaw-portfolio-page")
export class PortfolioPage extends LitElement {
  @property({ attribute: false }) client: GatewayBrowserClient | null = null;
  @property({ type: Boolean }) connected = false;

  @state() private portfolioData: PortfolioData | null = null;
  @state() private transactions: TransactionEntry[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private lastUpdated: Date | null = null;
  @state() private expandedTickers = new Set<string>();
  @state() private activeTab: SubTab = "overview";

  private refreshTimer: number | null = null;

  static styles = css`
    :host {
      display: block;
      padding: 1.5rem;
      font-family: var(--font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      color: var(--text);
      max-width: 1200px;
      margin: 0 auto;
    }
    h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-strong);
    }

    .portfolio-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Dashboard */
    .dashboard-panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .metric {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .metric-label {
      font-size: 0.75rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .metric-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--text-strong);
    }
    .metric-sub {
      font-size: 1.1rem;
      font-weight: 500;
    }
    .metric-sm .metric-value {
      font-size: 1.1rem;
    }

    /* Sub-tab bar */
    .tab-bar {
      display: flex;
      gap: 0;
      border-bottom: 2px solid var(--border);
    }
    .tab-btn {
      padding: 0.6rem 1.2rem;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      color: var(--muted);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--duration-fast, 150ms) var(--ease-out, ease-out);
      font-family: inherit;
    }
    .tab-btn:hover {
      color: var(--text-strong);
    }
    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }
    .tab-count {
      font-size: 0.75rem;
      color: var(--muted);
      margin-left: 0.3rem;
    }
    .tab-btn.active .tab-count {
      color: var(--accent);
    }

    /* Table */
    .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .table-header,
    .position-main {
      display: grid;
      padding: 0.8rem 1.5rem;
      align-items: center;
    }
    .table-header {
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 0.75rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .position-row {
      border-bottom: 1px solid var(--border);
    }
    .position-row:last-child {
      border-bottom: none;
    }
    .position-main {
      cursor: pointer;
      transition: background var(--duration-fast, 150ms) var(--ease-out, ease-out);
      font-size: 0.9rem;
    }
    .position-main:hover {
      background: var(--bg-hover);
    }

    /* Grid layouts per tab */
    .grid-overview {
      grid-template-columns: 0.6fr 1.4fr 1fr 1fr 1fr 40px;
    }
    .grid-spot {
      grid-template-columns: 1.5fr 0.8fr 1fr 1fr 1fr 1fr 40px;
    }
    .grid-futures {
      grid-template-columns: 1.2fr 0.6fr 0.6fr 0.6fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr 40px;
    }
    .grid-options {
      grid-template-columns: 1.4fr 0.5fr 0.7fr 0.9fr 0.6fr 0.8fr 0.8fr 0.9fr 0.6fr 40px;
    }

    .ticker {
      font-weight: 700;
      font-family: var(--mono);
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .col-right {
      text-align: right;
    }

    /* Badges */
    .badge {
      font-size: 0.6rem;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-weight: 700;
      font-family: var(--font-body, sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .badge-spot {
      background: var(--info);
      color: #fff;
    }
    .badge-futures {
      background: #7c3aed;
      color: #fff;
    }
    .badge-options {
      background: #d97706;
      color: #fff;
    }
    .badge-stock {
      background: var(--info);
      color: #fff;
    }
    .badge-crypto {
      background: var(--warn);
      color: #000;
    }
    .badge-long {
      background: var(--ok);
      color: #fff;
    }
    .badge-short {
      background: var(--danger);
      color: #fff;
    }
    .badge-call {
      background: #2563eb;
      color: #fff;
    }
    .badge-put {
      background: #ea580c;
      color: #fff;
    }

    .expand-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      transition: transform var(--duration-fast, 150ms);
    }
    .expanded .expand-icon {
      transform: rotate(180deg);
    }

    /* Expanded story */
    .position-story {
      background: var(--bg-elevated);
      padding: 1.5rem;
      border-top: 1px dashed var(--border-strong);
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .story-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .story-label {
      font-size: 0.8rem;
      color: var(--muted);
      text-transform: uppercase;
      font-weight: 600;
    }
    .story-content {
      font-size: 1rem;
      line-height: 1.5;
      color: var(--text);
      padding-left: 0.5rem;
      border-left: 2px solid var(--border-strong);
    }
    .story-content.thesis {
      border-left-color: var(--accent);
    }
    .story-content.context {
      border-left-color: var(--warn);
      font-style: italic;
    }
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }
    .timeline-item {
      display: grid;
      grid-template-columns: 80px 80px 1fr;
      gap: 1rem;
      font-size: 0.9rem;
      align-items: baseline;
    }
    .timeline-date {
      color: var(--muted);
      font-family: var(--mono);
    }
    .timeline-action {
      font-weight: 600;
      text-transform: uppercase;
    }
    .timeline-reason {
      color: var(--text);
    }

    .profit {
      color: var(--ok);
    }
    .loss {
      color: var(--danger);
    }
    .warn-text {
      color: var(--warn);
      font-weight: 600;
    }

    svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .btn-refresh {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 0.5rem 1rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--duration-fast, 150ms) var(--ease-out, ease-out);
    }
    .btn-refresh:hover {
      background: var(--bg-hover);
      color: var(--text-strong);
    }
    .btn-reset {
      background: transparent;
      border: 1px solid var(--danger);
      color: var(--danger);
      padding: 0.5rem 1rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.8rem;
      transition: all var(--duration-fast, 150ms) var(--ease-out, ease-out);
    }
    .btn-reset:hover {
      background: var(--danger);
      color: #fff;
    }
    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .empty-msg {
      padding: 2rem;
      text-align: center;
      color: var(--muted);
    }

    /* Position detail row (futures/options) */
    .detail-panel {
      background: var(--bg-elevated);
      padding: 1rem 1.5rem;
      border-top: 1px dashed var(--border-strong);
      font-size: 0.85rem;
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
    }
    .detail-item {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .detail-label {
      font-size: 0.7rem;
      color: var(--muted);
      text-transform: uppercase;
    }
    .detail-value {
      font-weight: 600;
      color: var(--text-strong);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.loadData();
    this.refreshTimer = window.setInterval(() => this.loadData(), REFRESH_INTERVAL_MS);
  }

  willUpdate(changed: PropertyValues<this>) {
    if (
      (changed.has("client") || changed.has("connected")) &&
      this.client &&
      this.connected &&
      !this.portfolioData
    ) {
      this.loadData();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async loadData(refresh = false) {
    if (!this.client || !this.connected) {
      return;
    }
    this.loading = true;
    this.error = null;
    const gwState = { client: this.client, connected: this.connected };
    try {
      const [portfolio, txRes] = await Promise.all([
        loadPortfolio(gwState, { refresh }),
        loadTransactions(gwState, 100),
      ]);
      this.portfolioData = portfolio;
      this.transactions = txRes.transactions;
      this.lastUpdated = new Date();
    } catch (e) {
      this.error = `Failed to load: ${(e as Error).message}`;
    } finally {
      this.loading = false;
    }
  }

  private toggleExpand(key: string) {
    const next = new Set(this.expandedTickers);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.expandedTickers = next;
  }

  private async handleReset() {
    if (
      !confirm(
        "Reset Portfolio? All positions and transactions will be cleared, cash restored to $100,000.",
      )
    ) {
      return;
    }
    if (!this.client || !this.connected) {
      return;
    }
    try {
      await resetPortfolio({ client: this.client, connected: this.connected });
      await this.loadData();
    } catch (e) {
      this.error = `Reset failed: ${(e as Error).message}`;
    }
  }

  private fmt(n: number, currency = true): string {
    return (
      (currency ? "$" : "") +
      n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }

  private fmtCompact(n: number): string {
    if (Math.abs(n) >= 1_000_000) {
      return "$" + (n / 1_000_000).toFixed(2) + "M";
    }
    if (Math.abs(n) >= 1_000) {
      return "$" + (n / 1_000).toFixed(1) + "K";
    }
    return this.fmt(n);
  }

  private pnlClass(n: number): string {
    return n >= 0 ? "profit" : "loss";
  }

  private pnlSign(n: number): string {
    return n >= 0 ? "+" : "";
  }

  // ── Render ──

  render() {
    if (this.loading && !this.portfolioData) {
      return html`
        <div style="padding: 2rem; text-align: center">Loading portfolio data...</div>
      `;
    }
    if (this.error) {
      return html`<div class="error">${this.error} <button @click="${() => this.loadData()}">Retry</button></div>`;
    }
    if (!this.portfolioData) {
      return html`
        <div style="padding: 2rem; text-align: center">No portfolio data.</div>
      `;
    }

    const d = this.portfolioData;

    return html`
      <div class="portfolio-container">
        ${this.renderDashboard(d)}
        ${this.renderTabBar(d)}
        ${this.activeTab === "overview" ? this.renderOverview(d) : nothing}
        ${this.activeTab === "spot" ? this.renderSpot(d) : nothing}
        ${this.activeTab === "futures" ? this.renderFutures(d) : nothing}
        ${this.activeTab === "options" ? this.renderOptionsTab(d) : nothing}
      </div>
    `;
  }

  // ── Dashboard ──

  private renderDashboard(d: PortfolioData) {
    return html`
      <div class="dashboard-panel">
        <div class="metric">
          <span class="metric-label">Total Equity</span>
          <span class="metric-value">${this.fmt(d.totalEquity)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Day P/L</span>
          <span class="metric-value metric-sub ${this.pnlClass(d.pnlDay || 0)}">
            ${this.pnlSign(d.pnlDay || 0)}${this.fmt(d.pnlDay || 0)}
            (${(d.pnlDayPercent || 0).toFixed(2)}%)
          </span>
        </div>
        <div class="metric metric-sm">
          <span class="metric-label">Cash</span>
          <span class="metric-value">${this.fmtCompact(d.cash)}</span>
        </div>
        <div class="metric metric-sm">
          <span class="metric-label">Spot Equity</span>
          <span class="metric-value">${this.fmtCompact(d.spotEquity)}</span>
        </div>
        ${
          d.futuresMarginUsed > 0
            ? html`
          <div class="metric metric-sm">
            <span class="metric-label">Futures Margin</span>
            <span class="metric-value">${this.fmtCompact(d.futuresMarginUsed)}</span>
          </div>
        `
            : nothing
        }
        ${
          d.optionsValue > 0
            ? html`
          <div class="metric metric-sm">
            <span class="metric-label">Options Value</span>
            <span class="metric-value">${this.fmtCompact(d.optionsValue)}</span>
          </div>
        `
            : nothing
        }
        <div style="display:flex;gap:0.5rem;align-items:center">
          <button class="btn-refresh" @click="${() => this.loadData(true)}" ?disabled="${this.loading}">
            <span class="${this.loading ? "spin" : ""}" style="display:inline-block">${icons.refresh || "R"}</span>
          </button>
          <button class="btn-reset" @click="${() => this.handleReset()}" ?disabled="${this.loading}">Reset</button>
        </div>
      </div>
    `;
  }

  // ── Tab Bar ──

  private renderTabBar(d: PortfolioData) {
    const tabs: { key: SubTab; label: string; count?: number }[] = [
      { key: "overview", label: "Overview" },
      { key: "spot", label: "Spot", count: d.spotHoldings.length },
      { key: "futures", label: "Futures", count: d.futuresPositions.length },
      { key: "options", label: "Options", count: d.optionsPositions.length },
    ];

    return html`
      <div class="tab-bar">
        ${tabs.map(
          (t) => html`
          <button
            class="tab-btn ${this.activeTab === t.key ? "active" : ""}"
            @click="${() => {
              this.activeTab = t.key;
            }}"
          >
            ${t.label}${t.count !== undefined ? html`<span class="tab-count">(${t.count})</span>` : nothing}
          </button>
        `,
        )}
      </div>
    `;
  }

  // ── Overview Tab ──

  private renderOverview(d: PortfolioData) {
    if (d.allPositions.length === 0) {
      return html`
        <div class="section"><div class="empty-msg">No positions.</div></div>
      `;
    }

    return html`
      <div class="section">
        <div class="table-header grid-overview">
          <span>TYPE</span>
          <span>TICKER</span>
          <span class="col-right">KEY INFO</span>
          <span class="col-right">VALUE</span>
          <span class="col-right">P/L</span>
          <span></span>
        </div>
        ${d.allPositions.map((pos) => this.renderOverviewRow(pos))}
      </div>
    `;
  }

  private renderOverviewRow(pos: AnyPositionSummary) {
    const key = "ticker" in pos ? pos.ticker : (pos as OptionsPositionSummary).symbol;
    const isExpanded = this.expandedTickers.has("ov-" + key);

    if (pos.productLine === "spot") {
      const h = pos as HoldingWithPnL;
      return html`
        <div class="position-row ${isExpanded ? "expanded" : ""}">
          <div class="position-main grid-overview" @click="${() => this.toggleExpand("ov-" + key)}">
            <span><span class="badge badge-spot">Spot</span></span>
            <span class="ticker">${h.ticker} <span class="badge badge-${h.type}">${h.type}</span></span>
            <span class="col-right">${h.quantity} @ ${this.fmt(h.currentPrice)}</span>
            <span class="col-right">${this.fmt(h.marketValue)}</span>
            <span class="col-right ${this.pnlClass(h.pnl)}">
              ${this.pnlSign(h.pnl)}${this.fmt(h.pnl)} (${h.pnlPercent.toFixed(1)}%)
            </span>
            <span class="expand-icon">▼</span>
          </div>
          ${isExpanded ? this.renderSpotStory(h) : nothing}
        </div>
      `;
    }

    if (pos.productLine === "futures") {
      const f = pos as FuturesPositionSummary;
      return html`
        <div class="position-row ${isExpanded ? "expanded" : ""}">
          <div class="position-main grid-overview" @click="${() => this.toggleExpand("ov-" + key)}">
            <span><span class="badge badge-futures">Futures</span></span>
            <span class="ticker">${f.ticker}</span>
            <span class="col-right">${f.side.toUpperCase()} ${f.quantity} @ ${f.leverage}x</span>
            <span class="col-right">${this.fmt(f.initialMargin)}</span>
            <span class="col-right ${this.pnlClass(f.unrealizedPnl)}">
              ${this.pnlSign(f.unrealizedPnl)}${this.fmt(f.unrealizedPnl)} (${f.roe.toFixed(1)}%)
            </span>
            <span class="expand-icon">▼</span>
          </div>
          ${isExpanded ? this.renderFuturesDetail(f) : nothing}
        </div>
      `;
    }

    // options
    const o = pos as OptionsPositionSummary;
    return html`
      <div class="position-row ${isExpanded ? "expanded" : ""}">
        <div class="position-main grid-overview" @click="${() => this.toggleExpand("ov-" + key)}">
          <span><span class="badge badge-options">Options</span></span>
          <span class="ticker">${o.symbol}</span>
          <span class="col-right">${o.type.toUpperCase()} ${o.contracts}c ${o.daysToExpiry}d</span>
          <span class="col-right">${this.fmt(o.currentValue)}</span>
          <span class="col-right ${this.pnlClass(o.unrealizedPnl)}">
            ${this.pnlSign(o.unrealizedPnl)}${this.fmt(o.unrealizedPnl)} (${o.unrealizedPnlPercent.toFixed(1)}%)
          </span>
          <span class="expand-icon">▼</span>
        </div>
        ${isExpanded ? this.renderOptionsDetail(o) : nothing}
      </div>
    `;
  }

  // ── Spot Tab ──

  private renderSpot(d: PortfolioData) {
    if (d.spotHoldings.length === 0) {
      return html`
        <div class="section"><div class="empty-msg">No spot holdings.</div></div>
      `;
    }

    return html`
      <div class="section">
        <div class="table-header grid-spot">
          <span>TICKER</span>
          <span class="col-right">QTY</span>
          <span class="col-right">AVG PRICE</span>
          <span class="col-right">PRICE</span>
          <span class="col-right">MKT VAL</span>
          <span class="col-right">P/L</span>
          <span></span>
        </div>
        ${d.spotHoldings.map((h) => this.renderSpotRow(h))}
      </div>
    `;
  }

  private renderSpotRow(h: HoldingWithPnL) {
    const isExpanded = this.expandedTickers.has(h.ticker);
    const history = h.history || this.transactions.filter((t) => t.ticker === h.ticker).slice(0, 5);

    return html`
      <div class="position-row ${isExpanded ? "expanded" : ""}">
        <div class="position-main grid-spot" @click="${() => this.toggleExpand(h.ticker)}">
          <span class="ticker">
            ${h.ticker}
            <span class="badge badge-${h.type}">${h.type === "stock" ? "Stock" : "Crypto"}</span>
          </span>
          <span class="col-right">${h.quantity}</span>
          <span class="col-right">${this.fmt(h.averagePrice)}</span>
          <span class="col-right">${this.fmt(h.currentPrice)}</span>
          <span class="col-right">${this.fmt(h.marketValue)}</span>
          <span class="col-right ${this.pnlClass(h.pnl)}">
            ${this.pnlSign(h.pnl)}${this.fmt(h.pnl)} (${h.pnlPercent.toFixed(1)}%)
          </span>
          <span class="expand-icon">▼</span>
        </div>
        ${isExpanded ? this.renderSpotStory(h, history) : nothing}
      </div>
    `;
  }

  private renderSpotStory(h: HoldingWithPnL, history?: TransactionEntry[]) {
    const txHistory =
      history || h.history || this.transactions.filter((t) => t.ticker === h.ticker).slice(0, 5);

    return html`
      <div class="position-story">
        ${
          h.thesis
            ? html`
          <div class="story-section">
            <span class="story-label">Current Thesis</span>
            <div class="story-content thesis">${h.thesis}</div>
          </div>
        `
            : nothing
        }
        ${
          h.context
            ? html`
          <div class="story-section">
            <span class="story-label">Context / Memo</span>
            <div class="story-content context">${h.context}</div>
          </div>
        `
            : nothing
        }
        <div class="story-section">
          <span class="story-label">Transaction History</span>
          <div class="timeline">
            ${
              txHistory.length > 0
                ? txHistory.map(
                    (t) => html`
                <div class="timeline-item">
                  <span class="timeline-date">${new Date(t.date).toLocaleDateString()}</span>
                  <span class="timeline-action ${t.type === "buy" ? "profit" : "loss"}">${t.type.toUpperCase()} ${t.quantity}</span>
                  <span class="timeline-reason">${t.reasoning || "No reasoning recorded."}</span>
                </div>
              `,
                  )
                : html`
                    <div class="timeline-reason">No recent transactions.</div>
                  `
            }
          </div>
        </div>
      </div>
    `;
  }

  // ── Futures Tab ──

  private renderFutures(d: PortfolioData) {
    if (d.futuresPositions.length === 0) {
      return html`
        <div class="section"><div class="empty-msg">No futures positions.</div></div>
      `;
    }

    return html`
      <div class="section">
        <div class="table-header grid-futures">
          <span>TICKER</span>
          <span>SIDE</span>
          <span class="col-right">QTY</span>
          <span class="col-right">LEV</span>
          <span class="col-right">ENTRY</span>
          <span class="col-right">MARK</span>
          <span class="col-right">MARGIN</span>
          <span class="col-right">LIQ PRICE</span>
          <span class="col-right">P/L</span>
          <span></span>
        </div>
        ${d.futuresPositions.map((f) => this.renderFuturesRow(f))}
      </div>
    `;
  }

  private renderFuturesRow(f: FuturesPositionSummary) {
    const isExpanded = this.expandedTickers.has("f-" + f.ticker);
    const liqProximity =
      f.markPrice > 0 ? Math.abs(f.liquidationPrice - f.markPrice) / f.markPrice : 1;
    const liqWarning = liqProximity < 0.1;

    return html`
      <div class="position-row ${isExpanded ? "expanded" : ""}">
        <div class="position-main grid-futures" @click="${() => this.toggleExpand("f-" + f.ticker)}">
          <span class="ticker">${f.ticker}</span>
          <span><span class="badge badge-${f.side}">${f.side}</span></span>
          <span class="col-right">${f.quantity}</span>
          <span class="col-right">${f.leverage}x</span>
          <span class="col-right">${this.fmt(f.entryPrice)}</span>
          <span class="col-right">${this.fmt(f.markPrice)}</span>
          <span class="col-right">${this.fmt(f.initialMargin)}</span>
          <span class="col-right ${liqWarning ? "warn-text" : ""}">${this.fmt(f.liquidationPrice)}</span>
          <span class="col-right ${this.pnlClass(f.unrealizedPnl)}">
            ${this.pnlSign(f.unrealizedPnl)}${this.fmt(f.unrealizedPnl)} (${f.roe.toFixed(1)}%)
          </span>
          <span class="expand-icon">▼</span>
        </div>
        ${isExpanded ? this.renderFuturesDetail(f) : nothing}
      </div>
    `;
  }

  private renderFuturesDetail(f: FuturesPositionSummary) {
    const notional = f.markPrice * f.quantity;
    return html`
      <div class="detail-panel">
        <div class="detail-item">
          <span class="detail-label">Notional Value</span>
          <span class="detail-value">${this.fmt(notional)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Entry Price</span>
          <span class="detail-value">${this.fmt(f.entryPrice)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Mark Price</span>
          <span class="detail-value">${this.fmt(f.markPrice)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Liquidation Price</span>
          <span class="detail-value">${this.fmt(f.liquidationPrice)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">ROE</span>
          <span class="detail-value ${this.pnlClass(f.roe)}">${this.pnlSign(f.roe)}${f.roe.toFixed(2)}%</span>
        </div>
      </div>
    `;
  }

  // ── Options Tab ──

  private renderOptionsTab(d: PortfolioData) {
    if (d.optionsPositions.length === 0) {
      return html`
        <div class="section"><div class="empty-msg">No options positions.</div></div>
      `;
    }

    return html`
      <div class="section">
        <div class="table-header grid-options">
          <span>SYMBOL</span>
          <span>TYPE</span>
          <span class="col-right">STRIKE</span>
          <span class="col-right">EXPIRY</span>
          <span class="col-right">CTRS</span>
          <span class="col-right">PREMIUM</span>
          <span class="col-right">VALUE</span>
          <span class="col-right">P/L</span>
          <span class="col-right">DAYS</span>
          <span></span>
        </div>
        ${d.optionsPositions.map((o) => this.renderOptionsRow(o))}
      </div>
    `;
  }

  private renderOptionsRow(o: OptionsPositionSummary) {
    const isExpanded = this.expandedTickers.has("o-" + o.symbol);
    const expiryWarning = o.daysToExpiry < 3;

    return html`
      <div class="position-row ${isExpanded ? "expanded" : ""}">
        <div class="position-main grid-options" @click="${() => this.toggleExpand("o-" + o.symbol)}">
          <span class="ticker">${o.symbol}</span>
          <span><span class="badge badge-${o.type}">${o.type}</span></span>
          <span class="col-right">${this.fmt(o.strikePrice)}</span>
          <span class="col-right">${o.expiryDate}</span>
          <span class="col-right">${o.contracts}</span>
          <span class="col-right">${this.fmt(o.premiumPaid)}</span>
          <span class="col-right">${this.fmt(o.currentValue)}</span>
          <span class="col-right ${this.pnlClass(o.unrealizedPnl)}">
            ${this.pnlSign(o.unrealizedPnl)}${this.fmt(o.unrealizedPnl)} (${o.unrealizedPnlPercent.toFixed(1)}%)
          </span>
          <span class="col-right ${expiryWarning ? "warn-text" : ""}">${o.daysToExpiry}d</span>
          <span class="expand-icon">▼</span>
        </div>
        ${isExpanded ? this.renderOptionsDetail(o) : nothing}
      </div>
    `;
  }

  private renderOptionsDetail(o: OptionsPositionSummary) {
    return html`
      <div class="detail-panel">
        <div class="detail-item">
          <span class="detail-label">Underlying</span>
          <span class="detail-value">${o.underlying}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Type</span>
          <span class="detail-value">${o.type.toUpperCase()}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Strike</span>
          <span class="detail-value">${this.fmt(o.strikePrice)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Expiry</span>
          <span class="detail-value">${o.expiryDate}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Contracts</span>
          <span class="detail-value">${o.contracts}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Premium Paid</span>
          <span class="detail-value">${this.fmt(o.premiumPaid)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Current Value</span>
          <span class="detail-value">${this.fmt(o.currentValue)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">P/L %</span>
          <span class="detail-value ${this.pnlClass(o.unrealizedPnl)}">${this.pnlSign(o.unrealizedPnlPercent)}${o.unrealizedPnlPercent.toFixed(2)}%</span>
        </div>
      </div>
    `;
  }
}

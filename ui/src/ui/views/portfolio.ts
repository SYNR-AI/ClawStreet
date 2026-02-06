import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import {
  loadPortfolio,
  loadTransactions,
  type PortfolioData,
  type TransactionEntry,
} from "../controllers/portfolio.ts";

const REFRESH_INTERVAL_MS = 30_000; // 30s (market data caches quotes for 30s)

@customElement("openclaw-portfolio-page")
export class PortfolioPage extends LitElement {
  @property({ attribute: false }) client: GatewayBrowserClient | null = null;
  @property({ type: Boolean }) connected = false;

  @state() private portfolioData: PortfolioData | null = null;
  @state() private transactions: TransactionEntry[] = [];
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private lastUpdated: Date | null = null;

  private refreshTimer: number | null = null;

  static styles = css`
    :host {
      display: block;
      padding: 1.5rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: var(--theme-text-color, #333);
      max-width: 1200px;
      margin: 0 auto;
    }
    h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }
    h3 {
      margin: 0 0 1rem 0;
      font-size: 1.2rem;
      font-weight: 500;
      color: var(--theme-heading-color, #444);
    }
    h4 {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
      font-weight: 500;
    }
    .portfolio-container {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
    }
    .card {
      background: var(--theme-surface-1, #fff);
      border: 1px solid var(--theme-border-color, #e0e0e0);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .card-label {
      font-size: 0.9rem;
      color: var(--theme-text-muted, #666);
      font-weight: 500;
    }
    .card-value {
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--theme-text-color, #333);
    }
    .card-value.highlight {
      color: var(--theme-primary, #007bff);
    }
    .main-column {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .section {
      background: var(--theme-surface-1, #fff);
      border: 1px solid var(--theme-border-color, #e0e0e0);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }
    .table-responsive {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    th {
      text-align: left;
      padding: 0.75rem 1rem;
      border-bottom: 2px solid var(--theme-border-color, #eee);
      color: var(--theme-text-muted, #666);
      font-weight: 600;
      white-space: nowrap;
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--theme-border-color, #eee);
    }
    tr:last-child td {
      border-bottom: none;
    }
    .text-right {
      text-align: right;
    }
    .profit {
      color: var(--theme-success, #10b981);
      font-weight: 500;
    }
    .loss {
      color: var(--theme-danger, #ef4444);
      font-weight: 500;
    }
    .type-buy {
      color: var(--theme-success, #10b981);
      font-weight: 600;
      font-size: 0.85rem;
    }
    .type-sell {
      color: var(--theme-danger, #ef4444);
      font-weight: 600;
      font-size: 0.85rem;
    }
    .ticker {
      font-weight: 600;
      font-family: monospace;
    }
    .date {
      color: var(--theme-text-muted, #666);
      font-size: 0.85rem;
    }
    .empty-msg {
      color: var(--theme-text-muted, #888);
      text-align: center;
      padding: 2rem 0;
      font-style: italic;
    }
    button {
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      filter: grayscale(100%);
    }
    .error {
      color: var(--theme-danger, #ef4444);
      padding: 1rem;
      background: #fef2f2;
      border-radius: 6px;
      border: 1px solid #fecaca;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .last-updated {
      font-size: 0.85rem;
      color: var(--theme-text-muted, #666);
    }
    .btn-refresh {
      background: var(--theme-surface-2, #f5f5f5);
      color: var(--theme-text-color, #333);
      border: 1px solid var(--theme-border-color, #ddd);
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .btn-refresh:hover:not(:disabled) {
      background: var(--theme-surface-3, #eee);
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
  `;

  connectedCallback() {
    super.connectedCallback();
    this.loadData();
    this.refreshTimer = window.setInterval(() => this.loadData(), REFRESH_INTERVAL_MS);
  }

  willUpdate(changed: PropertyValues<this>) {
    // When client/connected become ready after mount, trigger initial load
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
    if (!this.client || !this.connected) return;
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
      this.error = `Failed to load: ${(e as Error).message}. Gateway not connected.`;
    } finally {
      this.loading = false;
    }
  }

  private fmt(n: number): string {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  render() {
    if (this.loading && !this.portfolioData) {
      return html`
        <p>Loading portfolio...</p>
      `;
    }
    if (this.error) {
      return html`<p class="error">${this.error}</p><button @click="${() => this.loadData()}">Retry</button>`;
    }
    if (!this.portfolioData) {
      return html`
        <p>No portfolio data available.</p>
      `;
    }

    const { cash, stockValue, totalValue, holdings } = this.portfolioData;
    const lastUpdatedStr = this.lastUpdated
      ? `Updated ${this.lastUpdated.toLocaleTimeString()}`
      : "";

    return html`
      <div class="portfolio-container">
        <div class="header-row">
          <h2>Portfolio</h2>
          <div class="header-actions">
            ${lastUpdatedStr ? html`<span class="last-updated">${lastUpdatedStr}</span>` : nothing}
            <button class="btn-refresh ${this.loading ? "loading" : ""}" @click="${() => this.loadData(true)}" ?disabled="${this.loading}">
              <span class="${this.loading ? "spin" : ""}">&#8635;</span>
              ${this.loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div class="summary-cards">
          <div class="card"><span class="card-label">Cash Balance</span><span class="card-value">$${this.fmt(cash)}</span></div>
          <div class="card"><span class="card-label">Stock Value</span><span class="card-value">$${this.fmt(stockValue)}</span></div>
          <div class="card"><span class="card-label">Total Value</span><span class="card-value highlight">$${this.fmt(totalValue)}</span></div>
        </div>

        <div class="main-column">
          <!-- Holdings -->
          <div class="section">
            <h3>Holdings</h3>
            ${
              holdings.length === 0
                ? html`
                    <p class="empty-msg">No holdings yet.</p>
                  `
                : html`
                <div class="table-responsive">
                  <table>
                    <thead><tr>
                      <th>Ticker</th><th class="text-right">Quantity</th><th class="text-right">Avg. Price</th>
                      <th class="text-right">Current</th><th class="text-right">Value</th><th class="text-right">P/L</th>
                    </tr></thead>
                    <tbody>
                      ${holdings.map(
                        (h) => html`
                        <tr>
                          <td class="ticker">${h.ticker}</td>
                          <td class="text-right">${h.quantity}</td>
                          <td class="text-right">$${this.fmt(h.averagePrice)}</td>
                          <td class="text-right">$${this.fmt(h.currentPrice)}</td>
                          <td class="text-right">$${this.fmt(h.marketValue)}</td>
                          <td class="text-right ${h.pnl >= 0 ? "profit" : "loss"}">
                            ${h.pnl >= 0 ? "+" : ""}$${this.fmt(h.pnl)} (${h.pnlPercent.toFixed(1)}%)
                          </td>
                        </tr>
                      `,
                      )}
                    </tbody>
                  </table>
                </div>
              `
            }
          </div>

          <!-- Transaction History -->
          <div class="section">
            <h3>Transaction History</h3>
            ${
              this.transactions.length === 0
                ? html`
                    <p class="empty-msg">No transactions yet.</p>
                  `
                : html`
                <div class="table-responsive">
                  <table>
                    <thead><tr>
                      <th>Date</th><th>Type</th><th>Ticker</th><th class="text-right">Qty</th><th class="text-right">Price</th>
                    </tr></thead>
                    <tbody>
                      ${this.transactions.map(
                        (t) => html`
                        <tr>
                          <td class="date">${new Date(t.date).toLocaleString()}</td>
                          <td class="${t.type === "buy" ? "type-buy" : "type-sell"}">${t.type.toUpperCase()}</td>
                          <td class="ticker">${t.ticker}</td>
                          <td class="text-right">${t.quantity}</td>
                          <td class="text-right">$${this.fmt(t.price)}</td>
                        </tr>
                      `,
                      )}
                    </tbody>
                  </table>
                </div>
              `
            }
          </div>
        </div>
      </div>
    `;
  }
}

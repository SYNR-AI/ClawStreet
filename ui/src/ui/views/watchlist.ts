import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import {
  loadWatchlist,
  type WatchlistData,
  type ActiveIntelItem,
} from "../controllers/watchlist.ts";
import { icons } from "../icons.ts";

const REFRESH_INTERVAL_MS = 60_000;

@customElement("openclaw-watchlist-page")
export class WatchlistPage extends LitElement {
  @property({ attribute: false }) client: GatewayBrowserClient | null = null;
  @property({ type: Boolean }) connected = false;

  @state() private data: WatchlistData | null = null;
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private expandedIntelIds = new Set<string>();

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
    .container {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    h3 {
      margin: 0 0 1rem 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.5rem;
    }

    /* Intelligence Feed */
    .feed-stack {
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }
    .feed-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
      transition: border-color var(--duration-fast) var(--ease-out);
    }
    .feed-card:hover {
      border-color: var(--accent);
    }
    .feed-header {
      padding: 1rem 1.5rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bg-elevated);
    }
    .feed-title {
      font-weight: 600;
      color: var(--text-strong);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .new-badge {
      background: var(--accent);
      color: var(--accent-foreground);
      font-size: 0.7rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-weight: 700;
    }
    .feed-content {
      padding: 1.5rem;
      border-top: 1px solid var(--border);
      background: var(--card);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .feed-section-label {
      font-size: 0.8rem;
      color: var(--muted);
      font-weight: 600;
      text-transform: uppercase;
    }
    .feed-text {
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--text);
    }

    /* Active Intel Board */
    .intel-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .intel-table th {
      text-align: left;
      padding: 1rem 1.5rem;
      background: var(--bg-elevated);
      color: var(--muted);
      font-size: 0.85rem;
      text-transform: uppercase;
      font-weight: 600;
    }
    .intel-table td {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      color: var(--text);
    }
    .ticker {
      font-family: var(--mono);
      font-weight: 700;
      color: var(--accent);
      font-size: 1rem;
    }
    .eye-cell {
      font-style: italic;
      color: var(--text);
    }
    .heat-badge {
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .heat-HOT {
      background: var(--danger);
      color: #fff;
    }
    .heat-WARM {
      background: var(--warn);
      color: #000;
    }
    .heat-COLD {
      background: var(--info);
      color: #fff;
    }

    /* Opportunity Radar */
    .radar-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }
    .radar-item {
      background: var(--bg-elevated);
      border: 1px dashed var(--border-strong);
      padding: 1rem;
      border-radius: var(--radius-sm);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .radar-source {
      font-size: 0.8rem;
      color: var(--muted);
    }

    .loading-msg {
      padding: 2rem;
      text-align: center;
      color: var(--muted);
    }
    .error-msg {
      color: var(--danger);
      padding: 1rem;
    }

    .expand-icon {
      transition: transform var(--duration-fast);
    }
    .expanded .expand-icon {
      transform: rotate(180deg);
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .header-row h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-strong);
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
      transition: all var(--duration-fast) var(--ease-out);
    }
    .btn-refresh:hover {
      background: var(--bg-hover);
      color: var(--text-strong);
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
      font-style: italic;
    }
    .section-subtitle {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-strong);
      margin: 1.2rem 0 0.5rem 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .section-subtitle:first-of-type {
      margin-top: 0;
    }
    .type-badge {
      font-size: 0.7rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .type-stock {
      background: var(--info);
      color: #fff;
    }
    .type-crypto {
      background: var(--warn);
      color: #000;
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
      !this.data
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
    try {
      this.data = await loadWatchlist(
        { client: this.client, connected: this.connected },
        { refresh },
      );
    } catch (e) {
      this.error = `Failed to load watchlist: ${(e as Error).message}`;
    } finally {
      this.loading = false;
    }
  }

  private toggleIntel(id: string) {
    const next = new Set(this.expandedIntelIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedIntelIds = next;
  }

  private renderIntelTable(items: ActiveIntelItem[], emptyMsg: string) {
    if (items.length === 0) {
      return html`<div class="empty-msg">${emptyMsg}</div>`;
    }
    return html`
      <table class="intel-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Price</th>
            <th>The Eye (Monitoring Focus)</th>
            <th>Heat</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(
            (item) => html`
            <tr>
              <td class="ticker">${item.ticker}</td>
              <td>$${item.price.toFixed(2)}</td>
              <td class="eye-cell">"${item.eye}"</td>
              <td><span class="heat-badge heat-${item.heat.replace("!", "")}">${item.heat}</span></td>
            </tr>
          `,
          )}
        </tbody>
      </table>
    `;
  }

  render() {
    if (this.loading && !this.data) {
      return html`
        <div class="loading-msg">Loading intelligence...</div>
      `;
    }
    if (this.error) {
      return html`<div class="error-msg">${this.error} <button @click="${() => this.loadData()}">Retry</button></div>`;
    }
    if (!this.data) {
      return html`
        <div class="loading-msg">No data available.</div>
      `;
    }

    const { intelligenceFeed, activeIntel, opportunityRadar } = this.data;
    const stockIntel = activeIntel.filter((i) => i.type === "stock");
    const cryptoIntel = activeIntel.filter((i) => (i.type ?? "crypto") === "crypto");

    return html`
      <div class="container">
        <div class="header-row">
          <h2>Watchlist</h2>
          <button class="btn-refresh" @click="${() => this.loadData(true)}" ?disabled="${this.loading}">
            <span class="${this.loading ? "spin" : ""}" style="display:inline-block">${icons.refresh || "R"}</span>
          </button>
        </div>

        <!-- Intelligence Feed -->
        <section>
          <h3>Intelligence Feed</h3>
          <div class="feed-stack">
            ${
              intelligenceFeed.length === 0
                ? html`
                    <div class="empty-msg">No intelligence items yet. AI will populate this feed.</div>
                  `
                : nothing
            }
            ${intelligenceFeed.map((item) => {
              const isExpanded = this.expandedIntelIds.has(item.id);
              return html`
                <div class="feed-card ${isExpanded ? "expanded" : ""}">
                  <div class="feed-header" @click="${() => this.toggleIntel(item.id)}">
                    <div class="feed-title">
                      ${
                        item.isNew
                          ? html`
                              <span class="new-badge">NEW</span>
                            `
                          : nothing
                      }
                      ${item.title}
                    </div>
                    <span class="expand-icon">▼</span>
                  </div>
                  ${
                    isExpanded
                      ? html`
                    <div class="feed-content">
                      <div>
                        <div class="feed-section-label">Summary</div>
                        <div class="feed-text">${item.summary}</div>
                      </div>
                      <div>
                        <div class="feed-section-label">Impact Analysis</div>
                        <div class="feed-text" style="color: var(--accent);">${item.impact}</div>
                      </div>
                      ${
                        item.link
                          ? html`
                        <div style="font-size: 0.85rem; text-align: right;">
                          <a href="${item.link}" target="_blank" style="color: var(--muted);">Read Source -></a>
                        </div>
                      `
                          : nothing
                      }
                    </div>
                  `
                      : nothing
                  }
                </div>
              `;
            })}
          </div>
        </section>

        <!-- Active Intel Board — US Stocks -->
        <section>
          <h3>Active Intel Board</h3>
          <div class="section-subtitle">
            <span class="type-badge type-stock">Stock</span> US Stocks
          </div>
          ${this.renderIntelTable(stockIntel, "No US stocks being watched.")}

          <div class="section-subtitle" style="margin-top: 1.5rem;">
            <span class="type-badge type-crypto">Crypto</span> Crypto
          </div>
          ${this.renderIntelTable(cryptoIntel, "No crypto tickers being watched.")}
        </section>

        <!-- Opportunity Radar -->
        <section>
          <h3>Opportunity Radar</h3>
          <div class="radar-list">
            ${
              opportunityRadar.length === 0
                ? html`
                    <div class="empty-msg">No opportunities detected yet.</div>
                  `
                : nothing
            }
            ${opportunityRadar.map(
              (item) => html`
              <div class="radar-item">
                <span class="ticker">${item.ticker}</span>
                <span class="radar-source">${item.source}</span>
              </div>
            `,
            )}
          </div>
        </section>
      </div>
    `;
  }
}

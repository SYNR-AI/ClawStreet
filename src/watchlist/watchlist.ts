import crypto from "node:crypto";
import type {
  WatchlistStore,
  WatchlistStoreData,
  WatchedTicker,
  IntelligenceItem,
  OpportunityItem,
  HeatLevel,
  TickerType,
} from "./watchlist-store.js";

export class Watchlist {
  private data: WatchlistStoreData;
  private store: WatchlistStore;

  private constructor(store: WatchlistStore, data: WatchlistStoreData) {
    this.store = store;
    this.data = data;
  }

  static async create(store: WatchlistStore): Promise<Watchlist> {
    const data = await store.load();
    return new Watchlist(store, data);
  }

  getWatchedTickers(): WatchedTicker[] {
    return [...this.data.watchedTickers];
  }

  async addTicker(
    ticker: string,
    eye: string,
    heat: HeatLevel = "WARM",
    type: TickerType = "crypto",
  ): Promise<void> {
    const normalized = ticker.toUpperCase();
    const existing = this.data.watchedTickers.find((t) => t.ticker === normalized);
    if (existing) {
      existing.eye = eye;
      existing.heat = heat;
      existing.type = type;
    } else {
      this.data.watchedTickers.push({
        ticker: normalized,
        type,
        eye,
        heat,
        addedAt: new Date().toISOString(),
      });
    }
    await this.store.save(this.data);
  }

  async removeTicker(ticker: string): Promise<boolean> {
    const normalized = ticker.toUpperCase();
    const idx = this.data.watchedTickers.findIndex((t) => t.ticker === normalized);
    if (idx === -1) {
      return false;
    }
    this.data.watchedTickers.splice(idx, 1);
    await this.store.save(this.data);
    return true;
  }

  async updateTicker(ticker: string, update: { eye?: string; heat?: HeatLevel }): Promise<boolean> {
    const normalized = ticker.toUpperCase();
    const item = this.data.watchedTickers.find((t) => t.ticker === normalized);
    if (!item) {
      return false;
    }
    if (update.eye !== undefined) {
      item.eye = update.eye;
    }
    if (update.heat !== undefined) {
      item.heat = update.heat;
    }
    await this.store.save(this.data);
    return true;
  }

  getIntelligenceFeed(limit = 20): IntelligenceItem[] {
    return this.data.intelligenceFeed.slice(-limit).toReversed();
  }

  async addIntelligence(item: Omit<IntelligenceItem, "id" | "date">): Promise<IntelligenceItem> {
    const entry: IntelligenceItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      ...item,
    };
    this.data.intelligenceFeed.push(entry);
    await this.store.save(this.data);
    return entry;
  }

  getOpportunityRadar(): OpportunityItem[] {
    return [...this.data.opportunityRadar];
  }

  async setOpportunityRadar(items: OpportunityItem[]): Promise<void> {
    this.data.opportunityRadar = items;
    await this.store.save(this.data);
  }
}

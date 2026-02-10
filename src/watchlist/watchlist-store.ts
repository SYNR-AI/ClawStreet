import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type HeatLevel = "HOT!" | "WARM" | "COLD";
export type TickerType = "crypto" | "stock";

export interface WatchedTicker {
  ticker: string;
  type: TickerType;
  eye: string;
  heat: HeatLevel;
  addedAt: string;
}

export interface IntelligenceItem {
  id: string;
  title: string;
  link?: string;
  summary: string;
  impact: string;
  date: string;
  isNew?: boolean;
}

export interface OpportunityItem {
  ticker: string;
  source: string;
}

export interface WatchlistStoreData {
  watchedTickers: WatchedTicker[];
  intelligenceFeed: IntelligenceItem[];
  opportunityRadar: OpportunityItem[];
}

const DEFAULT_DATA: WatchlistStoreData = {
  watchedTickers: [],
  intelligenceFeed: [],
  opportunityRadar: [],
};

export class WatchlistStore {
  private storagePath: string;

  constructor(storagePath?: string) {
    const dir = storagePath ?? path.join(os.homedir(), ".openclaw");
    this.storagePath = path.join(dir, "watchlist.json");
  }

  async load(): Promise<WatchlistStoreData> {
    try {
      const raw = await fs.readFile(this.storagePath, "utf-8");
      return JSON.parse(raw) as WatchlistStoreData;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        await this.save(DEFAULT_DATA);
        return structuredClone(DEFAULT_DATA);
      }
      throw err;
    }
  }

  async save(data: WatchlistStoreData): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${this.storagePath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpPath, this.storagePath);
  }
}

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface Holding {
  quantity: number;
  averagePrice: number;
}

export interface Transaction {
  type: "buy" | "sell";
  ticker: string;
  quantity: number;
  price: number;
  date: string;
}

export interface PortfolioData {
  cash: number;
  holdings: Record<string, Holding>;
  transactionHistory: Transaction[];
}

const DEFAULT_DATA: PortfolioData = {
  cash: 100_000,
  holdings: {},
  transactionHistory: [],
};

export class PortfolioStore {
  private storagePath: string;

  constructor(storagePath?: string) {
    const dir = storagePath ?? path.join(os.homedir(), ".clawstreet");
    this.storagePath = path.join(dir, "portfolio.json");
  }

  getPath(): string {
    return this.storagePath;
  }

  async load(): Promise<PortfolioData> {
    try {
      const raw = await fs.readFile(this.storagePath, "utf-8");
      const data: PortfolioData = JSON.parse(raw);
      return data;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // First run — save defaults and return them
        await this.save(DEFAULT_DATA);
        return structuredClone(DEFAULT_DATA);
      }
      throw err;
    }
  }

  async save(data: PortfolioData): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    // Write to temp file then rename for atomicity
    const tmpPath = `${this.storagePath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpPath, this.storagePath);
  }
}

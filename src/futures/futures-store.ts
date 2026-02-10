import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FuturesPosition, FuturesTransaction } from "./futures-position.js";

export interface FuturesData {
  positions: FuturesPosition[];
  transactions: FuturesTransaction[];
  /** Per-ticker leverage settings. Defaults to 20x. */
  leverageSettings: Record<string, number>;
}

const DEFAULT_DATA: FuturesData = {
  positions: [],
  transactions: [],
  leverageSettings: {},
};

export class FuturesStore {
  private storagePath: string;

  constructor(storagePath?: string) {
    const dir = storagePath ?? path.join(os.homedir(), ".openclaw");
    this.storagePath = path.join(dir, "futures-positions.json");
  }

  async load(): Promise<FuturesData> {
    try {
      const raw = await fs.readFile(this.storagePath, "utf-8");
      return JSON.parse(raw) as FuturesData;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        await this.save(DEFAULT_DATA);
        return structuredClone(DEFAULT_DATA);
      }
      throw err;
    }
  }

  async save(data: FuturesData): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${this.storagePath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpPath, this.storagePath);
  }
}

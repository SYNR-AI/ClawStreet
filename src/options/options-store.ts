import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OptionPosition, OptionTransaction } from "./options-position.js";

export interface OptionsData {
  positions: OptionPosition[];
  transactions: OptionTransaction[];
}

const DEFAULT_DATA: OptionsData = {
  positions: [],
  transactions: [],
};

export class OptionsStore {
  private storagePath: string;

  constructor(storagePath?: string) {
    const dir = storagePath ?? path.join(os.homedir(), ".openclaw");
    this.storagePath = path.join(dir, "options-positions.json");
  }

  async load(): Promise<OptionsData> {
    try {
      const raw = await fs.readFile(this.storagePath, "utf-8");
      return JSON.parse(raw) as OptionsData;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        await this.save(DEFAULT_DATA);
        return structuredClone(DEFAULT_DATA);
      }
      throw err;
    }
  }

  async save(data: OptionsData): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${this.storagePath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpPath, this.storagePath);
  }
}

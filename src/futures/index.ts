export { FuturesEngine } from "./futures-engine.js";
export { FuturesStore } from "./futures-store.js";
export type { FuturesData } from "./futures-store.js";
export type { FuturesPosition, FuturesAccount, FuturesTransaction } from "./futures-position.js";
export {
  calcInitialMargin,
  calcMaintenanceMarginRate,
  calcMaintenanceMargin,
  calcLiquidationPrice,
  calcUnrealizedPnl,
  calcROE,
} from "./margin-calculator.js";
export { checkFuturesLiquidation } from "./liquidation-engine.js";
export type { BroadcastFn } from "./liquidation-engine.js";

import type { Portfolio } from "../portfolio/portfolio.js";
import { MarketData } from "../portfolio/market-data.js";
import { FuturesEngine } from "./futures-engine.js";
import { FuturesStore } from "./futures-store.js";

export interface FuturesService {
  futuresEngine: FuturesEngine;
  futuresStore: FuturesStore;
  marketData: MarketData;
}

let servicePromise: Promise<FuturesService> | null = null;

/** Lazily initialise and return the singleton futures service. */
export function getFuturesService(
  portfolio: Portfolio,
  marketData: MarketData,
): Promise<FuturesService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const futuresStore = new FuturesStore();
      const futuresEngine = await FuturesEngine.create(futuresStore, marketData, portfolio);
      return { futuresEngine, futuresStore, marketData };
    })();
  }
  return servicePromise;
}

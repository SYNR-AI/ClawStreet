export { OptionsEngine } from "./options-engine.js";
export type { BroadcastFn } from "./options-engine.js";
export { OptionsStore } from "./options-store.js";
export type { OptionsData } from "./options-store.js";
export type { OptionPosition, OptionContract, OptionTransaction } from "./options-position.js";
export { formatOptionSymbol } from "./options-position.js";
export { generateChain } from "./options-chain.js";
export type { OptionsChain, ChainEntry } from "./options-chain.js";
export {
  calcPremium,
  calcDaysToExpiry,
  calcIntrinsicValue,
  calcTimeValue,
  getImpliedVol,
} from "./options-pricing.js";

import type { Portfolio } from "../portfolio/portfolio.js";
import type { StockMarketData } from "../portfolio/stock-market-data.js";
import { OptionsEngine } from "./options-engine.js";
import { OptionsStore } from "./options-store.js";

export interface OptionsService {
  optionsEngine: OptionsEngine;
  optionsStore: OptionsStore;
}

let servicePromise: Promise<OptionsService> | null = null;

/** Lazily initialise and return the singleton options service. */
export function getOptionsService(
  portfolio: Portfolio,
  stockMarketData: StockMarketData,
): Promise<OptionsService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const optionsStore = new OptionsStore();
      const optionsEngine = await OptionsEngine.create(optionsStore, stockMarketData, portfolio);
      return { optionsEngine, optionsStore };
    })();
  }
  return servicePromise;
}

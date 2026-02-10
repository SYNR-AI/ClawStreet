import type { FuturesEngine } from "../futures/futures-engine.js";
import type { OptionsEngine } from "../options/options-engine.js";
import type { Portfolio } from "../portfolio/portfolio.js";

/**
 * Read-only aggregation across all product lines.
 * Cash balance lives in Portfolio (portfolio.json).
 * Futures/Options engines modify cash via portfolio.adjustCash().
 */
export interface UnifiedAccountSnapshot {
  // Balances
  cash: number;
  totalEquity: number; // cash + spot + futures margin/pnl + options value
  availableBalance: number; // cash (free to use)

  // By product line
  spotEquity: number; // spot holdings market value
  futuresMarginUsed: number;
  futuresUnrealizedPnl: number;
  optionsValue: number;

  // Totals
  totalUnrealizedPnl: number; // spot + futures + options
}

/**
 * Build a unified account snapshot by aggregating data from all product lines.
 * This is a pure read — no state mutation.
 */
export async function getUnifiedAccountSnapshot(
  portfolio: Portfolio,
  spotEquity: number,
  futuresEngine?: FuturesEngine,
  optionsEngine?: OptionsEngine,
): Promise<UnifiedAccountSnapshot> {
  const cash = portfolio.cash;

  // Futures
  let futuresMarginUsed = 0;
  let futuresUnrealizedPnl = 0;
  if (futuresEngine) {
    const account = futuresEngine.getAccount();
    futuresMarginUsed = account.totalMarginUsed;
    futuresUnrealizedPnl = account.totalUnrealizedPnl;
  }

  // Options
  let optionsValue = 0;
  let optionsUnrealizedPnl = 0;
  if (optionsEngine) {
    const positions = await optionsEngine.getPositions();
    for (const pos of positions) {
      optionsValue += pos.currentValue;
      optionsUnrealizedPnl += pos.unrealizedPnl;
    }
  }

  // Spot unrealized P&L = spotEquity - spotCostBasis (computed by caller)
  const spotPnl = 0; // Caller can compute from holdings if needed

  const totalUnrealizedPnl = spotPnl + futuresUnrealizedPnl + optionsUnrealizedPnl;

  const totalEquity = cash + spotEquity + futuresMarginUsed + futuresUnrealizedPnl + optionsValue;

  return {
    cash,
    totalEquity,
    availableBalance: cash,
    spotEquity,
    futuresMarginUsed,
    futuresUnrealizedPnl,
    optionsValue,
    totalUnrealizedPnl,
  };
}

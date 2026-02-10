import type { MarketData } from "../portfolio/market-data.js";
import type { FuturesEngine } from "./futures-engine.js";

export type BroadcastFn = (event: string, data: unknown) => void;

/**
 * Check all futures positions for liquidation conditions.
 * Called every 10 seconds by the gateway interval timer.
 *
 * Long:  liquidated when markPrice <= liquidationPrice
 * Short: liquidated when markPrice >= liquidationPrice
 */
export async function checkFuturesLiquidation(
  futuresEngine: FuturesEngine,
  marketData: MarketData,
  broadcast?: BroadcastFn,
): Promise<void> {
  const positions = futuresEngine.getPositionsRaw();
  if (positions.length === 0) {
    return;
  }

  // Fetch all unique tickers
  const tickers = [...new Set(positions.map((p) => p.ticker))];
  const prices: Record<string, number> = {};

  for (const ticker of tickers) {
    try {
      const symbol = ticker.endsWith("USDT") ? ticker : `${ticker}USDT`;
      const quote = await marketData.fetchQuote(symbol);
      prices[ticker] = quote.price;
    } catch {
      // Skip tickers we can't price — don't liquidate on stale data
    }
  }

  for (const pos of positions) {
    const markPrice = prices[pos.ticker];
    if (markPrice === undefined) {
      continue;
    }

    const shouldLiquidate =
      (pos.side === "long" && markPrice <= pos.liquidationPrice) ||
      (pos.side === "short" && markPrice >= pos.liquidationPrice);

    if (shouldLiquidate) {
      const result = await futuresEngine.liquidatePosition(pos.id, markPrice);
      if (result && broadcast) {
        broadcast("futures.liquidation", {
          ticker: result.ticker,
          side: result.side,
          quantity: result.quantity,
          entryPrice: result.entryPrice,
          markPrice,
          pnl: result.pnl,
          liquidatedAt: new Date().toISOString(),
        });
      }
    }
  }
}

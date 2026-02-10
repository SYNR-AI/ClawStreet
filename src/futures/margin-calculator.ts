/**
 * Margin calculator for crypto perpetual futures.
 * Implements tiered maintenance margin rates matching Binance Futures.
 */

/** Initial margin = notional value / leverage */
export function calcInitialMargin(quantity: number, entryPrice: number, leverage: number): number {
  return (quantity * entryPrice) / leverage;
}

/**
 * Maintenance margin rate based on notional value tiers.
 *   < $50k   → 0.4%
 *   < $250k  → 0.5%
 *   < $1M    → 1.0%
 *   ≥ $1M    → 2.5%
 */
export function calcMaintenanceMarginRate(notionalValue: number): number {
  if (notionalValue < 50_000) {
    return 0.004;
  }
  if (notionalValue < 250_000) {
    return 0.005;
  }
  if (notionalValue < 1_000_000) {
    return 0.01;
  }
  return 0.025;
}

/** Maintenance margin = notional value × maintenance margin rate */
export function calcMaintenanceMargin(quantity: number, markPrice: number, mmRate: number): number {
  return quantity * markPrice * mmRate;
}

/**
 * Liquidation price calculation (isolated margin).
 *
 * Long:  liqPrice = entryPrice × (1 - 1/leverage + mmRate)
 * Short: liqPrice = entryPrice × (1 + 1/leverage - mmRate)
 */
export function calcLiquidationPrice(
  entryPrice: number,
  leverage: number,
  mmRate: number,
  side: "long" | "short",
): number {
  if (side === "long") {
    return entryPrice * (1 - 1 / leverage + mmRate);
  }
  return entryPrice * (1 + 1 / leverage - mmRate);
}

/** Unrealized P&L */
export function calcUnrealizedPnl(
  side: "long" | "short",
  quantity: number,
  entryPrice: number,
  markPrice: number,
): number {
  if (side === "long") {
    return (markPrice - entryPrice) * quantity;
  }
  return (entryPrice - markPrice) * quantity;
}

/** ROE% = unrealizedPnl / initialMargin × 100 */
export function calcROE(unrealizedPnl: number, initialMargin: number): number {
  if (initialMargin === 0) {
    return 0;
  }
  return (unrealizedPnl / initialMargin) * 100;
}

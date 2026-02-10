/**
 * Simplified BSM options pricing.
 * premium = intrinsicValue + timeValue
 *
 * Time value = currentPrice × impliedVol × sqrt(daysToExpiry / 365)
 */

/** Fixed IV tiers by stock category. */
const IV_OVERRIDES: Record<string, number> = {
  // Blue chips / mega caps
  AAPL: 0.25,
  MSFT: 0.25,
  GOOGL: 0.25,
  GOOG: 0.25,
  AMZN: 0.3,
  META: 0.3,
  BRK: 0.2,
  JNJ: 0.2,
  JPM: 0.25,
  V: 0.25,
  // Growth / high-vol
  TSLA: 0.45,
  NVDA: 0.45,
  AMD: 0.45,
  PLTR: 0.5,
  COIN: 0.6,
  SQ: 0.5,
  SHOP: 0.45,
  MSTR: 0.6,
  // Meme stocks
  GME: 0.8,
  AMC: 0.8,
  BBBY: 0.8,
  SPCE: 0.7,
};

const DEFAULT_IV = 0.35;

/** Get implied volatility for a ticker. */
export function getImpliedVol(ticker: string): number {
  return IV_OVERRIDES[ticker.toUpperCase()] ?? DEFAULT_IV;
}

/** Calculate intrinsic value per share. */
export function calcIntrinsicValue(
  currentPrice: number,
  strikePrice: number,
  type: "call" | "put",
): number {
  if (type === "call") {
    return Math.max(currentPrice - strikePrice, 0);
  }
  return Math.max(strikePrice - currentPrice, 0);
}

/** Calculate time value per share. */
export function calcTimeValue(
  currentPrice: number,
  impliedVol: number,
  daysToExpiry: number,
): number {
  if (daysToExpiry <= 0) {
    return 0;
  }
  return currentPrice * impliedVol * Math.sqrt(daysToExpiry / 365);
}

/**
 * Calculate option premium per share.
 * premium = intrinsicValue + timeValue
 */
export function calcPremium(
  currentPrice: number,
  strikePrice: number,
  daysToExpiry: number,
  impliedVol: number,
  type: "call" | "put",
): number {
  const intrinsic = calcIntrinsicValue(currentPrice, strikePrice, type);
  const time = calcTimeValue(currentPrice, impliedVol, daysToExpiry);
  return intrinsic + time;
}

/** Calculate days to expiry from today. */
export function calcDaysToExpiry(expiryDate: string): number {
  const now = new Date();
  const expiry = new Date(expiryDate + "T16:00:00-05:00"); // 4pm ET market close
  const diffMs = expiry.getTime() - now.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

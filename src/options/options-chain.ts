import { calcPremium, getImpliedVol, calcDaysToExpiry } from "./options-pricing.js";

export interface ChainEntry {
  strikePrice: number;
  callPremium: number; // per share
  putPremium: number; // per share
  callPremiumPerContract: number; // per contract (× 100)
  putPremiumPerContract: number;
}

export interface OptionsChain {
  underlying: string;
  currentPrice: number;
  impliedVol: number;
  expiryDates: string[]; // YYYY-MM-DD
  chains: Record<string, ChainEntry[]>; // keyed by expiryDate
}

/**
 * Generate available expiry dates:
 *   1. This Friday (if ≥1 day away, else next Friday)
 *   2. Next Friday
 *   3. This month's 3rd Friday (monthly option)
 *   4. Next month's 3rd Friday
 */
function generateExpiryDates(): string[] {
  const now = new Date();
  const dates = new Set<string>();

  // Helper: get next Friday from a date
  const getNextFriday = (from: Date): Date => {
    const d = new Date(from);
    const day = d.getDay();
    const daysUntilFriday = day <= 5 ? 5 - day : 6; // 0=Sun..6=Sat
    d.setDate(d.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
    return d;
  };

  // Helper: get third Friday of a month
  const getThirdFriday = (year: number, month: number): Date => {
    const first = new Date(year, month, 1);
    const dayOfWeek = first.getDay();
    const firstFriday = dayOfWeek <= 5 ? 1 + (5 - dayOfWeek) : 1 + (12 - dayOfWeek);
    return new Date(year, month, firstFriday + 14); // +14 = third Friday
  };

  const formatDate = (d: Date): string => d.toISOString().slice(0, 10);

  // This Friday (or next if today is Friday/Saturday)
  const thisFriday = getNextFriday(now);
  const daysToThisFriday = (thisFriday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysToThisFriday >= 1) {
    dates.add(formatDate(thisFriday));
  }

  // Next Friday
  const nextFriday = new Date(thisFriday);
  nextFriday.setDate(nextFriday.getDate() + 7);
  dates.add(formatDate(nextFriday));

  // This month's 3rd Friday
  const thisMonth3rdFri = getThirdFriday(now.getFullYear(), now.getMonth());
  if (thisMonth3rdFri > now) {
    dates.add(formatDate(thisMonth3rdFri));
  }

  // Next month's 3rd Friday
  const nextMonth = now.getMonth() + 1;
  const nextMonthYear = nextMonth > 11 ? now.getFullYear() + 1 : now.getFullYear();
  const nextMonth3rdFri = getThirdFriday(nextMonthYear, nextMonth % 12);
  dates.add(formatDate(nextMonth3rdFri));

  return [...dates].toSorted();
}

/**
 * Generate strike prices centered around current price.
 * Spacing: <$50→$1, <$200→$5, <$500→$10, ≥$500→$25
 */
function generateStrikes(currentPrice: number): number[] {
  let step: number;
  if (currentPrice < 50) {
    step = 1;
  } else if (currentPrice < 200) {
    step = 5;
  } else if (currentPrice < 500) {
    step = 10;
  } else {
    step = 25;
  }

  const center = Math.round(currentPrice / step) * step;
  const strikes: number[] = [];
  for (let i = -10; i <= 10; i++) {
    const strike = center + i * step;
    if (strike > 0) {
      strikes.push(strike);
    }
  }
  return strikes;
}

/**
 * Generate a full options chain for a ticker.
 */
export function generateChain(ticker: string, currentPrice: number): OptionsChain {
  const underlying = ticker.toUpperCase();
  const iv = getImpliedVol(underlying);
  const expiryDates = generateExpiryDates();
  const strikes = generateStrikes(currentPrice);

  const chains: Record<string, ChainEntry[]> = {};

  for (const expiry of expiryDates) {
    const dte = calcDaysToExpiry(expiry);
    chains[expiry] = strikes.map((strike) => {
      const callPrem = calcPremium(currentPrice, strike, dte, iv, "call");
      const putPrem = calcPremium(currentPrice, strike, dte, iv, "put");
      return {
        strikePrice: strike,
        callPremium: Math.round(callPrem * 100) / 100,
        putPremium: Math.round(putPrem * 100) / 100,
        callPremiumPerContract: Math.round(callPrem * 100 * 100) / 100,
        putPremiumPerContract: Math.round(putPrem * 100 * 100) / 100,
      };
    });
  }

  return { underlying, currentPrice, impliedVol: iv, expiryDates, chains };
}

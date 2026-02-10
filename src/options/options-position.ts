export interface OptionContract {
  underlying: string; // "NVDA"
  type: "call" | "put";
  strikePrice: number;
  expiryDate: string; // "YYYY-MM-DD"
  multiplier: 100;
  impliedVol: number;
}

export interface OptionPosition {
  id: string; // UUID
  contract: OptionContract;
  assetClass: "us_stock_option";
  contracts: number; // number of contracts held
  premiumPaid: number; // total premium paid at open
  premiumPerShare: number; // per-share premium at open
  currentPremium: number; // current per-share premium (live)
  currentValue: number; // currentPremium × 100 × contracts

  // P&L
  unrealizedPnl: number; // currentValue - premiumPaid
  unrealizedPnlPercent: number;

  // Time
  daysToExpiry: number;
  openedAt: string; // ISO 8601
  expiryDate: string;
}

export interface OptionTransaction {
  type: "buy_call" | "buy_put" | "sell_call" | "sell_put" | "expire_itm" | "expire_otm";
  underlying: string;
  strikePrice: number;
  expiryDate: string;
  contracts: number;
  premiumPerShare: number;
  totalAmount: number; // premium paid or received
  pnl?: number;
  date: string;
}

/** Format: "NVDA-260214-C-800" */
export function formatOptionSymbol(contract: OptionContract): string {
  const dateStr = contract.expiryDate.replace(/-/g, "").slice(2); // YYMMDD
  const typeChar = contract.type === "call" ? "C" : "P";
  return `${contract.underlying}-${dateStr}-${typeChar}-${contract.strikePrice}`;
}

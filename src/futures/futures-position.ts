export interface FuturesPosition {
  id: string;
  ticker: string; // "BTC", "ETH", etc.
  assetClass: "crypto_perp";
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  markPrice: number;
  leverage: number; // 1~150
  marginMode: "isolated";

  // Margin
  initialMargin: number; // entryPrice × quantity / leverage
  maintenanceMargin: number; // markPrice × quantity × mmRate
  marginBalance: number; // initialMargin (isolated: fixed per position)

  // Liquidation
  liquidationPrice: number;
  maintenanceMarginRate: number; // 0.004, 0.005, 0.01, 0.025

  // P&L
  unrealizedPnl: number;
  roe: number; // ROE%
  realizedPnl: number; // accumulated from partial closes

  // Time
  openedAt: string; // ISO 8601
  updatedAt: string;
}

export interface FuturesAccount {
  availableBalance: number;
  totalMarginUsed: number;
  totalUnrealizedPnl: number;
}

export interface FuturesTransaction {
  type: "open_long" | "open_short" | "close_long" | "close_short" | "liquidation";
  ticker: string;
  quantity: number;
  price: number;
  leverage?: number;
  pnl?: number;
  date: string;
}

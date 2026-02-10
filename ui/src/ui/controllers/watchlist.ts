// Watchlist controller — calls Gateway RPC via WebSocket.

import type { GatewayBrowserClient } from "../gateway.ts";

export interface IntelligenceItem {
  id: string;
  title: string;
  link?: string;
  summary: string;
  impact: string;
  date: string;
  isNew?: boolean;
}

export type HeatLevel = "HOT!" | "WARM" | "COLD";
export type TickerType = "crypto" | "stock";

export interface ActiveIntelItem {
  ticker: string;
  type: TickerType;
  price: number;
  eye: string;
  heat: HeatLevel;
}

export interface OpportunityItem {
  ticker: string;
  source: string;
}

export interface WatchlistData {
  intelligenceFeed: IntelligenceItem[];
  activeIntel: ActiveIntelItem[];
  opportunityRadar: OpportunityItem[];
}

interface WatchlistState {
  client: GatewayBrowserClient | null;
  connected: boolean;
}

export async function loadWatchlist(
  state: WatchlistState,
  opts?: { refresh?: boolean },
): Promise<WatchlistData> {
  if (!state.client || !state.connected) {
    throw new Error("Gateway not connected");
  }
  return state.client.request<WatchlistData>(
    "watchlist.get",
    opts?.refresh ? { refresh: true } : {},
  );
}

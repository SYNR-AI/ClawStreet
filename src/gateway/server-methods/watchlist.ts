import type { HeatLevel, TickerType } from "../../watchlist/index.js";
import type { GatewayRequestHandlers } from "./types.js";
import { getWatchlistService, getEnrichedWatchlist } from "../../watchlist/index.js";

export const watchlistHandlers: GatewayRequestHandlers = {
  "watchlist.get": async ({ params, respond }) => {
    try {
      const { refresh } = (params ?? {}) as { refresh?: boolean };
      const { watchlist, marketData, stockMarketData } = await getWatchlistService();
      if (refresh) {
        marketData.clearCache();
        stockMarketData.clearCache();
      }
      const data = await getEnrichedWatchlist(watchlist, marketData, stockMarketData);
      respond(true, data);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "watchlist.add": async ({ params, respond, context }) => {
    const { ticker, eye, heat, type } = params as {
      ticker: string;
      eye?: string;
      heat?: HeatLevel;
      type?: TickerType;
    };

    if (!ticker) {
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: "Missing required field: ticker",
      });
      return;
    }

    try {
      const { watchlist } = await getWatchlistService();
      await watchlist.addTicker(ticker, eye ?? "", heat ?? "WARM", type ?? "crypto");
      context.broadcast("watchlist.updated", { action: "add", ticker: ticker.toUpperCase() });
      respond(true, { success: true, ticker: ticker.toUpperCase(), type: type ?? "crypto" });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "watchlist.remove": async ({ params, respond, context }) => {
    const { ticker } = params as { ticker: string };

    if (!ticker) {
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: "Missing required field: ticker",
      });
      return;
    }

    try {
      const { watchlist } = await getWatchlistService();
      const removed = await watchlist.removeTicker(ticker);
      if (removed) {
        context.broadcast("watchlist.updated", { action: "remove", ticker: ticker.toUpperCase() });
      }
      respond(true, { success: removed, ticker: ticker.toUpperCase() });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "watchlist.update": async ({ params, respond, context }) => {
    const { ticker, eye, heat } = params as {
      ticker: string;
      eye?: string;
      heat?: HeatLevel;
    };

    if (!ticker) {
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: "Missing required field: ticker",
      });
      return;
    }

    try {
      const { watchlist } = await getWatchlistService();
      const updated = await watchlist.updateTicker(ticker, { eye, heat });
      if (updated) {
        context.broadcast("watchlist.updated", { action: "update", ticker: ticker.toUpperCase() });
      }
      respond(true, { success: updated, ticker: ticker.toUpperCase() });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "watchlist.addIntel": async ({ params, respond, context }) => {
    const { title, summary, impact, link, isNew } = params as {
      title: string;
      summary: string;
      impact: string;
      link?: string;
      isNew?: boolean;
    };

    if (!title || !summary || !impact) {
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: "Missing required fields: title, summary, impact",
      });
      return;
    }

    try {
      const { watchlist } = await getWatchlistService();
      const entry = await watchlist.addIntelligence({ title, summary, impact, link, isNew });
      context.broadcast("watchlist.updated", { action: "addIntel", id: entry.id });
      respond(true, { success: true, entry });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },
};

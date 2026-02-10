import type { GatewayRequestHandlers } from "./types.js";
import { getPortfolioService, getEnrichedSnapshot } from "../../portfolio/index.js";

export const portfolioHandlers: GatewayRequestHandlers = {
  "portfolio.get": async ({ params, respond }) => {
    try {
      const { refresh } = (params ?? {}) as { refresh?: boolean };
      const { portfolio, marketData, stockMarketData } = await getPortfolioService();
      if (refresh) {
        marketData.clearCache();
        stockMarketData.clearCache();
      }
      const snapshot = await getEnrichedSnapshot(portfolio, marketData, stockMarketData);
      respond(true, snapshot);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "portfolio.trade": async ({ params, respond, context }) => {
    const { action, ticker, quantity, reasoning, type } = params as {
      action: "buy" | "sell";
      ticker: string;
      quantity: number;
      reasoning?: string;
      type?: "crypto" | "stock";
    };

    if (!action || !ticker || quantity === undefined) {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required fields: action, ticker, quantity",
      });
      return;
    }

    if (action !== "buy" && action !== "sell") {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: `Unsupported action: ${action}. Only "buy" and "sell" are supported. Use futures or options for short selling.`,
      });
      return;
    }

    try {
      const { tradingEngine } = await getPortfolioService();
      const result =
        action === "buy"
          ? await tradingEngine.executeBuy(ticker, quantity, reasoning, type)
          : await tradingEngine.executeSell(ticker, quantity, reasoning, type);

      if (result.success) {
        context.broadcast("portfolio.updated", {
          action,
          ticker: ticker.toUpperCase(),
          quantity,
          price: result.transaction?.price,
        });
      }

      respond(true, result);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "portfolio.transactions": async ({ params, respond }) => {
    const limit = (params as { limit?: number }).limit ?? 50;
    try {
      const { portfolio } = await getPortfolioService();
      const history = portfolio.transactionHistory;
      const sliced = history.slice(-limit).toReversed();
      respond(true, { transactions: sliced, total: history.length });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "portfolio.setMeta": async ({ params, respond }) => {
    const { ticker, thesis, context } = params as {
      ticker: string;
      thesis?: string;
      context?: string;
    };

    if (!ticker) {
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: "Missing required field: ticker",
      });
      return;
    }

    try {
      const { portfolio } = await getPortfolioService();
      await portfolio.setHoldingMeta(ticker.toUpperCase(), { thesis, context });
      respond(true, { success: true, ticker: ticker.toUpperCase(), thesis, context });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "portfolio.reset": async ({ params, respond, context }) => {
    const { cash } = (params ?? {}) as { cash?: number };
    try {
      const { portfolio } = await getPortfolioService();
      await portfolio.reset(cash);
      context.broadcast("portfolio.updated", { action: "reset" });
      respond(true, { success: true, cash: cash ?? 100_000 });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "portfolio.quote": async ({ params, respond }) => {
    const { symbol, symbols, type } = params as {
      symbol?: string;
      symbols?: string[];
      type?: "crypto" | "stock";
    };
    try {
      const { marketData, stockMarketData } = await getPortfolioService();
      const dataSource = type === "stock" ? stockMarketData : marketData;

      if (symbols && symbols.length > 0) {
        const quotes = await dataSource.fetchQuotes(symbols);
        respond(true, { quotes });
        return;
      }

      if (symbol) {
        const quote = await dataSource.fetchQuote(symbol);
        respond(true, quote);
        return;
      }

      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Provide symbol or symbols parameter",
      });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },
};

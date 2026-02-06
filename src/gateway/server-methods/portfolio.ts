import type { GatewayRequestHandlers } from "./types.js";
import { getPortfolioService, getEnrichedSnapshot } from "../../portfolio/index.js";

export const portfolioHandlers: GatewayRequestHandlers = {
  "portfolio.get": async ({ params, respond }) => {
    try {
      const { refresh } = (params ?? {}) as { refresh?: boolean };
      const { portfolio, marketData } = await getPortfolioService();
      if (refresh) marketData.clearCache();
      const snapshot = await getEnrichedSnapshot(portfolio, marketData);
      respond(true, snapshot);
    } catch (err) {
      respond(false, undefined, { code: -1, message: (err as Error).message });
    }
  },

  "portfolio.trade": async ({ params, respond, context }) => {
    const { action, ticker, quantity, price } = params as {
      action: "buy" | "sell";
      ticker: string;
      quantity: number;
      price?: number;
    };

    if (!action || !ticker || quantity === undefined) {
      respond(false, undefined, {
        code: -1,
        message: "Missing required fields: action, ticker, quantity",
      });
      return;
    }

    try {
      const { tradingEngine } = await getPortfolioService();
      const result =
        action === "buy"
          ? await tradingEngine.executeBuy(ticker, quantity, price)
          : await tradingEngine.executeSell(ticker, quantity, price);

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
      respond(false, undefined, { code: -1, message: (err as Error).message });
    }
  },

  "portfolio.transactions": async ({ params, respond }) => {
    const limit = (params as { limit?: number }).limit ?? 50;
    try {
      const { portfolio } = await getPortfolioService();
      const history = portfolio.transactionHistory;
      const sliced = history.slice(-limit).reverse();
      respond(true, { transactions: sliced, total: history.length });
    } catch (err) {
      respond(false, undefined, { code: -1, message: (err as Error).message });
    }
  },

  "portfolio.quote": async ({ params, respond }) => {
    const { symbol, symbols } = params as { symbol?: string; symbols?: string[] };
    try {
      const { marketData } = await getPortfolioService();

      if (symbols && symbols.length > 0) {
        const quotes = await marketData.fetchQuotes(symbols);
        respond(true, { quotes });
        return;
      }

      if (symbol) {
        const quote = await marketData.fetchQuote(symbol);
        respond(true, quote);
        return;
      }

      respond(false, undefined, { code: -1, message: "Provide symbol or symbols parameter" });
    } catch (err) {
      respond(false, undefined, { code: -1, message: (err as Error).message });
    }
  },
};

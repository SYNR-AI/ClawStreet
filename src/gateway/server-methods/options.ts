import type { GatewayRequestHandlers } from "./types.js";
import { getOptionsService, generateChain } from "../../options/index.js";
import { getPortfolioService } from "../../portfolio/index.js";

async function getService() {
  const { portfolio, stockMarketData } = await getPortfolioService();
  return getOptionsService(portfolio, stockMarketData);
}

export const optionsHandlers: GatewayRequestHandlers = {
  "options.chain": async ({ params, respond }) => {
    const { ticker } = params as { ticker: string };
    if (!ticker) {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required field: ticker",
      });
      return;
    }

    try {
      const { stockMarketData } = await getPortfolioService();
      const quote = await stockMarketData.fetchQuote(ticker.toUpperCase());
      const chain = generateChain(ticker, quote.price);
      respond(true, chain);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "options.buy": async ({ params, respond, context }) => {
    const { ticker, type, strikePrice, expiryDate, contracts } = params as {
      ticker: string;
      type: "call" | "put";
      strikePrice: number;
      expiryDate: string;
      contracts: number;
    };

    if (!ticker || !type || strikePrice === undefined || !expiryDate || contracts === undefined) {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required fields: ticker, type, strikePrice, expiryDate, contracts",
      });
      return;
    }

    try {
      const { optionsEngine } = await getService();
      const result = await optionsEngine.buyOption(
        ticker,
        type,
        strikePrice,
        expiryDate,
        contracts,
      );

      if (result.success) {
        context.broadcast("options.updated", {
          action: `buy_${type}`,
          ticker: ticker.toUpperCase(),
          strikePrice,
          expiryDate,
          contracts,
        });
      }

      respond(true, result);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "options.sell": async ({ params, respond, context }) => {
    const { positionId, contracts } = params as {
      positionId: string;
      contracts?: number;
    };

    if (!positionId) {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required field: positionId",
      });
      return;
    }

    try {
      const { optionsEngine } = await getService();
      const result = await optionsEngine.sellOption(positionId, contracts);

      if (result.success) {
        context.broadcast("options.updated", {
          action: "sell",
          positionId,
          contracts,
          pnl: result.pnl,
        });
      }

      respond(true, result);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "options.positions": async ({ respond }) => {
    try {
      const { optionsEngine } = await getService();
      const positions = await optionsEngine.getPositions();
      respond(true, { positions });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "options.quote": async ({ params, respond }) => {
    const { ticker, type, strikePrice, expiryDate } = params as {
      ticker: string;
      type: "call" | "put";
      strikePrice: number;
      expiryDate: string;
    };

    if (!ticker || !type || strikePrice === undefined || !expiryDate) {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required fields: ticker, type, strikePrice, expiryDate",
      });
      return;
    }

    try {
      const { optionsEngine } = await getService();
      const quote = await optionsEngine.getQuote(ticker, type, strikePrice, expiryDate);
      respond(true, quote);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },
};

import type { GatewayRequestHandlers } from "./types.js";
import { getFuturesService } from "../../futures/index.js";
import { getPortfolioService } from "../../portfolio/index.js";

async function getService() {
  const { portfolio, marketData } = await getPortfolioService();
  return getFuturesService(portfolio, marketData);
}

export const futuresHandlers: GatewayRequestHandlers = {
  "futures.positions": async ({ respond }) => {
    try {
      const { futuresEngine } = await getService();
      const positions = await futuresEngine.getPositions();
      respond(true, { positions });
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "futures.open": async ({ params, respond, context }) => {
    const { side, ticker, quantity, leverage } = params as {
      side: "long" | "short";
      ticker: string;
      quantity: number;
      leverage?: number;
    };

    if (!side || !ticker || quantity === undefined) {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required fields: side, ticker, quantity",
      });
      return;
    }

    if (side !== "long" && side !== "short") {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: `Invalid side: ${side}. Must be "long" or "short".`,
      });
      return;
    }

    try {
      const { futuresEngine } = await getService();
      const result =
        side === "long"
          ? await futuresEngine.openLong(ticker, quantity, leverage)
          : await futuresEngine.openShort(ticker, quantity, leverage);

      if (result.success) {
        context.broadcast("futures.updated", {
          action: `open_${side}`,
          ticker: ticker.toUpperCase(),
          quantity,
          leverage,
        });
      }

      respond(true, result);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "futures.close": async ({ params, respond, context }) => {
    const { positionId, quantity } = params as {
      positionId: string;
      quantity?: number;
    };

    if (!positionId) {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required field: positionId",
      });
      return;
    }

    try {
      const { futuresEngine } = await getService();
      const result = await futuresEngine.closePosition(positionId, quantity);

      if (result.success) {
        context.broadcast("futures.updated", {
          action: "close",
          positionId,
          quantity,
          pnl: result.pnl,
        });
      }

      respond(true, result);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "futures.leverage": async ({ params, respond }) => {
    const { ticker, leverage } = params as {
      ticker: string;
      leverage: number;
    };

    if (!ticker || leverage === undefined) {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required fields: ticker, leverage",
      });
      return;
    }

    try {
      const { futuresEngine } = await getService();
      const result = await futuresEngine.setLeverage(ticker, leverage);
      respond(true, result);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },

  "futures.account": async ({ respond }) => {
    try {
      const { futuresEngine } = await getService();
      await futuresEngine.getPositions(); // refresh prices
      const account = futuresEngine.getAccount();
      respond(true, account);
    } catch (err) {
      respond(false, undefined, { code: "INTERNAL_ERROR", message: (err as Error).message });
    }
  },
};

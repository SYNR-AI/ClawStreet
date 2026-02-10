import { Type } from "@sinclair/typebox";
import { getFuturesService } from "../../futures/index.js";
import { getPortfolioService } from "../../portfolio/index.js";
import { jsonResult, type AnyAgentTool, readStringParam, readNumberParam } from "./common.js";

async function getService() {
  const { portfolio, marketData } = await getPortfolioService();
  return getFuturesService(portfolio, marketData);
}

export function createFuturesTools(): AnyAgentTool[] {
  return [
    {
      label: "Futures Open Long",
      name: "futures_open_long",
      description:
        "Open a long (buy) perpetual futures position at market price. Profits when price goes up. Crypto only (BTC, ETH, SOL, etc.).",
      parameters: Type.Object({
        ticker: Type.String({
          description: "Crypto ticker symbol (e.g., BTC, ETH, SOL)",
        }),
        quantity: Type.Number({ description: "Position size in base units (e.g., 0.1 BTC)" }),
        leverage: Type.Optional(
          Type.Number({
            description:
              "Leverage multiplier 1-150. Defaults to the ticker's saved leverage (default 20x).",
          }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const quantity = readNumberParam(params, "quantity");
        const leverage = readNumberParam(params, "leverage");

        if (!ticker || quantity === undefined) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, quantity",
          });
        }

        try {
          const { futuresEngine } = await getService();
          const result = await futuresEngine.openLong(ticker, quantity, leverage);
          return jsonResult(result);
        } catch (err) {
          return jsonResult({ success: false, error: `Futures error: ${(err as Error).message}` });
        }
      },
    },
    {
      label: "Futures Open Short",
      name: "futures_open_short",
      description:
        "Open a short (sell) perpetual futures position at market price. Profits when price goes down. Crypto only.",
      parameters: Type.Object({
        ticker: Type.String({
          description: "Crypto ticker symbol (e.g., BTC, ETH, SOL)",
        }),
        quantity: Type.Number({ description: "Position size in base units (e.g., 0.1 BTC)" }),
        leverage: Type.Optional(
          Type.Number({
            description:
              "Leverage multiplier 1-150. Defaults to the ticker's saved leverage (default 20x).",
          }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const quantity = readNumberParam(params, "quantity");
        const leverage = readNumberParam(params, "leverage");

        if (!ticker || quantity === undefined) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, quantity",
          });
        }

        try {
          const { futuresEngine } = await getService();
          const result = await futuresEngine.openShort(ticker, quantity, leverage);
          return jsonResult(result);
        } catch (err) {
          return jsonResult({ success: false, error: `Futures error: ${(err as Error).message}` });
        }
      },
    },
    {
      label: "Futures Close",
      name: "futures_close",
      description:
        "Close a perpetual futures position (partial or full) at market price. If quantity is omitted, closes the entire position.",
      parameters: Type.Object({
        ticker: Type.String({
          description:
            "Crypto ticker symbol to close (e.g., BTC). Will find the matching open position.",
        }),
        quantity: Type.Optional(
          Type.Number({ description: "Quantity to close. Omit to close entire position." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const quantity = readNumberParam(params, "quantity");

        if (!ticker) {
          return jsonResult({ success: false, error: "Missing required parameter: ticker" });
        }

        try {
          const { futuresEngine } = await getService();
          const positions = await futuresEngine.getPositions();
          const pos = positions.find((p) => p.ticker === ticker.toUpperCase());
          if (!pos) {
            return jsonResult({
              success: false,
              error: `No open position for ${ticker.toUpperCase()}.`,
            });
          }
          const result = await futuresEngine.closePosition(pos.id, quantity);
          return jsonResult(result);
        } catch (err) {
          return jsonResult({ success: false, error: `Futures error: ${(err as Error).message}` });
        }
      },
    },
    {
      label: "Futures Get",
      name: "futures_get",
      description:
        "Get all open perpetual futures positions with live P&L, margin info, leverage, and liquidation price.",
      parameters: Type.Object({}),
      execute: async () => {
        try {
          const { futuresEngine } = await getService();
          const positions = await futuresEngine.getPositions();
          const account = futuresEngine.getAccount();
          return jsonResult({ positions, account });
        } catch (err) {
          return jsonResult({ success: false, error: `Futures error: ${(err as Error).message}` });
        }
      },
    },
    {
      label: "Futures Set Leverage",
      name: "futures_set_leverage",
      description:
        "Set the leverage for a crypto ticker. Only works when no open position exists for that ticker. Range: 1-150x.",
      parameters: Type.Object({
        ticker: Type.String({ description: "Crypto ticker symbol (e.g., BTC, ETH)" }),
        leverage: Type.Number({ description: "Leverage multiplier (1-150)" }),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const leverage = readNumberParam(params, "leverage");

        if (!ticker || leverage === undefined) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, leverage",
          });
        }

        try {
          const { futuresEngine } = await getService();
          const result = await futuresEngine.setLeverage(ticker, leverage);
          return jsonResult(result);
        } catch (err) {
          return jsonResult({ success: false, error: `Futures error: ${(err as Error).message}` });
        }
      },
    },
  ];
}

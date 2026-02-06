import { Type } from "@sinclair/typebox";
import { getPortfolioService, getEnrichedSnapshot } from "../../portfolio/index.js";
import { jsonResult, type AnyAgentTool, readStringParam, readNumberParam } from "./common.js";

export function createPortfolioTools(): AnyAgentTool[] {
  return [
    {
      label: "Portfolio Get",
      name: "portfolio_get",
      description:
        "Get the current portfolio status, including cash balance, holdings with live market prices and P&L, and transaction count.",
      parameters: Type.Object({}),
      execute: async () => {
        try {
          const { portfolio, marketData } = await getPortfolioService();
          const data = await getEnrichedSnapshot(portfolio, marketData);
          return jsonResult(data);
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Portfolio error: ${(err as Error).message}`,
          });
        }
      },
    },
    {
      label: "Portfolio Buy",
      name: "portfolio_buy",
      description:
        "Buy a stock/crypto. If price is omitted, the current market price from Binance is used.",
      parameters: Type.Object({
        ticker: Type.String({ description: "The ticker symbol (e.g., BTCUSDT, ETHUSDT)" }),
        quantity: Type.Number({ description: "The number of units to buy" }),
        price: Type.Optional(
          Type.Number({ description: "Price per unit. Omit to use market price." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const quantity = readNumberParam(params, "quantity");
        const price = readNumberParam(params, "price");

        if (!ticker || quantity === undefined) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, quantity",
          });
        }

        try {
          const { tradingEngine } = await getPortfolioService();
          const result = await tradingEngine.executeBuy(ticker.toUpperCase(), quantity, price);
          return jsonResult(result);
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Portfolio error: ${(err as Error).message}`,
          });
        }
      },
    },
    {
      label: "Portfolio Sell",
      name: "portfolio_sell",
      description:
        "Sell a stock/crypto. If price is omitted, the current market price from Binance is used.",
      parameters: Type.Object({
        ticker: Type.String({ description: "The ticker symbol (e.g., BTCUSDT, ETHUSDT)" }),
        quantity: Type.Number({ description: "The number of units to sell" }),
        price: Type.Optional(
          Type.Number({ description: "Price per unit. Omit to use market price." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const quantity = readNumberParam(params, "quantity");
        const price = readNumberParam(params, "price");

        if (!ticker || quantity === undefined) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, quantity",
          });
        }

        try {
          const { tradingEngine } = await getPortfolioService();
          const result = await tradingEngine.executeSell(ticker.toUpperCase(), quantity, price);
          return jsonResult(result);
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Portfolio error: ${(err as Error).message}`,
          });
        }
      },
    },
    {
      label: "Market Data Quote",
      name: "market_data_quote",
      description:
        "Get the current market price for a symbol from Binance (e.g., BTCUSDT, ETHUSDT, SOLUSDT).",
      parameters: Type.Object({
        symbol: Type.String({ description: "The trading pair symbol (e.g., BTCUSDT)" }),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const symbol = readStringParam(params, "symbol");

        if (!symbol) {
          return jsonResult({ success: false, error: "Missing required parameter: symbol" });
        }

        try {
          const { marketData } = await getPortfolioService();
          const quote = await marketData.fetchQuote(symbol.toUpperCase());
          return jsonResult(quote);
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Market data error: ${(err as Error).message}`,
          });
        }
      },
    },
  ];
}

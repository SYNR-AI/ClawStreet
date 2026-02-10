import { Type } from "@sinclair/typebox";
import type { AssetType } from "../../portfolio/index.js";
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
          const { portfolio, marketData, stockMarketData } = await getPortfolioService();
          const data = await getEnrichedSnapshot(portfolio, marketData, stockMarketData);
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
        "Buy a stock/crypto at market price (Binance for crypto, Yahoo Finance for stocks). Use type='stock' for US stocks (e.g., AAPL, NVDA) and type='crypto' for crypto (e.g., BTC, ETH).",
      parameters: Type.Object({
        ticker: Type.String({
          description: "The ticker symbol (e.g., BTC, ETH for crypto; AAPL, NVDA for stocks)",
        }),
        quantity: Type.Number({ description: "The number of units to buy" }),
        reasoning: Type.Optional(
          Type.String({ description: "The reasoning/logic behind this trade decision." }),
        ),
        type: Type.Optional(
          Type.String({ description: "Asset type: 'crypto' or 'stock'. Defaults to 'crypto'." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const quantity = readNumberParam(params, "quantity");
        const reasoning = readStringParam(params, "reasoning");
        const type = (readStringParam(params, "type") as AssetType) || undefined;

        if (!ticker || quantity === undefined) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, quantity",
          });
        }

        try {
          const { tradingEngine } = await getPortfolioService();
          const result = await tradingEngine.executeBuy(
            ticker.toUpperCase(),
            quantity,
            reasoning,
            type,
          );
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
        "Sell a stock/crypto at market price (Binance for crypto, Yahoo Finance for stocks). Use type='stock' for US stocks.",
      parameters: Type.Object({
        ticker: Type.String({
          description: "The ticker symbol (e.g., BTC, ETH for crypto; AAPL, NVDA for stocks)",
        }),
        quantity: Type.Number({ description: "The number of units to sell" }),
        reasoning: Type.Optional(
          Type.String({ description: "The reasoning/logic behind this trade decision." }),
        ),
        type: Type.Optional(
          Type.String({ description: "Asset type: 'crypto' or 'stock'. Defaults to 'crypto'." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const quantity = readNumberParam(params, "quantity");
        const reasoning = readStringParam(params, "reasoning");
        const type = (readStringParam(params, "type") as AssetType) || undefined;

        if (!ticker || quantity === undefined) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, quantity",
          });
        }

        try {
          const { tradingEngine } = await getPortfolioService();
          const result = await tradingEngine.executeSell(
            ticker.toUpperCase(),
            quantity,
            reasoning,
            type,
          );
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
      label: "Portfolio Set Meta",
      name: "portfolio_set_meta",
      description:
        "Set thesis and/or context memo for a portfolio holding. Use this to record your investment thesis or user notes on a position.",
      parameters: Type.Object({
        ticker: Type.String({ description: "The ticker symbol (e.g., BTCUSDT, ETHUSDT)" }),
        thesis: Type.Optional(
          Type.String({ description: "The current investment thesis for holding this position." }),
        ),
        context: Type.Optional(
          Type.String({
            description: "User memo or context note (e.g., source of tip, personal notes).",
          }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const thesis = readStringParam(params, "thesis");
        const context = readStringParam(params, "context");

        if (!ticker) {
          return jsonResult({ success: false, error: "Missing required parameter: ticker" });
        }

        try {
          const { portfolio } = await getPortfolioService();
          await portfolio.setHoldingMeta(ticker.toUpperCase(), { thesis, context });
          return jsonResult({ success: true, ticker: ticker.toUpperCase(), thesis, context });
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
        "Get the current market price for a symbol. Use type='stock' for US stocks (AAPL, NVDA, etc.) or type='crypto' (default) for crypto (BTCUSDT, ETHUSDT, etc.).",
      parameters: Type.Object({
        symbol: Type.String({
          description: "The ticker symbol (e.g., BTCUSDT for crypto, AAPL for stock)",
        }),
        type: Type.Optional(
          Type.String({ description: "Asset type: 'crypto' or 'stock'. Defaults to 'crypto'." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const symbol = readStringParam(params, "symbol");
        const type = (readStringParam(params, "type") as AssetType) || "crypto";

        if (!symbol) {
          return jsonResult({ success: false, error: "Missing required parameter: symbol" });
        }

        try {
          const { marketData, stockMarketData } = await getPortfolioService();
          const dataSource = type === "stock" ? stockMarketData : marketData;
          const quote = await dataSource.fetchQuote(symbol.toUpperCase());
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

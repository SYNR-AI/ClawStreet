import { Type } from "@sinclair/typebox";
import { getOptionsService, generateChain } from "../../options/index.js";
import { getPortfolioService } from "../../portfolio/index.js";
import { jsonResult, type AnyAgentTool, readStringParam, readNumberParam } from "./common.js";

async function getService() {
  const { portfolio, stockMarketData } = await getPortfolioService();
  return { ...(await getOptionsService(portfolio, stockMarketData)), stockMarketData };
}

export function createOptionsTools(): AnyAgentTool[] {
  return [
    {
      label: "Options Chain",
      name: "options_chain",
      description:
        "Get the options chain for a US stock. Returns available expiry dates and strike prices with Call/Put premiums.",
      parameters: Type.Object({
        ticker: Type.String({
          description: "US stock ticker (e.g., NVDA, AAPL, TSLA)",
        }),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        if (!ticker) {
          return jsonResult({ success: false, error: "Missing required parameter: ticker" });
        }

        try {
          const { stockMarketData } = await getService();
          const quote = await stockMarketData.fetchQuote(ticker.toUpperCase());
          const chain = generateChain(ticker, quote.price);
          return jsonResult(chain);
        } catch (err) {
          return jsonResult({ success: false, error: `Options error: ${(err as Error).message}` });
        }
      },
    },
    {
      label: "Options Buy",
      name: "options_buy",
      description:
        "Buy an option (Long Call or Long Put). Pays premium upfront. Max loss = premium paid. Each contract = 100 shares.",
      parameters: Type.Object({
        ticker: Type.String({ description: "US stock ticker (e.g., NVDA, AAPL)" }),
        type: Type.String({ description: "'call' for bullish bet, 'put' for bearish bet" }),
        strikePrice: Type.Number({ description: "Strike price" }),
        expiryDate: Type.String({ description: "Expiry date in YYYY-MM-DD format" }),
        contracts: Type.Number({
          description: "Number of contracts to buy (1 contract = 100 shares)",
        }),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const type = readStringParam(params, "type") as "call" | "put" | undefined;
        const strikePrice = readNumberParam(params, "strikePrice");
        const expiryDate = readStringParam(params, "expiryDate");
        const contracts = readNumberParam(params, "contracts");

        if (
          !ticker ||
          !type ||
          strikePrice === undefined ||
          !expiryDate ||
          contracts === undefined
        ) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, type, strikePrice, expiryDate, contracts",
          });
        }

        if (type !== "call" && type !== "put") {
          return jsonResult({ success: false, error: "type must be 'call' or 'put'" });
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
          return jsonResult(result);
        } catch (err) {
          return jsonResult({ success: false, error: `Options error: ${(err as Error).message}` });
        }
      },
    },
    {
      label: "Options Sell",
      name: "options_sell",
      description: "Sell (close) an option position before expiry. Receives current premium value.",
      parameters: Type.Object({
        ticker: Type.String({
          description: "US stock ticker to find matching position (e.g., NVDA)",
        }),
        contracts: Type.Optional(
          Type.Number({ description: "Number of contracts to sell. Omit to sell all." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const contracts = readNumberParam(params, "contracts");

        if (!ticker) {
          return jsonResult({ success: false, error: "Missing required parameter: ticker" });
        }

        try {
          const { optionsEngine } = await getService();
          const positions = await optionsEngine.getPositions();
          const pos = positions.find((p) => p.contract.underlying === ticker.toUpperCase());
          if (!pos) {
            return jsonResult({
              success: false,
              error: `No open option position for ${ticker.toUpperCase()}.`,
            });
          }
          const result = await optionsEngine.sellOption(pos.id, contracts);
          return jsonResult(result);
        } catch (err) {
          return jsonResult({ success: false, error: `Options error: ${(err as Error).message}` });
        }
      },
    },
    {
      label: "Options Get",
      name: "options_get",
      description:
        "Get all open option positions with live P&L, current premium, and days to expiry.",
      parameters: Type.Object({}),
      execute: async () => {
        try {
          const { optionsEngine } = await getService();
          const positions = await optionsEngine.getPositions();
          return jsonResult({ positions });
        } catch (err) {
          return jsonResult({ success: false, error: `Options error: ${(err as Error).message}` });
        }
      },
    },
    {
      label: "Options Quote",
      name: "options_quote",
      description:
        "Get a premium quote for a specific option contract (intrinsic value, time value, total premium).",
      parameters: Type.Object({
        ticker: Type.String({ description: "US stock ticker (e.g., NVDA)" }),
        type: Type.String({ description: "'call' or 'put'" }),
        strikePrice: Type.Number({ description: "Strike price" }),
        expiryDate: Type.String({ description: "Expiry date in YYYY-MM-DD format" }),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const type = readStringParam(params, "type") as "call" | "put" | undefined;
        const strikePrice = readNumberParam(params, "strikePrice");
        const expiryDate = readStringParam(params, "expiryDate");

        if (!ticker || !type || strikePrice === undefined || !expiryDate) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: ticker, type, strikePrice, expiryDate",
          });
        }

        try {
          const { optionsEngine } = await getService();
          const quote = await optionsEngine.getQuote(ticker, type, strikePrice, expiryDate);
          return jsonResult(quote);
        } catch (err) {
          return jsonResult({ success: false, error: `Options error: ${(err as Error).message}` });
        }
      },
    },
  ];
}

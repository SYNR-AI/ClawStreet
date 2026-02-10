import { Type } from "@sinclair/typebox";
import type { HeatLevel, TickerType } from "../../watchlist/index.js";
import { getWatchlistService, getEnrichedWatchlist } from "../../watchlist/index.js";
import { jsonResult, type AnyAgentTool, readStringParam } from "./common.js";

export function createWatchlistTools(): AnyAgentTool[] {
  return [
    {
      label: "Watchlist Get",
      name: "watchlist_get",
      description:
        "Get the current watchlist including watched tickers with live prices, intelligence feed, and opportunity radar.",
      parameters: Type.Object({}),
      execute: async () => {
        try {
          const { watchlist, marketData, stockMarketData } = await getWatchlistService();
          const data = await getEnrichedWatchlist(watchlist, marketData, stockMarketData);
          return jsonResult(data);
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Watchlist error: ${(err as Error).message}`,
          });
        }
      },
    },
    {
      label: "Watchlist Add",
      name: "watchlist_add",
      description:
        "Add a ticker to the watchlist with a monitoring focus description and heat level. Use type='stock' for US stocks (e.g., AAPL, MSFT) and type='crypto' for crypto (e.g., BTCUSDT).",
      parameters: Type.Object({
        ticker: Type.String({ description: "The ticker symbol to watch (e.g., BTCUSDT, AAPL)" }),
        eye: Type.String({
          description: "What to monitor for this ticker (e.g., 'Watching for $180 breakout')",
        }),
        heat: Type.Optional(
          Type.String({ description: "Heat level: HOT!, WARM, or COLD. Defaults to WARM." }),
        ),
        type: Type.Optional(
          Type.String({ description: "Ticker type: 'crypto' or 'stock'. Defaults to 'crypto'." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const eye = readStringParam(params, "eye");
        const heat = (readStringParam(params, "heat") as HeatLevel) || "WARM";
        const type = (readStringParam(params, "type") as TickerType) || "crypto";

        if (!ticker || !eye) {
          return jsonResult({ success: false, error: "Missing required parameters: ticker, eye" });
        }

        try {
          const { watchlist } = await getWatchlistService();
          await watchlist.addTicker(ticker.toUpperCase(), eye, heat, type);
          return jsonResult({ success: true, ticker: ticker.toUpperCase(), eye, heat, type });
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Watchlist error: ${(err as Error).message}`,
          });
        }
      },
    },
    {
      label: "Watchlist Remove",
      name: "watchlist_remove",
      description: "Remove a ticker from the watchlist.",
      parameters: Type.Object({
        ticker: Type.String({ description: "The ticker symbol to remove" }),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");

        if (!ticker) {
          return jsonResult({ success: false, error: "Missing required parameter: ticker" });
        }

        try {
          const { watchlist } = await getWatchlistService();
          const removed = await watchlist.removeTicker(ticker);
          return jsonResult({ success: removed, ticker: ticker.toUpperCase() });
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Watchlist error: ${(err as Error).message}`,
          });
        }
      },
    },
    {
      label: "Watchlist Update",
      name: "watchlist_update",
      description: "Update the monitoring focus (eye) and/or heat level for a watched ticker.",
      parameters: Type.Object({
        ticker: Type.String({ description: "The ticker symbol to update" }),
        eye: Type.Optional(Type.String({ description: "New monitoring focus description" })),
        heat: Type.Optional(Type.String({ description: "New heat level: HOT!, WARM, or COLD" })),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const ticker = readStringParam(params, "ticker");
        const eye = readStringParam(params, "eye");
        const heat = readStringParam(params, "heat") as HeatLevel | undefined;

        if (!ticker) {
          return jsonResult({ success: false, error: "Missing required parameter: ticker" });
        }

        try {
          const { watchlist } = await getWatchlistService();
          const updated = await watchlist.updateTicker(ticker, { eye, heat });
          return jsonResult({ success: updated, ticker: ticker.toUpperCase() });
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Watchlist error: ${(err as Error).message}`,
          });
        }
      },
    },
    {
      label: "Watchlist Add Intel",
      name: "watchlist_add_intel",
      description:
        "Push an intelligence item to the watchlist feed (news, analysis, macro update).",
      parameters: Type.Object({
        title: Type.String({ description: "Intelligence headline/title" }),
        summary: Type.String({ description: "Main content summary" }),
        impact: Type.String({ description: "Impact analysis on relevant tickers/sectors" }),
        link: Type.Optional(Type.String({ description: "Source URL" })),
        isNew: Type.Optional(
          Type.Boolean({ description: "Mark as new/unread. Defaults to true." }),
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const title = readStringParam(params, "title");
        const summary = readStringParam(params, "summary");
        const impact = readStringParam(params, "impact");
        const link = readStringParam(params, "link");
        const isNew = params.isNew !== undefined ? Boolean(params.isNew) : true;

        if (!title || !summary || !impact) {
          return jsonResult({
            success: false,
            error: "Missing required parameters: title, summary, impact",
          });
        }

        try {
          const { watchlist } = await getWatchlistService();
          const entry = await watchlist.addIntelligence({
            title,
            summary,
            impact,
            ...(link ? { link } : {}),
            isNew,
          });
          return jsonResult({ success: true, entry });
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Watchlist error: ${(err as Error).message}`,
          });
        }
      },
    },
    {
      label: "Watchlist Set Opportunities",
      name: "watchlist_set_opportunities",
      description: "Replace the opportunity radar with a new set of opportunities.",
      parameters: Type.Object({
        opportunities: Type.Array(
          Type.Object({
            ticker: Type.String({ description: "Ticker symbol" }),
            source: Type.String({ description: "Source/reason for the opportunity" }),
          }),
          { description: "Array of opportunity items" },
        ),
      }),
      execute: async (_toolCallId, args) => {
        const params = args as Record<string, unknown>;
        const opportunities = params.opportunities as Array<{ ticker: string; source: string }>;

        if (!opportunities || !Array.isArray(opportunities)) {
          return jsonResult({ success: false, error: "Missing required parameter: opportunities" });
        }

        try {
          const { watchlist } = await getWatchlistService();
          await watchlist.setOpportunityRadar(opportunities);
          return jsonResult({ success: true, count: opportunities.length });
        } catch (err) {
          return jsonResult({
            success: false,
            error: `Watchlist error: ${(err as Error).message}`,
          });
        }
      },
    },
  ];
}

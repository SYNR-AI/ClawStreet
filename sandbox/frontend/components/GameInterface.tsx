import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "../hooks/useChat";
import { useGateway } from "../hooks/useGateway";
import intro from "../intro.json";
import gameData from "../messages.json";
import { ANALYST_PROMPT, FEEDBACK_AGREE, FEEDBACK_DISAGREE, SETTLEMENT_PROMPT } from "../prompts";
import DeskSection from "./DeskSection";
import SettlementOverlay from "./SettlementOverlay";
import WallSection from "./WallSection";

const isChinese = /^zh\b/i.test(navigator.language);
const introPages = isChinese ? intro.zh : intro.en;
const introTitles = isChinese
  ? ["游戏背景", "基本玩法", "详细规则"]
  : ["BRIEFING", "HOW TO PLAY", "RULES"];

type Phase = "idle" | "processing" | "awaiting_action";

interface Trade {
  side: "BUY" | "SELL";
  qty: number;
  symbol: string;
}

interface Portfolio {
  cash: number;
  holdings: { symbol: string; qty: number; avgPrice: number }[];
  trades: { side: string; symbol: string; qty: number; price: number; date: string }[];
}

function parseTrade(text: string): Trade | null {
  const match = text.match(/(?:【操作】|\[ACTION\])\s*(BUY|SELL|HOLD)\s*(\d*)\s*(GOOG)?/i);
  if (!match) {
    return null;
  }
  const side = match[1].toUpperCase();
  if (side === "HOLD") {
    return null;
  }
  const qty = parseInt(match[2], 10);
  if (!qty || qty <= 0) {
    return null;
  }
  return { side: side as "BUY" | "SELL", qty, symbol: "GOOG" };
}

interface GameInterfaceProps {
  url?: string;
}

const { messages, settlement, initialPortfolio, initialPrice } = gameData;
const INITIAL_PORTFOLIO: Portfolio = {
  cash: initialPortfolio.cash,
  holdings: initialPortfolio.holdings.map((h) => ({
    ...h,
    avgPrice: initialPrice,
  })),
  trades: [],
};
const INITIAL_VALUE =
  initialPortfolio.cash +
  initialPortfolio.holdings.reduce((sum, h) => sum + h.qty * initialPrice, 0);

const GameInterface: React.FC<GameInterfaceProps> = ({ url }) => {
  const gateway = useGateway(url);
  const chat = useChat(gateway);
  const [messageIndex, setMessageIndex] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introPage, setIntroPage] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scrollOpen, setScrollOpen] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio>(INITIAL_PORTFOLIO);
  const [pendingTrade, setPendingTrade] = useState<Trade | null>(null);
  const [transition, setTransition] = useState<{
    date: string;
    time: string;
    label?: string;
    duration: number;
    hold?: boolean;
  } | null>(null);
  const [showSettlement, setShowSettlement] = useState(false);

  const msg = messages[messageIndex];

  // Refs to avoid stale closures
  const messageIndexRef = useRef(messageIndex);
  messageIndexRef.current = messageIndex;

  const portfolioRef = useRef(portfolio);
  portfolioRef.current = portfolio;

  const sendMessageRef = useRef<(index: number, feedback?: "agree" | "disagree") => void>(() => {});
  sendMessageRef.current = (index: number, feedback?: "agree" | "disagree") => {
    const m = messages[index];
    const newsText = isChinese ? m.message_zh : m.message_en;

    const p = portfolioRef.current;
    const cashM = (p.cash / 1e6).toFixed(1);
    const goog = p.holdings.find((h) => h.symbol === "GOOG");
    const qtyStr = goog ? `${(goog.qty / 1000).toFixed(0)}K` : "0";
    const avgStr = goog ? `$${goog.avgPrice.toFixed(0)}` : "-";

    const portfolioLine = isChinese
      ? `当前持仓：现金 $${cashM}M，GOOG ${qtyStr}股（均价 ${avgStr}）`
      : `Current portfolio: Cash $${cashM}M, GOOG ${qtyStr} shares (avg ${avgStr})`;

    const feedbackLine =
      feedback === "agree" ? FEEDBACK_AGREE : feedback === "disagree" ? FEEDBACK_DISAGREE : "";

    chat.send(`${feedbackLine}${portfolioLine}\n\n${newsText}`, ANALYST_PROMPT);
    setPhase("processing");
  };

  // Phase transition on chat completion
  useEffect(() => {
    if (chat.chatState !== "done") {
      return;
    }
    if (phase === "processing") {
      const trade = parseTrade(chat.reply);
      console.log(`[Game] msg#${messageIndexRef.current} lobster done → parsed trade:`, trade);
      setPendingTrade(trade);
      setPhase("awaiting_action");
    }
  }, [chat.chatState, phase, chat.reply]);

  const sendAndShowTransition = useCallback((index: number, feedback?: "agree" | "disagree") => {
    sendMessageRef.current(index, feedback);
    const m = messages[index];
    setTransition({ date: m.date, time: m.time, duration: 1500 });
    setTimeout(() => {
      setTransition(null);
    }, 1500);
  }, []);

  const handleStart = () => {
    setShowIntro(false);
    sendAndShowTransition(0);
  };

  const advanceToNext = useCallback(
    (feedback: "agree" | "disagree") => {
      const currentIdx = messageIndexRef.current;
      setPendingTrade(null);

      if (currentIdx >= messages.length - 1) {
        // Last message — long transition then settlement
        console.log(
          `[Game] LAST MSG msg#${currentIdx} → settlement (messages.length=${messages.length})`,
        );
        setPhase("idle");
        chat.clear();
        const label = isChinese ? "一个月后..." : "ONE MONTH LATER...";
        setTransition({ date: settlement.date, time: "", label, duration: 3500, hold: true });
        setTimeout(() => {
          setShowSettlement(true);
          setTransition(null);

          // Send settlement summary to lobster for reflection
          const p = portfolioRef.current;
          const holdingsValue = p.holdings.reduce((sum, h) => sum + h.qty * settlement.price, 0);
          const totalValue = p.cash + holdingsValue;
          const pnl = totalValue - INITIAL_VALUE;
          const pnlPct = ((pnl / INITIAL_VALUE) * 100).toFixed(2);

          const tradesLog =
            p.trades.length > 0
              ? p.trades
                  .map(
                    (t) =>
                      `  ${t.side} ${t.qty.toLocaleString()} ${t.symbol} @ $${t.price} (${t.date})`,
                  )
                  .join("\n")
              : isChinese
                ? "  （无交易记录）"
                : "  (no trades)";

          const holdingsLog = p.holdings
            .map(
              (h) =>
                `  ${h.symbol}: ${(h.qty / 1000).toFixed(0)}K shares @ avg $${h.avgPrice.toFixed(2)}`,
            )
            .join("\n");

          const summaryMsg = isChinese
            ? `【结算通知】\n\n结算价：GOOG $${settlement.price}\n\n已执行交易：\n${tradesLog}\n\n最终持仓：\n  现金：$${(p.cash / 1e6).toFixed(2)}M\n${holdingsLog}\n\n总资产：$${(totalValue / 1e6).toFixed(2)}M\n初始资产：$${(INITIAL_VALUE / 1e6).toFixed(2)}M\n损益：${pnl >= 0 ? "+" : ""}$${(pnl / 1e6).toFixed(2)}M (${pnl >= 0 ? "+" : ""}${pnlPct}%)`
            : `[SETTLEMENT]\n\nSettlement price: GOOG $${settlement.price}\n\nExecuted trades:\n${tradesLog}\n\nFinal portfolio:\n  Cash: $${(p.cash / 1e6).toFixed(2)}M\n${holdingsLog}\n\nTotal value: $${(totalValue / 1e6).toFixed(2)}M\nInitial value: $${(INITIAL_VALUE / 1e6).toFixed(2)}M\nP&L: ${pnl >= 0 ? "+" : ""}$${(pnl / 1e6).toFixed(2)}M (${pnl >= 0 ? "+" : ""}${pnlPct}%)`;

          chat.send(summaryMsg, SETTLEMENT_PROMPT);
        }, 3500);
        return;
      }

      const nextIdx = currentIdx + 1;
      setMessageIndex(nextIdx);
      sendAndShowTransition(nextIdx, feedback);
    },
    [sendAndShowTransition, chat],
  );

  const executeTrade = useCallback((trade: Trade) => {
    const currentMsg = messages[messageIndexRef.current];
    const price = currentMsg.tradePrice;
    console.log(
      `[Trade] EXECUTE msg#${messageIndexRef.current} ${trade.side} ${trade.qty} ${trade.symbol} @ $${price} (tradePrice=${currentMsg.tradePrice}, price=${currentMsg.price})`,
    );

    setPortfolio((prev) => {
      const next: Portfolio = {
        cash: prev.cash,
        holdings: prev.holdings.map((h) => ({ ...h })),
        trades: [...prev.trades],
      };

      if (trade.side === "BUY") {
        const cost = trade.qty * price;
        if (cost > next.cash) {
          return prev;
        } // can't afford
        next.cash -= cost;
        const existing = next.holdings.find((h) => h.symbol === trade.symbol);
        if (existing) {
          const totalCost = existing.qty * existing.avgPrice + cost;
          existing.qty += trade.qty;
          existing.avgPrice = totalCost / existing.qty;
        } else {
          next.holdings.push({ symbol: trade.symbol, qty: trade.qty, avgPrice: price });
        }
      } else {
        const existing = next.holdings.find((h) => h.symbol === trade.symbol);
        if (!existing || existing.qty < trade.qty) {
          return prev;
        } // can't sell
        next.cash += trade.qty * price;
        existing.qty -= trade.qty;
        if (existing.qty === 0) {
          next.holdings = next.holdings.filter((h) => h.symbol !== trade.symbol);
        }
      }

      next.trades.push({
        side: trade.side,
        symbol: trade.symbol,
        qty: trade.qty,
        price,
        date: currentMsg.date,
      });

      const goog = next.holdings.find((h) => h.symbol === "GOOG");
      console.log(
        `[Trade] RESULT cash=$${(next.cash / 1e6).toFixed(2)}M GOOG=${goog ? `${(goog.qty / 1000).toFixed(2)}K@$${goog.avgPrice.toFixed(2)}` : "none"} trades=${next.trades.length}`,
      );
      return next;
    });
  }, []);

  // Green: agree — execute trade + next
  const handleGreen = useCallback(() => {
    if (phase !== "awaiting_action") {
      return;
    }
    console.log(`[Game] ACCEPT msg#${messageIndexRef.current} pendingTrade:`, pendingTrade);
    if (pendingTrade) {
      executeTrade(pendingTrade);
    }
    advanceToNext("agree");
  }, [phase, pendingTrade, executeTrade, advanceToNext]);

  // Red: disagree — skip trade + next
  const handleRed = useCallback(() => {
    if (phase !== "awaiting_action") {
      return;
    }
    console.log(`[Game] REJECT msg#${messageIndexRef.current}`);
    advanceToNext("disagree");
  }, [phase, advanceToNext]);

  const handlePlayAgain = useCallback(() => {
    chat.clear();
    setShowSettlement(false);
    setShowIntro(true);
    setIntroPage(0);
    setMessageIndex(0);
    setPortfolio(INITIAL_PORTFOLIO);
    setPendingTrade(null);
    setPhase("idle");
  }, [chat]);

  const buttonsDisabled = phase !== "awaiting_action" || showIntro;

  return (
    <div className="relative w-full h-full flex flex-col no-select">
      <img
        src="/background.jpeg"
        alt="Room Background"
        className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none"
        style={{ imageRendering: "pixelated" }}
      />
      <WallSection
        displayText={chat.reply}
        chatState={chat.chatState}
        isChinese={isChinese}
        overrideTime={msg.time}
        overrideDate={msg.date}
        scrollOpen={scrollOpen}
        onScrollToggle={setScrollOpen}
        portfolio={portfolio}
        currentPrice={msg.price}
        initialValue={INITIAL_VALUE}
      />
      {!scrollOpen && (
        <DeskSection onGreen={handleGreen} onRed={handleRed} disabled={buttonsDisabled} />
      )}

      {/* Time transition overlay — spinning clock */}
      {transition && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center"
          style={{
            backgroundColor: "rgba(0,0,0,0.85)",
            animation: `${transition.hold ? "transitionFadeIn" : "transitionFade"} ${transition.duration}ms ease-in-out`,
            paddingBottom: "20%",
          }}
        >
          {/* Clock face */}
          <div
            className="relative rounded-full"
            style={{
              width: "100px",
              height: "100px",
              border: "3px solid #b8cc33",
              boxShadow: "0 0 15px rgba(184,204,51,0.3)",
            }}
          >
            {/* Hour ticks */}
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  width: "2px",
                  height: i % 3 === 0 ? "10px" : "5px",
                  backgroundColor: "#b8cc33",
                  top: "0",
                  left: "50%",
                  marginLeft: "-1px",
                  transformOrigin: "center 50px",
                  transform: `rotate(${i * 30}deg)`,
                  opacity: i % 3 === 0 ? 1 : 0.4,
                }}
              />
            ))}
            {/* Hour hand */}
            <div
              className="absolute"
              style={{
                width: "3px",
                height: "28px",
                backgroundColor: "#b8cc33",
                bottom: "50%",
                left: "50%",
                marginLeft: "-1.5px",
                transformOrigin: "bottom center",
                borderRadius: "2px",
                animation: `hourSpin ${transition.duration}ms linear`,
              }}
            />
            {/* Minute hand */}
            <div
              className="absolute"
              style={{
                width: "2px",
                height: "38px",
                backgroundColor: "#b8cc33",
                bottom: "50%",
                left: "50%",
                marginLeft: "-1px",
                transformOrigin: "bottom center",
                borderRadius: "2px",
                animation: `minuteSpin ${transition.duration}ms linear`,
              }}
            />
            {/* Center dot */}
            <div
              className="absolute rounded-full"
              style={{
                width: "6px",
                height: "6px",
                backgroundColor: "#b8cc33",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
          {/* Label below clock */}
          {transition.label && (
            <div
              className={isChinese ? "mt-6" : "mt-6 font-press-start"}
              style={{
                color: "#b8cc33",
                fontSize: isChinese ? "18px" : "13px",
                fontFamily: isChinese ? "system-ui, -apple-system, sans-serif" : undefined,
                fontWeight: isChinese ? 600 : undefined,
                textShadow: "0 0 8px rgba(184,204,51,0.4)",
                letterSpacing: isChinese ? "0.1em" : "0.15em",
              }}
            >
              {transition.label}
            </div>
          )}
        </div>
      )}
      <style>{`
        @keyframes transitionFade {
          0% { opacity: 0; }
          15% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes transitionFadeIn {
          0% { opacity: 0; }
          15% { opacity: 1; }
          100% { opacity: 1; }
        }
        @keyframes minuteSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(2160deg); }
        }
        @keyframes hourSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Settlement overlay */}
      {showSettlement && (
        <SettlementOverlay
          portfolio={portfolio}
          settlementPrice={settlement.price}
          isChinese={isChinese}
          onPlayAgain={handlePlayAgain}
          initialValue={INITIAL_VALUE}
          reflection={chat.reply}
          reflectionLoading={chat.chatState === "sending" || chat.chatState === "streaming"}
        />
      )}

      {/* Intro modal — paginated */}
      {showIntro && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div
            className="relative mx-4 max-w-md w-full rounded-lg border-2 border-[#444] p-6 overflow-y-auto"
            style={{
              maxHeight: "80%",
              background: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
              boxShadow: "0 0 40px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <h2
              className={
                isChinese
                  ? "text-[20px] text-[#b8cc33] text-center mb-5 font-bold"
                  : "font-press-start text-[16px] text-[#b8cc33] text-center mb-5"
              }
              style={{ textShadow: "0 0 6px rgba(184,204,51,0.5)" }}
            >
              {introTitles[introPage]}
            </h2>
            <div className="space-y-3 mb-6">
              {introPages[introPage].map((line: string, i: number) => (
                <p
                  key={i}
                  className={
                    isChinese
                      ? "text-[16px] leading-relaxed text-gray-300"
                      : "font-press-start text-[10px] leading-relaxed text-gray-300"
                  }
                  style={{
                    ...(isChinese && {
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      fontWeight: 500,
                    }),
                    whiteSpace: "pre-line",
                  }}
                >
                  {line}
                </p>
              ))}
            </div>

            {/* Page indicator */}
            <div className="flex justify-center gap-2 mb-4">
              {introPages.map((_: any, i: number) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full transition-colors"
                  style={{
                    backgroundColor: i === introPage ? "#b8cc33" : "#444",
                  }}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              {introPage > 0 && (
                <button
                  onClick={() => setIntroPage((p) => p - 1)}
                  className="flex-1 py-3 rounded font-press-start text-[11px] tracking-wider
                    transition-colors duration-200 border border-[#555] text-[#999] hover:text-white hover:border-[#888] cursor-pointer"
                >
                  {isChinese ? "上一页" : "BACK"}
                </button>
              )}
              {introPage < introPages.length - 1 ? (
                <button
                  onClick={() => setIntroPage((p) => p + 1)}
                  className="flex-1 py-3 rounded font-press-start text-[11px] tracking-wider
                    transition-colors duration-200 bg-[#b8cc33] text-black hover:bg-[#d0e040] cursor-pointer"
                >
                  {isChinese ? "下一页" : "NEXT"}
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={gateway.status !== "connected"}
                  className={`
                    flex-1 py-3 rounded font-press-start text-[11px] tracking-wider
                    transition-colors duration-200
                    ${
                      gateway.status === "connected"
                        ? "bg-[#b8cc33] text-black hover:bg-[#d0e040] cursor-pointer"
                        : "bg-[#444] text-[#888] cursor-not-allowed"
                    }
                  `}
                >
                  {gateway.status === "connected"
                    ? isChinese
                      ? "开始游戏"
                      : "START"
                    : isChinese
                      ? "连接中..."
                      : "CONNECTING..."}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameInterface;

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "../hooks/useChat";
import { useGateway } from "../hooks/useGateway";
import intro from "../intro.json";
import messages from "../messages.json";
import initialPortfolio from "../portfolio.json";
import DeskSection from "./DeskSection";
import WallSection from "./WallSection";

const isChinese = /^zh\b/i.test(navigator.language);
const introLines = isChinese ? intro.zh : intro.en;

const SUMMARY_PROMPT = isChinese
  ? "这条消息来自剧情系统。请用1-2句话简短总结你收到了什么消息/信息，再用一句话给出你的初步判断。"
  : "This message is from the story system. Briefly summarize what message/info you received in 1-2 sentences, then add one sentence of your initial judgment.";

const ANALYSIS_PROMPT = isChinese
  ? `这是来自基金经理的指令。请对刚才收到的消息进行深入分析，给出投资相关的判断和建议。简洁有力。
你只能建议买入或卖出 GOOG 现货股票。分析结尾必须用以下格式给出操作建议（只选一个）：
【操作】BUY <数量> GOOG
【操作】SELL <数量> GOOG
【操作】HOLD
示例：【操作】BUY 50000 GOOG`
  : `This is an instruction from the fund manager. Analyze the message you just received in depth. Give investment-related judgment and recommendations. Be concise but insightful.
You may only recommend buying or selling GOOG spot shares. End your analysis with exactly one trade recommendation in this format:
[ACTION] BUY <qty> GOOG
[ACTION] SELL <qty> GOOG
[ACTION] HOLD
Example: [ACTION] BUY 50000 GOOG`;

type Phase = "idle" | "summarizing" | "awaiting_decision" | "analyzing" | "awaiting_trade";

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

const GameInterface: React.FC = () => {
  const gateway = useGateway();
  const chat = useChat(gateway);
  const [messageIndex, setMessageIndex] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scrollOpen, setScrollOpen] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio>(initialPortfolio as Portfolio);
  const [pendingTrade, setPendingTrade] = useState<Trade | null>(null);

  const msg = messages[messageIndex];

  // Refs to avoid stale closures
  const messageIndexRef = useRef(messageIndex);
  messageIndexRef.current = messageIndex;

  const portfolioRef = useRef(portfolio);
  portfolioRef.current = portfolio;

  const sendSummaryRef = useRef<(index: number) => void>(() => {});
  sendSummaryRef.current = (index: number) => {
    const m = messages[index];
    const text = isChinese ? m.message_zh : m.message_en;
    chat.send(text, SUMMARY_PROMPT);
    setPhase("summarizing");
  };

  // Phase transitions on chat completion
  useEffect(() => {
    if (chat.chatState !== "done") {
      return;
    }

    if (phase === "summarizing") {
      setPhase("awaiting_decision");
    } else if (phase === "analyzing") {
      const trade = parseTrade(chat.reply);
      setPendingTrade(trade);
      setPhase("awaiting_trade");
    }
  }, [chat.chatState, phase, chat.reply]);

  const handleStart = () => {
    setShowIntro(false);
    sendSummaryRef.current(0);
  };

  const advanceToNext = useCallback(() => {
    const nextIdx = (messageIndexRef.current + 1) % messages.length;
    setMessageIndex(nextIdx);
    setPendingTrade(null);
    sendSummaryRef.current(nextIdx);
  }, []);

  const executeTrade = useCallback((trade: Trade) => {
    const currentMsg = messages[messageIndexRef.current] as any;
    const price: number = currentMsg.googPrice ?? 253;

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

      return next;
    });
  }, []);

  // Green: awaiting_decision → analyze; awaiting_trade → accept trade + next
  const handleGreen = useCallback(() => {
    if (phase === "awaiting_decision") {
      setPhase("analyzing");
      const p = portfolioRef.current;
      const cashM = (p.cash / 1e6).toFixed(1);
      const goog = p.holdings.find((h) => h.symbol === "GOOG");
      const qtyStr = goog ? `${(goog.qty / 1000).toFixed(0)}K` : "0";
      const avgStr = goog ? `$${goog.avgPrice.toFixed(0)}` : "-";

      const analysisMsg = isChinese
        ? `请深入分析这条消息对投资决策的影响，给出你的判断和操作建议。\n当前持仓：现金 $${cashM}M，GOOG ${qtyStr}股（均价 ${avgStr}）`
        : `Analyze this message in depth. Current portfolio: Cash $${cashM}M, GOOG ${qtyStr} shares (avg ${avgStr})`;
      chat.send(analysisMsg, ANALYSIS_PROMPT);
    } else if (phase === "awaiting_trade") {
      if (pendingTrade) {
        executeTrade(pendingTrade);
      }
      advanceToNext();
    }
  }, [phase, chat, pendingTrade, executeTrade, advanceToNext]);

  // Red: awaiting_decision → skip to next; awaiting_trade → discard trade + next
  const handleRed = useCallback(() => {
    if (phase === "awaiting_decision" || phase === "awaiting_trade") {
      advanceToNext();
    }
  }, [phase, advanceToNext]);

  const buttonsDisabled =
    (phase !== "awaiting_decision" && phase !== "awaiting_trade") || showIntro;

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
      />
      {!scrollOpen && (
        <DeskSection onGreen={handleGreen} onRed={handleRed} disabled={buttonsDisabled} />
      )}

      {/* Intro modal */}
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
              className="font-press-start text-[14px] text-[#b8cc33] text-center mb-5"
              style={{ textShadow: "0 0 6px rgba(184,204,51,0.5)" }}
            >
              {isChinese ? "故事背景" : "BRIEFING"}
            </h2>
            <div className="space-y-3 mb-6">
              {introLines.map((line, i) => (
                <p
                  key={i}
                  className={
                    isChinese
                      ? "text-[13px] leading-relaxed text-gray-300"
                      : "font-press-start text-[8px] leading-relaxed text-gray-300"
                  }
                  style={{
                    ...(isChinese && { fontFamily: "'DotGothic16', monospace" }),
                    whiteSpace: "pre-line",
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
            <button
              onClick={handleStart}
              disabled={gateway.status !== "connected"}
              className={`
                w-full py-3 rounded font-press-start text-[11px] tracking-wider
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
          </div>
        </div>
      )}
    </div>
  );
};

export default GameInterface;

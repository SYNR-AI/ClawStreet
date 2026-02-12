import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "../hooks/useChat";
import { useGateway } from "../hooks/useGateway";
import intro from "../intro.json";
import messages from "../messages.json";
import DeskSection from "./DeskSection";
import WallSection from "./WallSection";

const isChinese = /^zh\b/i.test(navigator.language);
const introLines = isChinese ? intro.zh : intro.en;

const SUMMARY_PROMPT = isChinese
  ? "这条消息来自剧情系统。请用1-2句话简短总结你收到了什么消息/信息。不要分析，不要给出判断或建议。"
  : "This message is from the story system. Briefly summarize what message/info you received in 1-2 sentences. Do NOT analyze, judge, or give recommendations.";

const ANALYSIS_PROMPT = isChinese
  ? "这是来自基金经理的指令。请对刚才收到的消息进行深入分析，给出投资相关的判断和建议。简洁有力。"
  : "This is an instruction from the fund manager. Analyze the message you just received in depth. Give investment-related judgment and recommendations. Be concise but insightful.";

type Phase = "idle" | "summarizing" | "awaiting_decision" | "analyzing" | "analysis_done";

const GameInterface: React.FC = () => {
  const gateway = useGateway();
  const chat = useChat(gateway);
  const [messageIndex, setMessageIndex] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");

  const msg = messages[messageIndex];

  // Refs to avoid stale closures in timeouts
  const messageIndexRef = useRef(messageIndex);
  messageIndexRef.current = messageIndex;

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
      // Analysis done — wait for user to click a button
      setPhase("analysis_done");
    }
  }, [chat.chatState, phase]);

  const handleStart = () => {
    setShowIntro(false);
    sendSummaryRef.current(0);
  };

  const advanceToNext = useCallback(() => {
    const nextIdx = (messageIndexRef.current + 1) % messages.length;
    setMessageIndex(nextIdx);
    sendSummaryRef.current(nextIdx);
  }, []);

  // Green: awaiting_decision → analyze; analysis_done → next message
  const handleGreen = useCallback(() => {
    if (phase === "awaiting_decision") {
      setPhase("analyzing");
      const analysisMsg = isChinese
        ? "请深入分析这条消息对投资决策的影响，给出你的判断。"
        : "Please analyze this message in depth. What are the implications for our investment decisions?";
      chat.send(analysisMsg, ANALYSIS_PROMPT);
    } else if (phase === "analysis_done") {
      advanceToNext();
    }
  }, [phase, chat, advanceToNext]);

  // Red: awaiting_decision → skip to next; analysis_done → next message
  const handleRed = useCallback(() => {
    if (phase === "awaiting_decision" || phase === "analysis_done") {
      advanceToNext();
    }
  }, [phase, advanceToNext]);

  const buttonsDisabled = (phase !== "awaiting_decision" && phase !== "analysis_done") || showIntro;

  return (
    <div className="relative w-full h-full flex flex-col no-select">
      <img
        src="/background.png"
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
      />
      <DeskSection onGreen={handleGreen} onRed={handleRed} disabled={buttonsDisabled} />

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

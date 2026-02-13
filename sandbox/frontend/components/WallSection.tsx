import React from "react";
import type { ChatState } from "../hooks/useChat";
import Clock from "./Clock";

interface WallSectionProps {
  displayText: string;
  chatState: ChatState;
  isChinese?: boolean;
  overrideTime?: string;
  overrideDate?: string;
  scrollOpen: boolean;
  onScrollToggle: (open: boolean) => void;
  portfolio: {
    cash: number;
    holdings: { symbol: string; qty: number; avgPrice: number }[];
    trades: { side: string; symbol: string; qty: number; price: number; date: string }[];
  };
}

const WallSection: React.FC<WallSectionProps> = ({
  displayText,
  chatState,
  isChinese,
  overrideTime,
  overrideDate,
  scrollOpen,
  onScrollToggle,
  portfolio,
}) => {
  const showBeam = !!displayText;
  const isLoading = chatState === "sending";
  const isThinking = chatState === "sending" || chatState === "streaming";

  return (
    <div className="relative h-[65%] w-full z-10 flex items-center justify-center">
      {/* Lobster projected text on projector screen */}
      {(displayText || isLoading) && (
        <div
          className="absolute z-10 overflow-y-auto overscroll-contain px-[4%]"
          style={{
            top: "8%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "68%",
            maxHeight: "68%",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <span
            className={
              isChinese
                ? "text-[14px] sm:text-[18px] leading-relaxed select-none text-left"
                : "font-press-start text-[8px] sm:text-[11px] leading-relaxed tracking-wide select-none text-left"
            }
            style={{
              ...(isChinese && { fontFamily: "'DotGothic16', monospace" }),
              color: "#444",
              textShadow: "0 1px 2px rgba(0,0,0,0.15)",
              whiteSpace: "pre-line",
            }}
          >
            {isLoading ? "..." : displayText}
          </span>
        </div>
      )}

      {/* Light beam cone */}
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          opacity: showBeam || isLoading ? 1 : 0,
          transition: "opacity 0.5s ease-in-out",
          right: "8%",
          bottom: "-4%",
          width: "85%",
          height: "75%",
          clipPath: "polygon(85% 100%, 10% 0%, 65% 0%)",
          background:
            "linear-gradient(to top left, rgba(255,200,80,0.4) 0%, rgba(255,220,130,0.12) 40%, rgba(255,230,150,0.03) 80%)",
          filter: "blur(3px)",
        }}
      ></div>

      {/* Glow at lobster origin */}
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          opacity: showBeam || isLoading ? 0.8 : 0,
          transition: "opacity 0.5s ease-in-out",
          right: "14%",
          bottom: "-8%",
          width: "12%",
          height: "7%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,210,100,0.7), transparent 70%)",
          filter: "blur(5px)",
        }}
      ></div>

      {/* Clock */}
      <div className="absolute left-[7%] bottom-[-6%] w-[35%] h-[15%] flex items-center justify-center transform rotate-1 opacity-90">
        <Clock overrideTime={overrideTime} overrideDate={overrideDate} />
      </div>
      {/* Scroll on clock */}
      <img
        src="/scroll.png"
        alt="Scroll"
        className="absolute z-30 select-none cursor-pointer"
        style={{
          left: "2%",
          bottom: "11%",
          width: "45%",
          imageRendering: "pixelated",
        }}
        onClick={() => onScrollToggle(true)}
      />
      {/* Scroll modal */}
      {scrollOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => onScrollToggle(false)}
        >
          <div
            className="relative w-[100%] max-w-sm"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src="/open_scroll.png"
              alt="Open Scroll"
              className="w-full h-auto select-none"
              style={{ imageRendering: "pixelated" }}
            />
            {/* Portfolio content on scroll */}
            <div
              className="absolute overflow-y-auto overscroll-contain"
              style={{
                top: "15%",
                bottom: "15%",
                left: "18%",
                right: "18%",
              }}
            >
              <div
                style={{
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  fontWeight: 500,
                  color: "#5a4630",
                }}
              >
                <h3
                  className="text-center font-bold mb-2"
                  style={{ fontSize: isChinese ? "14px" : "10px" }}
                >
                  {isChinese ? "- 持仓总览 -" : "- PORTFOLIO -"}
                </h3>
                <div
                  className="mb-3"
                  style={{ fontSize: isChinese ? "12px" : "8px", lineHeight: "1.8" }}
                >
                  <div className="flex justify-between">
                    <span>{isChinese ? "现金" : "Cash"}</span>
                    <span>${(portfolio.cash / 1e6).toFixed(2)}M</span>
                  </div>
                  {portfolio.holdings.length > 0 ? (
                    portfolio.holdings.map((h: any, i: number) => (
                      <div key={i} className="flex justify-between">
                        <span>
                          {h.symbol} ×{h.qty}
                        </span>
                        <span>${((h.qty * h.avgPrice) / 1e6).toFixed(2)}M</span>
                      </div>
                    ))
                  ) : (
                    <div
                      className="text-center opacity-60"
                      style={{ fontSize: isChinese ? "11px" : "7px" }}
                    >
                      {isChinese ? "暂无持仓" : "No holdings"}
                    </div>
                  )}
                </div>

                <div
                  className="border-t pt-2"
                  style={{ borderColor: "#b8a080", fontSize: isChinese ? "12px" : "8px" }}
                >
                  <h3
                    className="text-center font-bold mb-2"
                    style={{ fontSize: isChinese ? "14px" : "10px" }}
                  >
                    {isChinese ? "- 交易记录 -" : "- TRADES -"}
                  </h3>
                  {portfolio.trades.length > 0 ? (
                    <div style={{ lineHeight: "1.8" }}>
                      {portfolio.trades.map((t: any, i: number) => (
                        <div key={i} className="mb-1">
                          <div className="flex justify-between">
                            <span style={{ fontWeight: "bold" }}>
                              {t.side} {t.symbol}
                            </span>
                            <span>{t.date}</span>
                          </div>
                          <div className="flex justify-between opacity-80">
                            <span>×{t.qty}</span>
                            <span>@${t.price}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="text-center opacity-60"
                      style={{ fontSize: isChinese ? "11px" : "7px" }}
                    >
                      {isChinese ? "暂无交易" : "No trades yet"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Lobster */}
      <div className="absolute right-[5%] bottom-[-15%] w-[30%] aspect-square z-30">
        <div className="absolute bottom-[8%] left-[8%] w-[80%] h-[25%] bg-black/30 rounded-[50%] blur-sm transform scale-y-50"></div>
        <img
          src="/lobster.png"
          alt="The Lobster"
          className="w-full h-full object-contain drop-shadow-md pixelated select-none pointer-events-none"
          style={{ imageRendering: "pixelated" }}
        />
        {/* Thinking bubble */}
        {isThinking && (
          <div className="absolute top-[-10%] left-[30%] pointer-events-none">
            {/* Small dots leading to bubble */}
            <div
              className="absolute top-[28px] left-[12px] w-[5px] h-[5px] rounded-full bg-white/70"
              style={{ animation: "thinkPulse 1.2s ease-in-out infinite" }}
            ></div>
            <div
              className="absolute top-[18px] left-[8px] w-[7px] h-[7px] rounded-full bg-white/80"
              style={{ animation: "thinkPulse 1.2s ease-in-out 0.2s infinite" }}
            ></div>
            {/* Main bubble */}
            <div
              className="relative bg-white/90 rounded-full px-2 py-1 flex items-center gap-[3px]"
              style={{
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                animation: "thinkPulse 1.2s ease-in-out 0.4s infinite",
              }}
            >
              <span
                className="w-[5px] h-[5px] rounded-full bg-[#666]"
                style={{ animation: "dotBounce 1.4s ease-in-out infinite" }}
              ></span>
              <span
                className="w-[5px] h-[5px] rounded-full bg-[#666]"
                style={{ animation: "dotBounce 1.4s ease-in-out 0.2s infinite" }}
              ></span>
              <span
                className="w-[5px] h-[5px] rounded-full bg-[#666]"
                style={{ animation: "dotBounce 1.4s ease-in-out 0.4s infinite" }}
              ></span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes thinkPulse {
          0%, 100% { opacity: 0.6; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
};

export default WallSection;

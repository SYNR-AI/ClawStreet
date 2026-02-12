import React from "react";
import type { ChatState } from "../hooks/useChat";
import Clock from "./Clock";

interface WallSectionProps {
  displayText: string;
  chatState: ChatState;
  isChinese?: boolean;
  overrideTime?: string;
  overrideDate?: string;
}

const WallSection: React.FC<WallSectionProps> = ({
  displayText,
  chatState,
  isChinese,
  overrideTime,
  overrideDate,
}) => {
  const showBeam = !!displayText;
  const isLoading = chatState === "sending";

  return (
    <div className="relative h-[65%] w-full z-10 flex items-center justify-center pt-8">
      {/* Frame / TV */}
      <div className="relative w-[75%] aspect-[16/9] flex items-center justify-center overflow-hidden"></div>

      {/* Lobster projected text */}
      {(displayText || isLoading) && (
        <div
          className="absolute z-10 overflow-y-auto overscroll-contain px-[15%]"
          style={{
            top: "27%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "85%",
            maxHeight: "36%",
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
          right: "10%",
          bottom: "-2%",
          width: "80%",
          height: "60%",
          clipPath: "polygon(88% 100%, 5% 0%, 60% 0%)",
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
          right: "15%",
          bottom: "-6%",
          width: "10%",
          height: "6%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,210,100,0.7), transparent 70%)",
          filter: "blur(5px)",
        }}
      ></div>

      {/* Clock */}
      <div className="absolute left-[7%] bottom-[-6%] w-[35%] h-[15%] flex items-center justify-center transform rotate-1 opacity-90">
        <Clock overrideTime={overrideTime} overrideDate={overrideDate} />
      </div>
      {/* Lobster */}
      <div className="absolute right-[5%] bottom-[-15%] w-[30%] aspect-square z-30">
        <div className="absolute bottom-[8%] left-[8%] w-[80%] h-[25%] bg-black/30 rounded-[50%] blur-sm transform scale-y-50"></div>
        <img
          src="/lobster.png"
          alt="The Lobster"
          className="w-full h-full object-contain drop-shadow-md pixelated select-none pointer-events-none"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
};

export default WallSection;

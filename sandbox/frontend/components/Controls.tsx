import React, { useState } from "react";

interface ControlsProps {
  onGreen?: () => void;
  onRed?: () => void;
  disabled?: boolean;
}

const Controls: React.FC<ControlsProps> = ({ onGreen, onRed, disabled }) => {
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);

  return (
    <div className="flex gap-[20%] items-end w-[80%] justify-center">
      {/* Red Button (Reject) — left */}
      <div className="flex flex-col items-center w-[35%]">
        {/* Button */}
        <div className="relative z-10 w-full" style={{ aspectRatio: "2.2 / 1" }}>
          <div className="absolute inset-x-0 bottom-0 h-[83%] bg-[#4d1f1f] rounded-lg shadow-[0_4px_8px_rgba(0,0,0,0.5)]"></div>
          <button
            className={`
              absolute top-0 left-0 w-full h-[83%] rounded-lg
              flex items-center justify-center
              border-4 border-[#331414]
              transition-transform duration-100 ease-in-out
              ${disabled ? "translate-y-0 bg-[#665555] cursor-not-allowed" : leftPressed ? "translate-y-[15%] bg-[#cc0000]" : "translate-y-0 bg-[#aa0000] hover:bg-[#bb0000]"}
            `}
            style={{
              boxShadow:
                leftPressed && !disabled
                  ? "inset 0px 4px 10px rgba(0,0,0,0.4)"
                  : "inset 0px -6px 0px rgba(0,0,0,0.2), 0px 8px 0px #440000",
            }}
            onMouseDown={() => !disabled && setLeftPressed(true)}
            onMouseUp={() => {
              setLeftPressed(false);
              if (!disabled) {
                onRed?.();
              }
            }}
            onMouseLeave={() => setLeftPressed(false)}
            onTouchStart={() => !disabled && setLeftPressed(true)}
            onTouchEnd={() => {
              setLeftPressed(false);
              if (!disabled) {
                onRed?.();
              }
            }}
          >
            <span
              className={`font-press-start text-white text-[10px] sm:text-[13px] drop-shadow-md select-none ${disabled ? "opacity-40" : ""}`}
            >
              REJECT
            </span>
          </button>
        </div>
        {/* Gray base — behind button */}
        <div className="relative w-[112%]" style={{ aspectRatio: "16 / 9", marginTop: "-47%" }}>
          {/* <div
            className="absolute inset-x-0 bottom-0 h-[83%] rounded-lg"
            style={{ backgroundColor: "#2a2a2a", boxShadow: "0 4px 8px rgba(0,0,0,0.5)" }}
          /> */}
          <div
            className="absolute top-0 left-0 w-full h-[83%] rounded-lg"
            style={{
              backgroundColor: "#555",
              boxShadow: "0px 8px 0px #444",
            }}
          />
        </div>
      </div>

      {/* Green Button (Accept) — right */}
      <div className="flex flex-col items-center w-[35%]">
        {/* Button */}
        <div className="relative z-10 w-full" style={{ aspectRatio: "2.2 / 1" }}>
          <div className="absolute inset-x-0 bottom-0 h-[83%] bg-[#2d4d2d] rounded-lg shadow-[0_4px_8px_rgba(0,0,0,0.5)]"></div>
          <button
            className={`
              absolute top-0 left-0 w-full h-[83%] rounded-lg
              flex items-center justify-center
              border-4 border-[#1e331e]
              transition-transform duration-100 ease-in-out
              ${disabled ? "translate-y-0 bg-[#556655] cursor-not-allowed" : rightPressed ? "translate-y-[15%] bg-[#00cc00]" : "translate-y-0 bg-[#00aa00] hover:bg-[#00bb00]"}
            `}
            style={{
              boxShadow:
                rightPressed && !disabled
                  ? "inset 0px 4px 10px rgba(0,0,0,0.4)"
                  : "inset 0px -6px 0px rgba(0,0,0,0.2), 0px 8px 0px #004400",
            }}
            onMouseDown={() => !disabled && setRightPressed(true)}
            onMouseUp={() => {
              setRightPressed(false);
              if (!disabled) {
                onGreen?.();
              }
            }}
            onMouseLeave={() => setRightPressed(false)}
            onTouchStart={() => !disabled && setRightPressed(true)}
            onTouchEnd={() => {
              setRightPressed(false);
              if (!disabled) {
                onGreen?.();
              }
            }}
          >
            <span
              className={`font-press-start text-white text-[10px] sm:text-[13px] drop-shadow-md select-none ${disabled ? "opacity-40" : ""}`}
            >
              ACCEPT
            </span>
          </button>
        </div>
        {/* Gray base — behind button */}
        <div className="relative w-[112%]" style={{ aspectRatio: "16 / 9", marginTop: "-47%" }}>
          <div
            className="absolute top-0 left-0 w-full h-[83%] rounded-lg"
            style={{
              backgroundColor: "#555",
              boxShadow: "0px 8px 0px #444",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Controls;

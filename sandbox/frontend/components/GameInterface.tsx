import React, { useState } from "react";
import { useChat } from "../hooks/useChat";
import { useGateway } from "../hooks/useGateway";
import messages from "../messages.json";
import DeskSection from "./DeskSection";
import WallSection from "./WallSection";

const isChinese = /^zh\b/i.test(navigator.language);

const GameInterface: React.FC = () => {
  const gateway = useGateway();
  const chat = useChat(gateway);
  const [messageIndex, setMessageIndex] = useState(0);

  const msg = messages[messageIndex];
  const isBusy = chat.chatState === "sending" || chat.chatState === "streaming";

  const handleNext = () => {
    if (isBusy) {
      return;
    }
    // Send current message to agent, then advance index for next click
    const text = isChinese ? msg.message_zh : msg.message_en;
    chat.send(text);
    setMessageIndex((prev) => (prev + 1) % messages.length);
  };

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
      <DeskSection onNext={handleNext} disabled={isBusy} />
    </div>
  );
};

export default GameInterface;

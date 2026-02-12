import React from "react";
import Controls from "./Controls";

interface DeskSectionProps {
  onGreen: () => void;
  onRed: () => void;
  disabled?: boolean;
}

const DeskSection: React.FC<DeskSectionProps> = ({ onGreen, onRed, disabled }) => {
  return (
    <div className="relative h-[35%] w-full z-20 overflow-hidden">
      <div className="absolute bottom-[32%] w-full flex justify-center">
        <Controls onGreen={onGreen} onRed={onRed} disabled={disabled} />
      </div>
    </div>
  );
};

export default DeskSection;

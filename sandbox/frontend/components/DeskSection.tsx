import React from "react";
import Controls from "./Controls";

interface DeskSectionProps {
  onNext: () => void;
  disabled?: boolean;
}

const DeskSection: React.FC<DeskSectionProps> = ({ onNext, disabled }) => {
  return (
    <div className="relative h-[35%] w-full z-20 overflow-hidden">
      <div className="absolute bottom-[32%] w-full flex justify-center">
        <Controls onPress={onNext} disabled={disabled} />
      </div>
    </div>
  );
};

export default DeskSection;

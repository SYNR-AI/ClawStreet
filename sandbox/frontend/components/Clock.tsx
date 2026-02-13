import React, { useState, useEffect } from "react";

interface ClockProps {
  overrideTime?: string;
  overrideDate?: string;
}

const Clock: React.FC<ClockProps> = ({ overrideTime, overrideDate }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatTime = (date: Date) => {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const displayDate = overrideDate ?? formatDate(time);
  const displayTime = overrideTime ?? formatTime(time);

  return (
    // Container is now transparent to overlay on the background image's radio screen
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div
        className="font-vt323 text-[#b8cc33] text-center leading-none"
        style={{ textShadow: "0 0 2px rgba(184, 204, 51, 0.6)" }}
      >
        <div className="text-[12px] tracking-widest opacity-80 mb-0.5 pb-2">{displayDate}</div>
        <div className="text-[16px] tracking-widest font-bold">{displayTime}</div>
      </div>
    </div>
  );
};

export default Clock;

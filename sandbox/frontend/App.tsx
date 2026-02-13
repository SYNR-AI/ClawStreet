import React, { useState, useEffect, useRef } from "react";
import GameInterface from "./components/GameInterface";

const App: React.FC = () => {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [spaces, setSpaces] = useState<any[]>([]);
  const isFetching = useRef<boolean>(false);
  useEffect(() => {
    if (isFetching.current || spaces.length > 0) {
      return;
    }
    isFetching.current = true;
    const fetchSpaces = async () => {
      const requestURL = new URL("http://192.168.8.82/api/spaces");
      if (!window.location.hostname.startsWith("192.168.")) {
        requestURL.hostname = "100.88.88.88";
      }
      const response = await fetch(requestURL.toString());
      const data = await response.json();
      const spaces = (data?.spaces ?? [])
        .map((space) => {
          const u = new URL(space.url);
          if (window.location.hostname.startsWith("192.168.")) {
            u.hostname = "192.168.8.82";
          } else {
            u.hostname = "100.88.88.88";
          }
          return {
            ...space,
            url: u.toString(),
          };
        })
        .filter((space) => space.status === "running");
      setSpaces(spaces);
      console.log("spaces", spaces);
      isFetching.current = false;
    };

    fetchSpaces();
  }, []);

  return (
    <div className="w-full h-screen flex items-center justify-center bg-[#1a1a1a] overflow-hidden">
      {/*
        Container ensures mobile-first portrait aspect ratio on desktop.
        On mobile, it takes full width/height.
        On desktop, it mimics a phone screen.
      */}
      <div className="relative w-full h-full sm:max-w-[400px] sm:max-h-[850px] sm:aspect-[9/19.5] sm:border-8 sm:border-neutral-800 sm:rounded-3xl overflow-hidden shadow-2xl bg-black">
        {url ? (
          <GameInterface url={url} />
        ) : (
          <>
            <div className="flex flex-col items-center justify-center mb-4">
              <h1 className="text-white text-2xl font-bold">选择你的虾哥</h1>
              <div className="text-white text-sm">开启你的投资之旅</div>
            </div>
            <div className="flex flex-col gap-2 p-2 items-center overflow-y-scroll max-h-full pb-20">
              {spaces.map((space) => {
                return (
                  <div
                    key={space.id}
                    onClick={() => setUrl(space.url)}
                    className="border border-white rounded-md p-2 w-full"
                  >
                    <h2 className="text-white text-lg font-bold">{space.name}</h2>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;

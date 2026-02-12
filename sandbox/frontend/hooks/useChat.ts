import { useState, useCallback, useRef, useEffect } from "react";
import type { Gateway } from "./useGateway";
import { SESSION_KEY } from "../config";

export type ChatState = "idle" | "sending" | "streaming" | "done" | "error";

export interface Chat {
  reply: string;
  chatState: ChatState;
  error: string | null;
  send: (message: string) => void;
}

function extractText(message: any): string {
  if (!message?.content) {
    return "";
  }
  return message.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
}

export function useChat(gateway: Gateway): Chat {
  const [reply, setReply] = useState("");
  const [chatState, setChatState] = useState<ChatState>("idle");
  const [error, setError] = useState<string | null>(null);
  const activeRunId = useRef<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Listen for chat events
  useEffect(() => {
    const unsub = gateway.onEvent("chat", (payload: any) => {
      if (!payload || payload.runId !== activeRunId.current) {
        return;
      }

      switch (payload.state) {
        case "delta":
          setChatState("streaming");
          setReply(extractText(payload.message));
          break;
        case "final":
          setReply(extractText(payload.message));
          setChatState("done");
          activeRunId.current = null;
          break;
        case "error":
          setError(payload.errorMessage ?? "Agent error");
          setChatState("error");
          activeRunId.current = null;
          break;
        case "aborted":
          setError(`Aborted: ${payload.stopReason ?? "unknown"}`);
          setChatState("error");
          activeRunId.current = null;
          break;
      }
    });
    unsubRef.current = unsub;
    return unsub;
  }, [gateway]);

  const send = useCallback(
    async (message: string) => {
      if (chatState === "sending" || chatState === "streaming") {
        return;
      }

      setReply("");
      setError(null);
      setChatState("sending");

      const idempotencyKey = crypto.randomUUID();

      const wrapped = `<system>This message is from the story system. Reply to the user by first briefly summarizing what message/info you received, then give one or two sentences of your judgment. Be concise.</system>\n\n${message}`;

      try {
        const res = await gateway.rpc("chat.send", {
          sessionKey: SESSION_KEY,
          message: wrapped,
          idempotencyKey,
        });
        activeRunId.current = res?.runId ?? idempotencyKey;
        setChatState("streaming");
      } catch (err: any) {
        setError(err.message ?? "Failed to send");
        setChatState("error");
      }
    },
    [gateway, chatState],
  );

  return { reply, chatState, error, send };
}

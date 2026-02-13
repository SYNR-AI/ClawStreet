import { useEffect, useRef, useState, useCallback } from "react";
import { GATEWAY_WS_URL, GATEWAY_TOKEN } from "../config";

export type GatewayStatus = "connecting" | "connected" | "disconnected" | "error";

type EventHandler = (payload: any) => void;

export interface Gateway {
  status: GatewayStatus;
  rpc: (method: string, params?: unknown) => Promise<any>;
  onEvent: (event: string, handler: EventHandler) => () => void;
}

let idCounter = 0;
function nextId() {
  return `rpc-${++idCounter}-${Date.now()}`;
}

export function useGateway(): Gateway {
  const [status, setStatus] = useState<GatewayStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRpc = useRef<Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>>(
    new Map(),
  );
  const eventListeners = useRef<Map<string, Set<EventHandler>>>(new Map());
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const unmounted = useRef(false);

  const rpc = useCallback((method: string, params?: unknown): Promise<any> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      const id = nextId();
      pendingRpc.current.set(id, { resolve, reject });
      ws.send(JSON.stringify({ type: "req", id, method, params }));

      setTimeout(() => {
        const entry = pendingRpc.current.get(id);
        if (entry) {
          pendingRpc.current.delete(id);
          entry.reject(new Error(`rpc timeout: ${method}`));
        }
      }, 30_000);
    });
  }, []);

  const onEvent = useCallback((event: string, handler: EventHandler): (() => void) => {
    if (!eventListeners.current.has(event)) {
      eventListeners.current.set(event, new Set());
    }
    eventListeners.current.get(event)!.add(handler);
    return () => {
      eventListeners.current.get(event)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    unmounted.current = false;
    let ws: WebSocket | null = null;

    const init = () => {
      if (unmounted.current) {
        return;
      }
      setStatus("connecting");

      ws = new WebSocket(GATEWAY_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[gateway] ws open");
      };

      ws.onmessage = async (ev) => {
        if (ws !== wsRef.current) {
          return;
        }
        let msg: any;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : await ev.data.text());
        } catch {
          return;
        }

        // Handle RPC responses
        if (msg.type === "res") {
          const entry = pendingRpc.current.get(msg.id);
          if (entry) {
            pendingRpc.current.delete(msg.id);
            if (msg.ok) {
              entry.resolve(msg.payload);
            } else {
              entry.reject(new Error(msg.error?.message ?? "rpc error"));
            }
          }
          return;
        }

        // Handle events
        if (msg.type === "event") {
          // Auto-handshake on connect.challenge
          if (msg.event === "connect.challenge") {
            try {
              await rpc("connect", {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: "gateway-client",
                  displayName: "Sandbox Frontend",
                  version: "0.1.0",
                  platform: "browser",
                  mode: "backend",
                },
                auth: { token: GATEWAY_TOKEN },
                role: "operator",
                scopes: ["operator.admin"],
              });
              retryCount.current = 0;
              if (!unmounted.current && ws === wsRef.current) {
                setStatus("connected");
              }
              console.log("[gateway] connected");
            } catch (err: any) {
              console.error("[gateway] handshake failed:", err.message);
              if (!unmounted.current && ws === wsRef.current) {
                setStatus("error");
              }
            }
            return;
          }

          // Dispatch to listeners
          const listeners = eventListeners.current.get(msg.event);
          if (listeners) {
            for (const handler of listeners) {
              try {
                handler(msg.payload);
              } catch (e) {
                console.error("[gateway] event handler error:", e);
              }
            }
          }
        }
      };

      ws.onclose = (ev) => {
        if (ws !== wsRef.current) {
          return;
        }
        console.log("[gateway] ws closed, code:", ev.code, "reason:", ev.reason);
        if (unmounted.current) {
          return;
        }

        setStatus("disconnected");
        // Reject all pending RPCs
        for (const [id, entry] of pendingRpc.current) {
          entry.reject(new Error("WebSocket closed"));
        }
        pendingRpc.current.clear();

        // Auto-reconnect with exponential backoff
        const delay = Math.min(1000 * 2 ** retryCount.current, 10_000);
        retryCount.current++;
        retryTimer.current = setTimeout(init, delay);
      };

      ws.onerror = (err) => {
        if (ws !== wsRef.current) {
          return;
        }
        console.error("[gateway] ws error", err);
      };
    };

    const timer = setTimeout(() => {
      if (unmounted.current) {
        return;
      }
      init();
    }, 50);

    return () => {
      unmounted.current = true;
      clearTimeout(timer);
      clearTimeout(retryTimer.current);
      if (ws) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [rpc]);

  return { status, rpc, onEvent };
}

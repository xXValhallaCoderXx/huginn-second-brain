import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

function ChatPage() {
  const { account } = Route.useRouteContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState(
    () => `web-${account.id}-${Date.now()}`
  );
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
    }
  }, [input]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    setError(null);
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("http://localhost:4111/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          message: text,
          threadId,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Agent error: ${body}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw);
            if (parsed.type === "text") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + parsed.content,
                  };
                }
                return updated;
              });
            } else if (parsed.type === "error") {
              setError(parsed.error);
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, account.id, threadId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setThreadId(`web-${account.id}-${Date.now()}`);
    setError(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 800, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center", gap: 12, background: "#fafafa" }}>
        <Link to="/dashboard" style={{ textDecoration: "none", fontSize: 14 }}>← Dashboard</Link>
        <h2 style={{ margin: 0, flex: 1 }}>💬 Chat with Huginn</h2>
        <button onClick={startNewChat} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ccc", background: "white", cursor: "pointer", fontSize: 13 }}>New Chat</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#999", marginTop: 60, fontSize: 15 }}>
            Send a message to start chatting.<br />
            <span style={{ fontSize: 13 }}>Edit your SOUL &amp; IDENTITY on the dashboard to change the personality.</span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 12, background: msg.role === "user" ? "#007bff" : "#f0f0f0", color: msg.role === "user" ? "white" : "#333", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.5 }}>
              {msg.content}
              {msg.role === "assistant" && msg.content === "" && isStreaming && <span style={{ opacity: 0.5 }}>●●●</span>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div style={{ padding: "8px 20px", background: "#fff0f0", color: "#c00", fontSize: 13, borderTop: "1px solid #fcc" }}>{error}</div>
      )}

      <div style={{ padding: "12px 20px", borderTop: "1px solid #e0e0e0", display: "flex", gap: 10, background: "#fafafa" }}>
        <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message… (Shift+Enter for newline)" disabled={isStreaming} rows={1} style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, resize: "none", fontFamily: "inherit", lineHeight: 1.4 }} />
        <button onClick={sendMessage} disabled={isStreaming || !input.trim()} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: isStreaming || !input.trim() ? "#ccc" : "#007bff", color: "white", cursor: isStreaming || !input.trim() ? "default" : "pointer", fontSize: 14, fontWeight: 600 }}>
          {isStreaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

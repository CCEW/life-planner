"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chatWithAI } from "../../lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiChatResponse {
  reply: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your UC Davis AI academic advisor. Ask me anything about your degree progress, which courses to take next, or how to plan your remaining quarters.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => { if (!r.ok) router.push("/signin"); })
      .catch(() => router.push("/signin"));
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.slice(1);
      const { data } = await chatWithAI(userMsg.content, history);
      const response = data as AiChatResponse;
      setMessages((prev) => [...prev, { role: "assistant", content: response.reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err.response?.data?.message ?? "Sorry, something went wrong. Try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Which courses should I take next quarter?",
    "What requirements do I still need to fulfill?",
    "How many quarters until I can graduate?",
    "What are good upper-division ECS electives?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">AI Academic Advisor</h1>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-blue-700 text-white rounded-br-sm"
                  : "bg-white border border-gray-100 shadow-sm rounded-bl-sm text-gray-800"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="text-gray-400 text-sm">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="text-xs border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-50 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your advisor..."
          disabled={loading}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-700 text-white px-5 py-3 rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}

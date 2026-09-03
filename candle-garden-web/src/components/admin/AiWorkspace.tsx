"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, Megaphone, RotateCcw, Send, Sparkles } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };
type AiUsage = { monthKey: string; limitUsd: number; spentUsd: number; remainingUsd: number; percentUsed: number };
const usd = (value: number) => value > 0 && value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;

export function AiWorkspace() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/ai-usage", { credentials: "include" }).then((response) => response.json()).then((data) => {
      if (active && data.usage) setUsage(data.usage);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: input.trim() }];
    setMessages(next); setInput(""); setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/chat", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const data = await res.json().catch(() => ({}));
      if (data.usage) setUsage(data.usage);
      if (!res.ok) setError(data.error || "The assistant could not reply.");
      else setMessages([...next, { role: "assistant", content: String(data.reply || "") }]);
    } finally { setBusy(false); }
  }

  function startWith(value: string) { setInput(value); requestAnimationFrame(() => inputRef.current?.focus()); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }
  async function copy(value: string, index: number) { await navigator.clipboard.writeText(value); setCopied(index); window.setTimeout(() => setCopied(null), 1600); }

  return (
    <div className="ai-desk">
      <header className="ai-desk-head"><div><p className="eyebrow"><Sparkles size={13} /> Writing assistant</p><h1>Content AI</h1><p className="admin-lede">Draft product stories, class descriptions, announcements, and social copy in The Candle Garden’s voice.</p></div>{messages.length ? <button className="ai-new-chat" type="button" onClick={() => setMessages([])}><RotateCcw size={15} /> New conversation</button> : null}</header>
      {usage ? <section className="ai-budget" aria-label="Monthly AI budget"><div><strong>{usd(usage.spentUsd)} of {usd(usage.limitUsd)} used this month</strong><span>{usd(usage.remainingUsd)} remaining</span></div><progress max={100} value={Math.min(100, usage.percentUsed)} /></section> : null}
      <div className="ai-workspace">
        <main className="ai-conversation" aria-live="polite">
          {!messages.length ? <section className="ai-welcome"><span className="ai-spark"><Sparkles size={22} /></span><p className="eyebrow">Ready when you are</p><h2>What would you like to write?</h2><p>Start with rough notes or choose a shortcut. Refine the result until it feels like your brand.</p><div className="ai-starters">
            <button type="button" onClick={() => startWith("Turn these notes into a warm product story: ")}><FileText size={18} /><span><strong>Draft a product story</strong><small>Turn candle notes into polished copy</small></span></button>
            <button type="button" onClick={() => startWith("Write a concise class or shop announcement using these details: ")}><Megaphone size={18} /><span><strong>Promote an event</strong><small>Create a clear announcement</small></span></button>
            <button type="button" onClick={() => startWith("Polish this copy while keeping our warm, handcrafted voice: ")}><Sparkles size={18} /><span><strong>Polish my copy</strong><small>Make writing clearer and tighter</small></span></button>
          </div></section> : <div className="ai-messages">{messages.map((item, index) => <article className={`ai-message is-${item.role}`} key={`${item.role}-${index}`}><div className="ai-avatar">{item.role === "assistant" ? <Sparkles size={16} /> : "You"}</div><div><div className="ai-message-meta"><strong>{item.role === "assistant" ? "Writing assistant" : "You"}</strong>{item.role === "assistant" ? <button type="button" onClick={() => void copy(item.content, index)}>{copied === index ? <Check size={14} /> : <Copy size={14} />}{copied === index ? "Copied" : "Copy"}</button> : null}</div><p className="admin-chat-body">{item.content}</p></div></article>)}{busy ? <div className="ai-message is-assistant"><div className="ai-avatar"><Sparkles size={16} /></div><div className="ai-thinking"><i /><i /><i /><span>Drafting a response</span></div></div> : null}</div>}
        </main>
        <form className="admin-chat-form" onSubmit={(event) => void send(event)}>{error ? <p className="admin-error" role="alert">{error}</p> : null}<label htmlFor="ai-message">Message</label><div className="ai-composer"><textarea id="ai-message" ref={inputRef} rows={4} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} placeholder="Share product notes, a class idea, an announcement, or copy to rewrite…" disabled={busy} /><div className="ai-composer-foot"><span>Enter to send · Shift + Enter for a new line</span><button className="ai-send" type="submit" disabled={busy || !input.trim()}>{busy ? "Writing…" : "Send"} <Send size={15} /></button></div></div></form>
      </div>
    </div>
  );
}

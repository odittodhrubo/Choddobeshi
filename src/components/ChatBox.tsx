"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "@/shared/types";
import type { Send } from "@/components/types";

export default function ChatBox({
  chat,
  send,
  ghost,
}: {
  chat: ChatMsg[];
  send: Send;
  ghost: boolean;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat]);

  function submit() {
    const t = text.trim();
    if (!t) return;
    send("chat:send", { text: t });
    setText("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="h-32 overflow-y-auto rounded-xl border border-line bg-panel2/40 p-2 text-sm">
        {chat.length === 0 ? (
          <p className="py-4 text-center text-muted">
            {ghost ? "Ghost chat — only other eliminated players see this." : "No messages yet."}
          </p>
        ) : (
          chat.map((m, i) => (
            <p key={i} className={m.ghost ? "text-muted italic" : ""}>
              <span className="font-semibold">{m.from}{m.ghost ? " 👻" : ""}:</span> {m.text}
            </p>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          value={text}
          maxLength={200}
          placeholder={ghost ? "Ghost chat…" : "Message…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn-ghost shrink-0" onClick={submit}>
          Send
        </button>
      </div>
    </div>
  );
}

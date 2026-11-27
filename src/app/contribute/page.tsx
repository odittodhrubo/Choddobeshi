"use client";

import Link from "next/link";
import { useState } from "react";
import { supabaseEnabled } from "@/lib/supabase/client";
import { ensureSession, accessToken } from "@/lib/supabase/auth";
import { WORD_PACKS } from "@/shared/types";

type Kind = "word" | "question";

export default function ContributePage() {
  const [kind, setKind] = useState<Kind>("word");
  const [pack, setPack] = useState("en-general");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const packs = WORD_PACKS.filter((p) => p.id !== "ai" && p.id !== "custom");

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await ensureSession();
      const token = await accessToken();
      const payload =
        kind === "word"
          ? { kind, pack, civilian: a, doppelganger: b }
          : { kind, civilian: a, imposter: b };
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMsg({ ok: true, text: "Thanks! Your suggestion is waiting for review." });
        setA("");
        setB("");
      } else {
        setMsg({ ok: false, text: data.error ?? "Something went wrong." });
      }
    } finally {
      setBusy(false);
    }
  }

  const tab = (on: boolean) =>
    `min-h-0 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition ${
      on ? "border-brand bg-brand/20 text-white" : "border-line bg-panel2 text-muted hover:text-ink"
    }`;

  return (
    <main className="flex flex-1 flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Suggest content</h1>
        <Link href="/" className="text-sm text-brand hover:underline">
          ← Back
        </Link>
      </header>

      {!supabaseEnabled ? (
        <p className="text-sm text-muted">Suggestions are not available right now.</p>
      ) : (
        <section className="card flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-1.5">
            <button className={tab(kind === "word")} onClick={() => setKind("word")}>
              Word pair
            </button>
            <button className={tab(kind === "question")} onClick={() => setKind("question")}>
              Question pair
            </button>
          </div>

          {kind === "word" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Pack</span>
              <select className="input" value={pack} onChange={(e) => setPack(e.target.value)}>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="text-xs text-muted">
            {kind === "word"
              ? "Two related but different words, like Coffee and Tea. Civilians get one, the Doppelganger gets the other."
              : "Two similar questions whose answers overlap, like “Name something cold” and “Name something hot”."}
          </p>

          <input
            className="input"
            value={a}
            maxLength={kind === "word" ? 30 : 90}
            placeholder={kind === "word" ? "Civilians' word" : "Everyone's question"}
            onChange={(e) => setA(e.target.value)}
          />
          <input
            className="input"
            value={b}
            maxLength={kind === "word" ? 30 : 90}
            placeholder={kind === "word" ? "Doppelganger's word" : "Imposter's question"}
            onChange={(e) => setB(e.target.value)}
          />

          <button className="btn-primary" disabled={busy || !a.trim() || !b.trim()} onClick={() => void submit()}>
            {busy ? "Sending…" : "Send suggestion"}
          </button>
          {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
          <p className="text-xs text-muted">Up to 10 per day. Every suggestion is reviewed before it is used.</p>
        </section>
      )}
    </main>
  );
}

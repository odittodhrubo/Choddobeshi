import Link from "next/link";

export const metadata = { title: "How to play — Choddobeshi" };

export default function HowToPlay() {
  return (
    <main className="flex flex-1 flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">How to play</h1>
        <Link href="/" className="text-sm text-brand hover:underline">
          ← Back
        </Link>
      </header>

      <section className="card space-y-2">
        <h2 className="font-semibold">Your secret</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Most players get the <b className="text-ink">same word</b> — the <b className="text-ink">Civilians</b>.</li>
          <li>One gets a <b className="text-ink">similar</b> word — the <b className="text-brand">Doppelganger</b>, who does not know it!</li>
          <li>One gets <b className="text-ink">no word</b> — the <b className="text-warn">Chameleon</b>, who knows.</li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Each round</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li><b className="text-ink">Clues:</b> everyone says one word about their secret word. Not the word itself, no repeats.</li>
          <li><b className="text-ink">Discuss:</b> whose clue felt off?</li>
          <li><b className="text-ink">Vote:</b> pick a suspect or Skip. A tie or Skip majority ejects no one.</li>
        </ol>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Getting caught</h2>
        <p className="text-sm text-muted">
          A voted-out Doppelganger or Chameleon gets one guess at the Civilians&apos; word.
          Correct and they win the game; wrong and they are out.
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Who wins</h2>
        <ul className="space-y-1 text-sm text-muted">
          <li>🟢 <b className="text-ink">Civilians:</b> catch every impostor.</li>
          <li>🎯 <b className="text-ink">A caught impostor:</b> guess the word.</li>
          <li>🔴 <b className="text-ink">Impostors:</b> survive to equal the Civilians, or last all rounds.</li>
        </ul>
      </section>

      <Link href="/" className="btn-primary text-center">
        Start playing
      </Link>
    </main>
  );
}

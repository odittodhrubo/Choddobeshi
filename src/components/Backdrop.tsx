/** Drifting background motifs — speech bubbles, eyes, masks, question marks.
 *  Purely decorative, pointer-events none, paused under reduced motion. */
const MOTIFS = [
  { icon: "speech", x: "8%", y: "14%", size: 54, hue: "#7c6cff", rot: -8, dur: 13, delay: 0 },
  { icon: "eye", x: "82%", y: "10%", size: 46, hue: "#ff6eb4", rot: 6, dur: 16, delay: 1.5 },
  { icon: "mask", x: "72%", y: "34%", size: 60, hue: "#39d98a", rot: 10, dur: 15, delay: 0.8 },
  { icon: "question", x: "14%", y: "46%", size: 40, hue: "#ffcf5c", rot: -12, dur: 12, delay: 2.2 },
  { icon: "speech", x: "88%", y: "62%", size: 50, hue: "#5a4cff", rot: 8, dur: 17, delay: 0.4 },
  { icon: "eye", x: "20%", y: "74%", size: 44, hue: "#39d98a", rot: -6, dur: 14, delay: 1.1 },
  { icon: "mask", x: "6%", y: "88%", size: 52, hue: "#ff6eb4", rot: 12, dur: 18, delay: 2.6 },
  { icon: "question", x: "60%", y: "86%", size: 38, hue: "#7c6cff", rot: 4, dur: 13, delay: 1.8 },
];

function Glyph({ icon, hue, size }: { icon: string; hue: string; size: number }) {
  const common = { width: size, height: size, fill: "none", stroke: hue, strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "speech":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4 5h16v11H9l-4 4v-4H4z" />
        </svg>
      );
    case "eye":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
          <circle cx="12" cy="12" r="2.6" fill={hue} stroke="none" />
        </svg>
      );
    case "mask":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4 5c5-2 11-2 16 0 0 7-2 13-8 15C6 18 4 12 4 5z" />
          <path d="M9 10h.01M15 10h.01" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M9 9a3 3 0 1 1 4 2.8c-1 .6-1 1.2-1 2.2" />
          <path d="M12 18h.01" />
        </svg>
      );
  }
}

export default function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* faint dotted mesh */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      {MOTIFS.map((m, i) => (
        <div
          key={i}
          data-motif
          className="absolute blur-[1px] opacity-[0.16]"
          style={{
            left: m.x,
            top: m.y,
            ["--rot" as string]: `${m.rot}deg`,
            animation: `drift ${m.dur}s ease-in-out ${m.delay}s infinite`,
          }}
        >
          <Glyph icon={m.icon} hue={m.hue} size={m.size} />
        </div>
      ))}
    </div>
  );
}

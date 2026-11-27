import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f1a",
        panel: "#141a2b",
        panel2: "#1d2540",
        line: "#2a3356",
        ink: "#e8ecf7",
        muted: "#8b95b5",
        brand: "#7c6cff",
        brand2: "#5a4cff",
        good: "#39d98a",
        bad: "#ff5d6c",
        warn: "#ffcf5c",
      },
      fontFamily: {
        sans: ["var(--font-nunito)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-fredoka)", "var(--font-nunito)", "ui-sans-serif", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;

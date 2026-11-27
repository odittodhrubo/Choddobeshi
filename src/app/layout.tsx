import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import Backdrop from "@/components/Backdrop";
import MuteToggle from "@/components/MuteToggle";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "Choddobeshi — social deduction word game",
  description:
    "Civilians, a Doppelganger and a Chameleon. Give clues, vote, and catch the impostors. Play online with friends.",
};

export const viewport: Viewport = {
  themeColor: "#0b0f1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`} suppressHydrationWarning>
      <body>
        <Backdrop />
        <MuteToggle />
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
          {children}
        </div>
      </body>
    </html>
  );
}

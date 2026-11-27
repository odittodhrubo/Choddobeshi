import type { ChatMsg, PlayerView } from "@/shared/types";

export type Send = (event: string, payload?: unknown) => void;

export interface ScreenProps {
  view: PlayerView;
  send: Send;
}

export interface ChatScreenProps extends ScreenProps {
  chat: ChatMsg[];
}

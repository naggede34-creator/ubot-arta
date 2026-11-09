import React from "react";
import { Composition } from "remotion";
import { Promo, PROMO_DURATION } from "./Promo";

// Vertikal 9:16 (1080x1920) untuk Reels / TikTok / Story / channel Telegram
export const Root: React.FC = () => (
  <Composition id="Promo" component={Promo} durationInFrames={PROMO_DURATION} fps={30} width={1080} height={1920} />
);

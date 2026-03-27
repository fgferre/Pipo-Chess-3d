import type { CSSProperties } from "react";
import { clamp } from "./format";

export function getPromotionPopupStyle(anchor: { x: number; y: number } | null): CSSProperties | undefined {
  if (!anchor) {
    return undefined;
  }

  const popupHalfWidth = 156;
  const popupHeight = 196;
  const edgePadding = 24;
  const safeViewportWidth =
    typeof window === "undefined" ? popupHalfWidth * 2 : Math.max(window.innerWidth, popupHalfWidth * 2);
  const safeViewportHeight =
    typeof window === "undefined"
      ? popupHeight + edgePadding * 2
      : Math.max(window.innerHeight, popupHeight + edgePadding * 2);
  const placeBelow = anchor.y < popupHeight + edgePadding;
  const clampedX = clamp(anchor.x, popupHalfWidth, Math.max(popupHalfWidth, safeViewportWidth - popupHalfWidth));
  const clampedTop = placeBelow
    ? clamp(anchor.y, edgePadding, Math.max(edgePadding, safeViewportHeight - popupHeight - edgePadding))
    : clamp(anchor.y, popupHeight + edgePadding, Math.max(popupHeight + edgePadding, safeViewportHeight - edgePadding));

  return {
    left: `${clampedX}px`,
    top: `${clampedTop}px`,
    transform: placeBelow ? "translate(-50%, 0.75rem)" : "translate(-50%, calc(-100% - 0.75rem))",
  };
}

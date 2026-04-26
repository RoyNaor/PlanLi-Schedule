import { clsx } from "clsx";

const TRANS = "transition-shadow duration-150 ease-out";

/**
 * Outset ring + high z-index so the frame paints above the next row/column, not under it.
 * Parent cards must not use overflow-hidden or the ring is clipped.
 */
export function navFlashOn(active: boolean) {
  return clsx(TRANS, active && "relative z-20 ring-2 ring-[#1d5c8b]");
}

export const navFlashFocus =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5c8b]";

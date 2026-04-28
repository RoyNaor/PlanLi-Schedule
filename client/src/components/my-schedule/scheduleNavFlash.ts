import { clsx } from "clsx";

const NAV_BRAND_RING = "ring-[#1d5c8b]";
const NAV_BRAND_BORDER = "border-[#1d5c8b]";

/** With `NAV_FLASH_MS` / Tailwind `duration-200` */
const DUR = "duration-200";
const EASE = "ease-out";

/** Lifts flashed target above siblings so frame/ring is not covered */
const Z_TARGET = "z-20";
/** Fitted border overlay above column/row content */
const Z_FRAME = "z-30";

/** Hold before route + ring transition (ms). Tailwind: `duration-200`. */
export const NAV_FLASH_MS = 200;

const RING_ACTIVE = `ring-2 ${NAV_BRAND_RING}`;
const TRANS = `transition-shadow ${DUR} ${EASE}`;

/**
 * Fitted border flash (week column, month week row). Uses same color/duration as ring flash.
 */
export const navFlashFrameOverlayClass = [
  "pointer-events-none absolute inset-0",
  Z_FRAME,
  "box-border rounded-sm border-2",
  NAV_BRAND_BORDER,
  "transition-all",
  DUR,
  EASE,
].join(" ");

/**
 * Lifts a target while `navFlashOn` or frame overlay is active; export for wrappers that
 * use the same stacking as the ring/overlay (`Z_TARGET` in this module).
 */
export const navFlashTargetLift = Z_TARGET;

/** Week view: column + header + body hover — same DUR as flash. */
export const navFlashColumnHoverTransition = `transition-colors ${DUR} ${EASE}`;

/**
 * Outset ring + z-index so the frame paints above the next row/column, not under it.
 * Parent cards must not use overflow-hidden or the ring is clipped.
 */
export function navFlashOn(active: boolean) {
  return clsx(TRANS, active && clsx("relative", Z_TARGET, RING_ACTIVE));
}

export const navFlashFocus =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5c8b]";
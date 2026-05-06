import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  direction: "horizontal" | "vertical";
  initialPrimarySizePct: number;
  minPrimarySizePct?: number;
  maxPrimarySizePct?: number;
  onPrimarySizePctChange?: (value: number) => void;
  className?: string;
  primary: React.ReactNode;
  secondary: React.ReactNode;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ResizableSplit({
  direction,
  initialPrimarySizePct,
  minPrimarySizePct = 20,
  maxPrimarySizePct = 70,
  onPrimarySizePctChange,
  className,
  primary,
  secondary,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [primarySizePct, setPrimarySizePct] = useState(() =>
    clamp(initialPrimarySizePct, minPrimarySizePct, maxPrimarySizePct),
  );
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const template = useMemo(() => {
    const pct = clamp(primarySizePct, minPrimarySizePct, maxPrimarySizePct);
    if (direction === "vertical") return `${pct}% 10px minmax(0, 1fr)`;
    return `${pct}% 10px minmax(0, 1fr)`;
  }, [direction, maxPrimarySizePct, minPrimarySizePct, primarySizePct]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const el = containerRef.current;
    if (!el) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = el.getBoundingClientRect();
    const isVertical = direction === "vertical";

    const apply = (clientX: number, clientY: number) => {
      const nextPct = isVertical
        ? ((clientY - rect.top) / rect.height) * 100
        : ((clientX - rect.left) / rect.width) * 100;
      const next = clamp(nextPct, minPrimarySizePct, maxPrimarySizePct);
      setPrimarySizePct(next);
      onPrimarySizePctChange?.(next);
    };

    apply(event.clientX, event.clientY);

    const onMove = (e: PointerEvent) => apply(e.clientX, e.clientY);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={containerRef} className={className} style={{ minHeight: 0 }}>
      {isMobile ? (
        <div className="flex flex-col gap-3" style={{ minHeight: 0 }}>
          <div style={{ minWidth: 0, minHeight: 0 }}>{primary}</div>
          <div style={{ minWidth: 0, minHeight: 0 }}>{secondary}</div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: direction === "horizontal" ? template : undefined,
            gridTemplateRows: direction === "vertical" ? template : undefined,
            minHeight: 0,
          }}
        >
          <div style={{ minWidth: 0, minHeight: 0 }}>{primary}</div>

          <button
            type="button"
            aria-label="Resize panels"
            onPointerDown={handlePointerDown}
            className={`group relative ${
              direction === "vertical" ? "cursor-row-resize" : "cursor-col-resize"
            }`}
            style={{
              border: "none",
              padding: 0,
              background: "transparent",
              touchAction: "none",
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="h-full w-[2px] rounded-full bg-slate-200 group-hover:bg-slate-300 transition-colors" />
            </span>
          </button>

          <div style={{ minWidth: 0, minHeight: 0 }}>{secondary}</div>
        </div>
      )}
    </div>
  );
}


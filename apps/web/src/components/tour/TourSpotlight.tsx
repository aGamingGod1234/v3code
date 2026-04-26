// SVG-mask spotlight: full-viewport overlay with a rounded-rect cutout
// around the target element. Re-measures on window resize and when the
// target ref changes. Pure presentation — no state.

import { useEffect, useState } from "react";

interface Rect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const PADDING = 8;
const RADIUS = 10;

const measure = (el: Element): Rect => {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };
};

export function TourSpotlight({ target }: { readonly target: Element | null }) {
  const [rect, setRect] = useState<Rect | null>(target ? measure(target) : null);

  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const update = () => setRect(measure(target));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer.disconnect();
    };
  }, [target]);

  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      preserveAspectRatio="none"
    >
      <defs>
        <mask id="tour-cutout">
          <rect width="100%" height="100%" fill="white" />
          {rect ? (
            <rect
              x={Math.max(0, rect.left)}
              y={Math.max(0, rect.top)}
              width={Math.max(0, rect.width)}
              height={Math.max(0, rect.height)}
              rx={RADIUS}
              ry={RADIUS}
              fill="black"
            />
          ) : null}
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.55)" mask="url(#tour-cutout)" />
      {rect ? (
        <rect
          x={Math.max(0, rect.left)}
          y={Math.max(0, rect.top)}
          width={Math.max(0, rect.width)}
          height={Math.max(0, rect.height)}
          rx={RADIUS}
          ry={RADIUS}
          fill="none"
          stroke="rgba(255, 255, 255, 0.9)"
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}

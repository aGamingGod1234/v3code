// Tour popover: title + body + footer with Back / Skip / Next +
// progress indicator. Anchors itself to the target element's bounding
// rect, with viewport-edge clamping. Falls back to a centered modal
// when the step has no target.

import { useEffect, useState } from "react";

import { Button } from "../ui/button";

interface Position {
  readonly top: number;
  readonly left: number;
  readonly placement: "top" | "bottom" | "centered";
}

const POPOVER_WIDTH = 360;
const POPOVER_GAP = 12;
const VIEWPORT_PADDING = 12;

const placementFor = (target: Element | null): Position => {
  if (!target) return { top: 0, left: 0, placement: "centered" };
  const rect = target.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const placement = spaceBelow >= 220 ? "bottom" : "top";
  const top = placement === "bottom" ? rect.bottom + POPOVER_GAP : rect.top - POPOVER_GAP - 220;
  const desiredLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
  const left = Math.max(
    VIEWPORT_PADDING,
    Math.min(desiredLeft, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING),
  );
  return { top, left, placement };
};

export function TourPopover({
  target,
  title,
  body,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  onSkip,
  isLast,
}: {
  readonly target: Element | null;
  readonly title: string;
  readonly body: string;
  readonly stepIndex: number;
  readonly totalSteps: number;
  readonly onBack: (() => void) | null;
  readonly onNext: () => void;
  readonly onSkip: () => void;
  readonly isLast: boolean;
}) {
  const [position, setPosition] = useState<Position>(placementFor(target));

  useEffect(() => {
    const update = () => setPosition(placementFor(target));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [target]);

  const style: React.CSSProperties =
    position.placement === "centered"
      ? {
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: POPOVER_WIDTH,
        }
      : { top: position.top, left: position.left, width: POPOVER_WIDTH };

  return (
    <div
      role="dialog"
      aria-labelledby="tour-popover-title"
      className="fixed z-[60] rounded-lg border border-border bg-background p-4 shadow-xl"
      style={style}
    >
      <h2 id="tour-popover-title" className="mb-1 text-sm font-semibold text-foreground">
        {title}
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{body}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <div className="flex items-center gap-1.5">
          {onBack ? (
            <Button size="xs" variant="outline" onClick={onBack}>
              Back
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" onClick={onSkip}>
            Skip
          </Button>
          <Button size="xs" onClick={onNext}>
            {isLast ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

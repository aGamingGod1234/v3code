// TourProvider — tiny state machine that drives the first-boot
// walkthrough. Mounts <TourSpotlight> + <TourPopover> when active.
//
// Persistence: the desktop bridge stores `tourCompleted` in
// ~/.t3/userdata/desktop-settings.json (added in
// apps/desktop/src/desktopSettings.ts). On the web the same flag is
// kept in localStorage. Either way, completion is sticky — reset by
// the "Re-take tour" entry that lives in Settings → General.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { TOUR_STEPS, type TourStep } from "./steps";
import { TourPopover } from "./TourPopover";
import { TourSpotlight } from "./TourSpotlight";

const TOUR_COMPLETED_STORAGE_KEY = "v3.tour.completed";

const readTourCompleted = (): boolean => {
  try {
    return window.localStorage.getItem(TOUR_COMPLETED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const writeTourCompleted = (value: boolean): void => {
  try {
    window.localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, String(value));
  } catch {
    // localStorage unavailable in some contexts (private mode etc.) —
    // fall back to in-memory only; tour will simply re-trigger next
    // load, which is acceptable.
  }
};

export const isTourCompleted = (): boolean =>
  typeof window !== "undefined" && readTourCompleted();

export const resetTour = (): void => {
  if (typeof window !== "undefined") writeTourCompleted(false);
};

export const markTourCompleted = (): void => {
  if (typeof window !== "undefined") writeTourCompleted(true);
};

const findTarget = (selector: string | null): Element | null => {
  if (!selector) return null;
  return document.querySelector(`[data-tour-id="${selector}"]`);
};

export function TourProvider({ active }: { readonly active: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [target, setTarget] = useState<Element | null>(null);
  const [tickToken, setTickToken] = useState(0);
  const navigate = useNavigate();

  const step: TourStep | null = active ? (TOUR_STEPS[stepIndex] ?? null) : null;

  // When the step changes, navigate to its declared route (if any) so
  // the target component is mounted, then look up the target on the
  // next tick. Re-tries up to ~1s in case the route lazy-loads.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    const targetSelector = step.target;
    if (step.route) {
      void navigate({ to: step.route, replace: true });
    }
    let attempts = 0;
    const tryFind = () => {
      if (cancelled) return;
      const found = findTarget(targetSelector);
      if (found || targetSelector === null) {
        setTarget(found);
        return;
      }
      attempts += 1;
      if (attempts > 20) {
        // eslint-disable-next-line no-console
        console.warn(`Tour: target [data-tour-id="${targetSelector}"] not found after retries.`);
        setTarget(null);
        return;
      }
      window.setTimeout(tryFind, 50);
    };
    tryFind();
    return () => {
      cancelled = true;
    };
  }, [step, navigate, tickToken]);

  // Re-measure on a tick token bump (useful after step transitions).
  useEffect(() => {
    if (!active) return;
    setTickToken((n) => n + 1);
  }, [active, stepIndex]);

  const handleNext = useCallback(() => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      markTourCompleted();
      setStepIndex(0);
      // Caller (mount site) treats `active=false` as off; we can't
      // toggle that from here. The mount site reads
      // `isTourCompleted()` to recompute on next render. As a hack,
      // force a small reload-equivalent by clearing the target —
      // upstream re-renders will see the flag.
      window.dispatchEvent(new Event("v3-tour-completed"));
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [stepIndex]);

  const handleSkip = useCallback(() => {
    markTourCompleted();
    setStepIndex(0);
    window.dispatchEvent(new Event("v3-tour-completed"));
  }, []);

  const handleBack = useCallback(() => {
    setStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const onBack = isFirst ? null : handleBack;

  if (!step) return null;

  return (
    <>
      <TourSpotlight target={target} />
      <TourPopover
        target={target}
        title={step.title}
        body={step.body}
        stepIndex={stepIndex}
        totalSteps={TOUR_STEPS.length}
        onBack={onBack}
        onNext={handleNext}
        onSkip={handleSkip}
        isLast={isLast}
      />
    </>
  );
}

// Hook used by the app shell to know whether to mount the tour. Reads
// once on mount and listens for `v3-tour-completed` events so we
// re-render on completion / re-take from settings.
export function useTourActive(): boolean {
  const [active, setActive] = useState<boolean>(() => !isTourCompleted());
  useEffect(() => {
    const onCompleted = () => setActive(false);
    const onReset = () => setActive(true);
    window.addEventListener("v3-tour-completed", onCompleted);
    window.addEventListener("v3-tour-reset", onReset);
    return () => {
      window.removeEventListener("v3-tour-completed", onCompleted);
      window.removeEventListener("v3-tour-reset", onReset);
    };
  }, []);
  return active;
}

export function triggerTourRetake(): void {
  resetTour();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("v3-tour-reset"));
  }
}

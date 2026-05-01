const RESIZE_OBSERVER_LOOP_MESSAGE =
  "ResizeObserver loop completed with undelivered notifications.";

window.addEventListener(
  "error",
  (event) => {
    if (event.message !== RESIZE_OBSERVER_LOOP_MESSAGE) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true,
);

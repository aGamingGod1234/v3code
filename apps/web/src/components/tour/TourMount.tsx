// Mounts the TourProvider only when active. Lives inside the
// RouterProvider so the tour can call useNavigate() to jump between
// the routes that contain each step's target.

import { TourProvider, useTourActive } from "./TourProvider";

export function TourMount() {
  const active = useTourActive();
  if (!active) return null;
  return <TourProvider active={active} />;
}

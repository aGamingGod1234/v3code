import Sidebar from "../Sidebar";
import { useV3SignInSnapshot } from "../../v3/auth/signInState";
import LegacyProjectSidebar from "./LegacyProjectSidebar";

export default function DeviceSidebar() {
  const snapshot = useV3SignInSnapshot();

  if (snapshot.email === null) {
    return <LegacyProjectSidebar />;
  }

  return <Sidebar mode="mesh" />;
}

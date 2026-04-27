import { EnvironmentId, type ProjectId, type ThreadId } from "@v3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@v3tools/contracts/settings";
import { scopedThreadKey, scopeThreadRef } from "@v3tools/client-runtime";
import { deriveLogicalProjectKeyFromSettings } from "../../logicalProject";

export const THREAD_ID = "thread-browser-test" as ThreadId;
export const THREAD_TITLE = "Browser test thread";
export const ARCHIVED_SECONDARY_THREAD_ID = "thread-secondary-project-archived" as ThreadId;
export const PROJECT_ID = "project-1" as ProjectId;
export const SECOND_PROJECT_ID = "project-2" as ProjectId;
export const LOCAL_ENVIRONMENT_ID = EnvironmentId.make("environment-local");
export const REMOTE_ENVIRONMENT_ID = EnvironmentId.make("environment-remote");
export const THREAD_REF = scopeThreadRef(LOCAL_ENVIRONMENT_ID, THREAD_ID);
export const THREAD_KEY = scopedThreadKey(THREAD_REF);
export const UUID_ROUTE_RE =
  /^\/draft\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PROJECT_DRAFT_KEY = `${LOCAL_ENVIRONMENT_ID}:${PROJECT_ID}`;
export const PROJECT_LOGICAL_KEY = deriveLogicalProjectKeyFromSettings(
  {
    environmentId: LOCAL_ENVIRONMENT_ID,
    id: PROJECT_ID,
    cwd: "/repo/project",
    repositoryIdentity: null,
  },
  {
    sidebarProjectGroupingMode: DEFAULT_CLIENT_SETTINGS.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: DEFAULT_CLIENT_SETTINGS.sidebarProjectGroupingOverrides,
  },
);
export const NOW_ISO = "2026-03-04T12:00:00.000Z";
export const BASE_TIME_MS = Date.parse(NOW_ISO);
export const ATTACHMENT_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'></svg>";
export const ADD_PROJECT_SUBMENU_PLACEHOLDER = "Enter path (e.g. ~/projects/my-app)";

export interface ViewportSpec {
  name: string;
  width: number;
  height: number;
  textTolerancePx: number;
  attachmentTolerancePx: number;
}

export const DEFAULT_VIEWPORT: ViewportSpec = {
  name: "desktop",
  width: 960,
  height: 1_100,
  textTolerancePx: 44,
  attachmentTolerancePx: 56,
};

export const WIDE_FOOTER_VIEWPORT: ViewportSpec = {
  name: "wide-footer",
  width: 1_400,
  height: 1_100,
  textTolerancePx: 44,
  attachmentTolerancePx: 56,
};

export const COMPACT_FOOTER_VIEWPORT: ViewportSpec = {
  name: "compact-footer",
  width: 430,
  height: 932,
  textTolerancePx: 56,
  attachmentTolerancePx: 56,
};

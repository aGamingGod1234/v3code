// Build-time default OAuth configuration.
//
// Do not put real credentials in this tracked file. For local runs and release
// builds, prefer environment variables such as V3CODE_GITHUB_PUBLIC_CLIENT_ID,
// V3CODE_GITHUB_CLIENT_ID, or V3CODE_GOOGLE_CLIENT_ID. Forks that need a
// private build-time override should keep it in an ignored local file and wire
// it through their own build pipeline.

export const EMBEDDED_GOOGLE_CLIENT_ID: string | null = null;
export const EMBEDDED_GOOGLE_CLIENT_SECRET: string | null = null;
export const EMBEDDED_GITHUB_CLIENT_ID: string | null = null;
export const EMBEDDED_GITHUB_CLIENT_SECRET: string | null = null;

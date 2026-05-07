// Historical template for private embedded OAuth credentials.
//
// `embeddedAuthConfig.ts` is tracked with null defaults so CI and fresh clones
// build consistently. Do not paste real credentials into tracked files. Use
// environment variables or a fork-specific private build step instead.
//
// Useful environment variables:
// - V3CODE_GOOGLE_CLIENT_ID
// - V3CODE_GOOGLE_CLIENT_SECRET
// - V3CODE_GITHUB_PUBLIC_CLIENT_ID
// - V3CODE_GITHUB_CLIENT_ID
// - V3CODE_GITHUB_CLIENT_SECRET

export const EMBEDDED_GOOGLE_CLIENT_ID: string | null = null;
export const EMBEDDED_GOOGLE_CLIENT_SECRET: string | null = null;
export const EMBEDDED_GITHUB_CLIENT_ID: string | null = null;
export const EMBEDDED_GITHUB_CLIENT_SECRET: string | null = null;

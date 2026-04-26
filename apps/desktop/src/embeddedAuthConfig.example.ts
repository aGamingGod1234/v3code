// Template for embeddedAuthConfig.ts — copy this file to
// `embeddedAuthConfig.ts` (gitignored) and paste your Google OAuth
// credentials. The build inlines these into the Electron main bundle
// and the desktop main process forwards them to the embedded V3 server
// via `backendChildEnv()` so the Google sign-in button becomes
// enabled out of the box.
//
// If you leave this file absent, the desktop app still builds but
// Google sign-in is disabled until the user configures a server-node
// via Settings → Connections.
//
// For forks: create your own Google OAuth 2.0 client in Google Cloud
// Console (type: Web application) with redirect URIs that match your
// server-node's public URL. The desktop PKCE flow additionally needs
// the custom-URI-scheme redirect `v3://auth/google/callback` — Google
// Cloud Console still accepts this on installed-application clients
// if you create one of that type.

export const EMBEDDED_GOOGLE_CLIENT_ID: string | null = null;
export const EMBEDDED_GOOGLE_CLIENT_SECRET: string | null = null;

// Desktop-specific GitHub OAuth App credentials. A separate app from
// the server-node's GitHub OAuth is required because GitHub OAuth Apps
// only allow one Authorization callback URL — the desktop build needs
// loopback (`http://127.0.0.1/auth/github/callback`) while the
// server-node build needs an https domain. Create one at
// https://github.com/settings/developers (name: "<your app> Desktop",
// callback: http://127.0.0.1/auth/github/callback) and paste its
// credentials here.
export const EMBEDDED_GITHUB_CLIENT_ID: string | null = null;
export const EMBEDDED_GITHUB_CLIENT_SECRET: string | null = null;

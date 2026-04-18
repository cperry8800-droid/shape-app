// Registry of OAuth integrations the app supports. Adding a new provider
// is a matter of dropping a new entry here and registering the client
// credentials in the environment — the generic authorize/callback routes
// handle the rest.
//
// Apple Watch is intentionally NOT in this registry: Apple HealthKit data
// is only accessible via a native iOS app with HealthKit entitlements,
// not a web OAuth flow. The UI still surfaces it, but with a "requires
// iOS app" state instead of a Connect button.

export type ProviderId = 'spotify' | 'strava' | 'whoop' | 'garmin';

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  // Public user-facing blurb.
  description: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  // Env var holding the OAuth client id / secret. We never hardcode these.
  clientIdEnv: string;
  clientSecretEnv: string;
  // Some providers (Spotify, Garmin) support/require PKCE.
  usesPkce?: boolean;
  // Extra params to include on the authorize redirect.
  extraAuthorizeParams?: Record<string, string>;
  // For Strava: token response uses `expires_at` (unix seconds) instead
  // of `expires_in`. Set this to handle provider quirks in callback.
  tokenResponseMode?: 'expires_in' | 'expires_at_unix';
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  spotify: {
    id: 'spotify',
    label: 'Spotify',
    description: 'Pick workout playlists directly from your Spotify library.',
    authorizeUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scope: 'playlist-read-private playlist-read-collaborative user-read-email',
    clientIdEnv: 'SPOTIFY_CLIENT_ID',
    clientSecretEnv: 'SPOTIFY_CLIENT_SECRET',
    usesPkce: true,
  },
  strava: {
    id: 'strava',
    label: 'Strava',
    description: 'Sync runs, rides, and workouts so your coach sees your activity.',
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scope: 'read,activity:read_all',
    clientIdEnv: 'STRAVA_CLIENT_ID',
    clientSecretEnv: 'STRAVA_CLIENT_SECRET',
    extraAuthorizeParams: { approval_prompt: 'auto' },
    tokenResponseMode: 'expires_at_unix',
  },
  whoop: {
    id: 'whoop',
    label: 'Whoop',
    description: 'Share recovery, strain, and sleep data with your coach.',
    authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scope: 'read:recovery read:cycles read:workout read:sleep read:profile offline',
    clientIdEnv: 'WHOOP_CLIENT_ID',
    clientSecretEnv: 'WHOOP_CLIENT_SECRET',
  },
  garmin: {
    id: 'garmin',
    label: 'Garmin',
    description: 'Pull Garmin Connect activities, HR, and sleep into your profile.',
    // Garmin Health API v2 uses OAuth 2.0 + PKCE (the old Connect API used
    // OAuth 1.0a; v2 replaces it).
    authorizeUrl: 'https://connect.garmin.com/oauth2Confirm',
    tokenUrl: 'https://connectapi.garmin.com/di-oauth2-service/oauth/token',
    scope: 'ACTIVITY_EXPORT HEALTH_EXPORT',
    clientIdEnv: 'GARMIN_CLIENT_ID',
    clientSecretEnv: 'GARMIN_CLIENT_SECRET',
    usesPkce: true,
  },
};

export function getProvider(id: string): ProviderConfig | null {
  return (PROVIDERS as Record<string, ProviderConfig>)[id] ?? null;
}

export function getClientCredentials(cfg: ProviderConfig): { clientId: string; clientSecret: string } | null {
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * OAuth Handler
 *
 * OAuth authorization and callback endpoints.
 * Routes are registered directly in src/server.ts at /oauth/:path
 * (not under /api/ prefix)
 *
 * GET /oauth/:providerName/authorize - Start OAuth flow (requires auth)
 * GET /oauth/:providerName/callback - Handle OAuth callback (no auth, uses state)
 */

import { getOAuthProvider } from '~/server/services/oauth-service';
import { getProvider, updateProvider, hasProviderAccess } from '~/server/services/provider-service';
import { logger } from '~/server/utils/logger';
import { authenticateRequest } from '~/server/services/auth';

// Default scopes per OAuth provider
const DEFAULT_SCOPES: Record<string, string[]> = {
  google: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

/**
 * Handle OAuth requests at /oauth/:providerName/:action
 */
export async function handleOAuth(request: Request, path: string): Promise<Response> {
  // Parse path: /:providerName/authorize or /:providerName/callback
  const pathParts = path.split('/').filter(Boolean);
  
  if (pathParts.length < 2) {
    return errorResponse('Invalid OAuth path', 404);
  }

  const providerName = pathParts[0];
  const action = pathParts[1];

  if (action === 'authorize') {
    return handleAuthorize(request, providerName);
  } else if (action === 'callback') {
    return handleCallback(request, providerName);
  } else {
    return errorResponse('Invalid OAuth action', 404);
  }
}

/**
 * Start OAuth authorization flow
 * Requires authenticated user
 */
async function handleAuthorize(request: Request, providerName: string): Promise<Response> {
  const url = new URL(request.url);
  const providerId = url.searchParams.get('providerId');

  // Check authentication - extract cookies and auth header from request
  const cookies = request.headers.get('cookie') ?? null;
  const authHeader = request.headers.get('authorization') ?? null;
  const user = await authenticateRequest(cookies, authHeader);
  if (!user) {
    return errorResponse('Unauthorized', 401);
  }

  if (!providerId) {
    return errorResponse('provider_id is required', 400);
  }

  // Verify user has access to this provider
  const hasAccess = await hasProviderAccess(user.id, providerId);
  if (!hasAccess) {
    return errorResponse('Access denied', 403);
  }

  // Get OAuth provider implementation
  const oauthProvider = getOAuthProvider(providerName);
  if (!oauthProvider) {
    return errorResponse(`Unknown OAuth provider: ${providerName}`, 400);
  }

  // Check if OAuth credentials are configured
  if (!oauthProvider.isConfigured()) {
    return errorResponse(`OAuth provider "${providerName}" is not configured. Please set the required environment variables.`, 500);
  }

  // Generate state parameter with provider ID and user ID
  const state = Buffer.from(
    JSON.stringify({
      providerId,
      userId: user.id,
      timestamp: Date.now(),
    })
  ).toString('base64url');

  // Build redirect URI
  const host = request.headers.get('host') ?? 'localhost:3000';
  const scheme = host.includes('localhost') ? 'http' : 'https';
  const callbackUri = `${scheme}://${host}/oauth/${providerName}/callback`;

  // Get authorization URL with default scopes for this provider
  const scopes = DEFAULT_SCOPES[providerName] ?? [];
  const authUrl = oauthProvider.getAuthorizationUrl(scopes, state, callbackUri);

  // Return the auth URL as JSON so frontend can open popup
  return jsonResponse({ authUrl });
}

/**
 * Handle OAuth callback from provider
 * Returns HTML that sends postMessage to opener and closes popup
 */
async function handleCallback(request: Request, providerName: string): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return oauthResultHtml(false, error);
  }

  if (!code || !state) {
    return oauthResultHtml(false, 'Missing code or state parameter');
  }

  // Decode state
  let stateData: { providerId: string; userId: string; timestamp: number };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch {
    return oauthResultHtml(false, 'Invalid state parameter');
  }

  // Validate state timestamp (15 minute expiry)
  if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
    return oauthResultHtml(false, 'State expired');
  }

  // Get OAuth provider implementation
  const oauthProvider = getOAuthProvider(providerName);
  if (!oauthProvider) {
    return oauthResultHtml(false, `Unknown OAuth provider: ${providerName}`);
  }

  try {
    // Build redirect URI for token exchange (must match authorize)
    const host = request.headers.get('host') ?? 'localhost:3000';
    const scheme = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${scheme}://${host}/oauth/${providerName}/callback`;

    // Exchange code for tokens
    const tokens = await oauthProvider.exchangeCode(code, redirectUri);

    // Get the provider record
    const provider = await getProvider(stateData.providerId);
    if (!provider) {
      return oauthResultHtml(false, 'Provider not found');
    }

    // Update provider with tokens
    const config = {
      ...provider.config,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt?.toISOString(),
      scope: tokens.scope,
    };

    await updateProvider(stateData.providerId, { config });

    logger.info('OAuth tokens stored successfully', {
      provider: providerName,
      providerId: stateData.providerId,
    });

    return oauthResultHtml(true);
  } catch (err) {
    logger.error('OAuth callback error', { error: err instanceof Error ? err.message : String(err) });
    return oauthResultHtml(false, err instanceof Error ? err.message : 'Unknown error');
  }
}

/**
 * Generate HTML that communicates result to opener and closes popup
 */
function oauthResultHtml(success: boolean, error?: string): Response {
  const resultData = { success, error };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>OAuth ${success ? 'Success' : 'Error'}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .success { color: #10b981; }
    .error { color: #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <h2 class="${success ? 'success' : 'error'}">
      ${success ? 'Connected successfully!' : `Connection failed: ${error || 'Unknown error'}`}
    </h2>
    <p>${success ? 'This window will close automatically.' : 'Please close this window and try again.'}</p>
  </div>
  <script>
    const result = ${JSON.stringify(resultData)};
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth_callback', ...result }, '*');
      if (result.success) {
        setTimeout(() => window.close(), 1500);
      }
    }
  </script>
</body>
</html>
`;

  return htmlResponse(html);
}

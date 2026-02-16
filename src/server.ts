import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// Load environment variables from .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

// Initialize settings early (must be imported after dotenv.config)
// This ensures settings are loaded before any other modules that depend on them
import '~/server/settings';
import { settings } from '~/server/settings';
import { getEnvWithSecret } from '~/server/utils/docker-secrets';

import handler, { type ServerEntry } from "@tanstack/react-start/server-entry";
import { createServer } from "node:http";
import {
  convertToFetchRequest,
  serveStaticFile,
} from "./serverUtils";
import { handleApiRequest } from "~/server/api";
import { startWorker, stopWorker, isWorkerRunning, initWorkerUtils } from "~/server/jobs/worker";
import { logger, runWithRequestContext, logAccess } from "~/server/utils/logger";
import { initSentry, captureException, flush as flushSentry } from "~/server/utils/sentry";

// Auth handlers (lazy loaded to avoid SSR issues)
async function handleAuthLogin(request: Request): Promise<Response> {
  const { getAuthorizationUrl } = await import("~/server/auth/workos");
  const { signState, isSafeRedirectUrl } = await import("~/server/utils/session");
  const crypto = await import("crypto");

  const url = new URL(request.url);
  const nextUrl = url.searchParams.get("next") || "/";
  const prompt = url.searchParams.get("prompt") || undefined;

  const authType = settings.auth.AUTH_TYPE;

  // If auth is disabled, redirect directly
  if (authType === "none") {
    return Response.redirect(new URL(nextUrl, request.url), 302);
  }

  // For password auth, redirect to login page
  if (authType === "password") {
    return Response.redirect(
      new URL(`/login?next=${encodeURIComponent(nextUrl)}`, request.url),
      302
    );
  }

  // WorkOS OAuth flow
  const host = request.headers.get("host") || "localhost:5173";
  const isLocalhost = host.includes("localhost");
  const scheme = isLocalhost ? "http" : "https";
  const redirectUri = `${scheme}://${host}/auth/callback`;

  // Generate CSRF token and sign state
  const csrf = crypto.randomBytes(32).toString("base64url");
  const safeNextUrl = isSafeRedirectUrl(nextUrl, host) ? nextUrl : "/";
  const state = signState({ csrf, next: safeNextUrl });

  // Get WorkOS authorization URL
  const authUrl = getAuthorizationUrl(redirectUri, state, prompt);

  return Response.redirect(authUrl, 302);
}

async function handleAuthCallback(request: Request): Promise<Response> {
  const { parseState, createSessionCookie, isSafeRedirectUrl } = await import(
    "~/server/utils/session"
  );
  const { exchangeCodeForToken } = await import("~/server/auth/workos");
  const { getOrCreateUser } = await import("~/server/services/user");

  const url = new URL(request.url);
  const host = request.headers.get("host") || "localhost:5173";

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const authType = settings.auth.AUTH_TYPE;

  // If auth is disabled, redirect to home
  if (authType === "none") {
    return Response.redirect(new URL("/", request.url), 302);
  }

  // Handle OAuth errors
  if (error) {
    logger.error("OAuth error", { error });
    return Response.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error)}`, request.url),
      302
    );
  }

  if (!code || !state) {
    return Response.redirect(
      new URL("/auth/login?error=missing_code_or_state", request.url),
      302
    );
  }

  // Validate state
  const stateData = parseState(state);
  if (!stateData) {
    return Response.redirect(
      new URL("/auth/login?error=invalid_state", request.url),
      302
    );
  }

  const nextUrl = isSafeRedirectUrl(stateData.next, host) ? stateData.next : "/";

  try {
    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForToken(code);

    // Get or create user
    await getOrCreateUser({
      workosUserId: tokenResponse.user.id,
      email: tokenResponse.user.email,
      firstName: tokenResponse.user.firstName,
      lastName: tokenResponse.user.lastName,
    });

    // Create session cookie
    const sessionCookie = createSessionCookie(tokenResponse.accessToken);

    // Build cookie string
    const isSecure = !host.includes("localhost");
    const cookieValue = `session=${sessionCookie}; Max-Age=${30 * 24 * 3600}; Path=/; HttpOnly; SameSite=Lax${isSecure ? "; Secure" : ""}`;

    // Create redirect response with cookie
    const redirectUrl = new URL(nextUrl, request.url);
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl.toString(),
        "Set-Cookie": cookieValue,
      },
    });
  } catch (err) {
    logger.error("OAuth callback error", { error: err instanceof Error ? err.message : String(err) });
    return Response.redirect(
      new URL("/auth/login?error=authentication_failed", request.url),
      302
    );
  }
}

async function handleAuthLogout(request: Request): Promise<Response> {
  const { getJwtFromSessionCookie } = await import("~/server/utils/session");
  const { revokeSession } = await import("~/server/auth/workos");

  const authType = settings.auth.AUTH_TYPE;

  // Try to revoke the session
  const cookies = request.headers.get("cookie");
  if (cookies && authType !== "none") {
    const sessionCookie = cookies
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("session="));

    if (sessionCookie) {
      try {
        const cookieValue = sessionCookie.split("=")[1];
        const jwt = getJwtFromSessionCookie(cookieValue);

        if (jwt) {
          await revokeSession(jwt);
        }
      } catch (error) {
        logger.error("Session revocation error", { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  // Determine redirect URL
  const redirectUrl = authType === "none" ? "/" : "/auth/login?prompt=select_account";

  // Clear the session cookie
  const cookieValue = "session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(redirectUrl, request.url).toString(),
      "Set-Cookie": cookieValue,
    },
  });
}

const serverEntry: ServerEntry = {
  async fetch(request) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    // Handle health check endpoint (skip request context for performance)
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Wrap all other requests with request context
    return runWithRequestContext(
      { requestId, method: request.method, path: url.pathname },
      async () => {
        // Handle auth endpoints directly (bypass TanStack Router)
        if (url.pathname === "/auth/login") {
          return handleAuthLogin(request);
        }
        if (url.pathname === "/auth/callback") {
          return handleAuthCallback(request);
        }
        if (url.pathname === "/auth/logout") {
          return handleAuthLogout(request);
        }

        // Handle webhook routes (not under /api/ - webhooks are public endpoints)
        if (url.pathname.startsWith("/webhook/")) {
          const { handleWebhook } = await import("~/server/api/routes/webhooks");
          const path = url.pathname.slice("/webhook".length); // Get everything after /webhook
          return handleWebhook(request, path);
        }

        // Handle OAuth routes (not under /api/ - OAuth needs special handling)
        if (url.pathname.startsWith("/oauth/")) {
          const { handleOAuth } = await import("~/server/api/routes/oauth");
          const path = url.pathname.slice("/oauth".length); // Get everything after /oauth
          return handleOAuth(request, path);
        }

        // Handle API routes
        if (url.pathname.startsWith("/api/")) {
          const apiResponse = await handleApiRequest(request);
          if (apiResponse) {
            return apiResponse;
          }
        }

        // Handle admin panel routes (if enabled)
        if (url.pathname.startsWith("/admin") && settings.general.ENABLE_ADMIN) {
          try {
            const { createAdminRouter } = await import("~/server/admin");
            const adminRouter = await createAdminRouter({
              rootPath: "/admin",
              credentials: settings.general.ADMIN_EMAIL && settings.general.ADMIN_PASSWORD ? {
                email: settings.general.ADMIN_EMAIL,
                password: settings.general.ADMIN_PASSWORD,
              } : undefined,
            });
            return adminRouter.fetch(request);
          } catch (error) {
            logger.error('Admin panel error', { error: error instanceof Error ? error.message : String(error) });
            return new Response(`Admin Error: ${error}`, { status: 500 });
          }
        }

        return handler.fetch(request);
      }
    );
  },
};

// Start HTTP server when this file is executed directly
const isMainModule = (() => {
  try {
    const mainModulePath = process.argv[1]?.replace(/\\/g, "/");
    const currentModulePath = import.meta.url.replace(/^file:\/\//, "");
    return (
      mainModulePath === currentModulePath ||
      mainModulePath?.endsWith("server.js")
    );
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const PORT = parseInt(getEnvWithSecret('PORT') || '3000', 10);
  const HOST = getEnvWithSecret('HOST') || "0.0.0.0";
  const ENABLE_WORKER = settings.worker.ENABLE_WORKER;
  const WORKER_ONLY = settings.worker.WORKER_ONLY;

  // Initialize Sentry early for error tracking
  await initSentry();

  // If running as worker-only mode, just start the worker
  if (WORKER_ONLY) {
    (async () => {
      logger.info("Starting in worker-only mode...");
      try {
        await startWorker();
        logger.info("Background worker started successfully");
      } catch (error) {
        logger.error("Failed to start worker", { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      }
    })();
  } else {
    // Initialize worker utils so jobs can be scheduled even if worker is separate
    initWorkerUtils().catch((err: unknown) => {
      logger.warn("Failed to initialize worker utils", { error: err instanceof Error ? err.message : String(err) });
    });

    // Optionally start worker in same process
    if (ENABLE_WORKER) {
      startWorker().catch((err: unknown) => {
        logger.error("Failed to start embedded worker", { error: err instanceof Error ? err.message : String(err) });
      });
    }

  const server = createServer(async (req, res) => {
    const startTime = Date.now();
    const urlPath = req.url || "/";
    const pathname = urlPath.split("?")[0].split("#")[0];
    const method = req.method || "GET";

    // Log access when response finishes
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logAccess({
        method,
        path: pathname,
        status: res.statusCode,
        duration,
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
    });

    try {
      // Handle health check endpoint directly
      if (pathname === "/health") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // Try to serve static files first
      const staticPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;

      if (
        staticPath.startsWith("assets/") ||
        staticPath === "favicon.ico" ||
        staticPath === "vite.svg"
      ) {
        const served = await serveStaticFile(staticPath, res);
        if (served) {
          return;
        }
      }

      // Convert Node.js request to Fetch API Request
      const request = await convertToFetchRequest(req);
      const response = await serverEntry.fetch(request);

      // Convert Fetch API Response to Node.js response
      res.statusCode = response.status;
      res.statusMessage = response.statusText;

      // Copy headers
      response.headers.forEach((value, key) => {
        if (
          key.toLowerCase() !== "connection" &&
          key.toLowerCase() !== "transfer-encoding"
        ) {
          res.setHeader(key, value);
        }
      });

      // Stream the response body
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            captureException(err, { context: 'response_streaming' });
            logger.error("Error streaming response", { error: err.message });
            if (!res.headersSent) {
              res.statusCode = 500;
            }
            res.end();
          }
        };
        pump();
      } else {
        res.end();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { context: 'server_handler' });
      logger.error("Server error", { error: err.message });
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end("Internal Server Error");
    }
  });

  server.listen(Number(PORT), HOST, () => {
    logger.info(`Server running on http://${HOST}:${PORT}`);
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);

    // Stop worker if running
    if (isWorkerRunning()) {
      logger.info("Stopping background worker...");
      await stopWorker();
    }

    // Flush Sentry events before shutdown
    await flushSentry(2000);

    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } // Close the else block for WORKER_ONLY check
}

export default serverEntry;

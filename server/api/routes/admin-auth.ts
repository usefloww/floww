/**
 * Admin Auth Routes
 *
 * Authentication endpoints for admin/web UI.
 *
 * GET /auth/login - Login page redirect
 * POST /auth/login - Password login
 * GET /auth/callback - OAuth callback
 * POST /auth/logout - Logout
 * GET /auth/setup - Check initial setup
 * POST /auth/setup - Initial admin setup
 */

import { eq } from 'drizzle-orm';
import { get, post, json, errorResponse } from '~/server/api/router';
import { getDb } from '~/server/db';
import { users } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { createJwt } from '~/server/utils/jwt';
import { buildSessionSetCookieHeader, clearSessionCookie } from '~/server/utils/session';
import bcrypt from 'bcryptjs';
import { logger } from '~/server/utils/logger';
import { settings } from '~/server/settings';

const authType = settings.auth.AUTH_TYPE;
const workosClientId = settings.auth.WORKOS_CLIENT_ID;
const workosApiKey = settings.auth.WORKOS_API_KEY;

// Login redirect
get('/auth/login', async ({ query, request }) => {
  const next = query.get('next') ?? '/';

  if (authType === 'workos') {
    // Redirect to WorkOS AuthKit
    const redirectUri = `${getBaseUrl(request)}/api/auth/callback`;
    const workosUrl = `https://api.workos.com/user_management/authorize?client_id=${workosClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(next)}`;
    return Response.redirect(workosUrl, 302);
  }

  // Password auth - redirect to login page
  return Response.redirect(`/login?next=${encodeURIComponent(next)}`, 302);
}, false);

// Password login
post('/auth/login', async ({ request }) => {
  if (authType !== 'password') {
    return errorResponse('Password login is disabled', 400);
  }

  const formData = await request.formData();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const next = (formData.get('next') as string) ?? '/';

  if (!email || !password) {
    return json({ error: 'Email and password are required' }, 400);
  }

  const db = getDb();

  // Find user by email
  const userResults = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (userResults.length === 0) {
    return json({ error: 'Invalid email or password' }, 401);
  }

  const user = userResults[0];

  // Check password
  if (!user.passwordHash) {
    return json({ error: 'Password login not set up for this user' }, 401);
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return json({ error: 'Invalid email or password' }, 401);
  }

  // Create JWT and session cookie
  const token = await createJwt({ sub: user.id });
  const setCookie = buildSessionSetCookieHeader(token, {
    secure: !getBaseUrl(request).includes('localhost'),
  });

  return new Response(JSON.stringify({ success: true, redirect: next }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookie,
    },
  });
}, false);

// OAuth callback (WorkOS)
get('/auth/callback', async ({ query, request }) => {
  if (authType !== 'workos') {
    return errorResponse('OAuth callback is disabled', 400);
  }

  const code = query.get('code');
  const state = query.get('state') ?? '/';
  const error = query.get('error');

  if (error) {
    return Response.redirect(`/login?error=${encodeURIComponent(error)}`, 302);
  }

  if (!code) {
    return Response.redirect('/login?error=missing_code', 302);
  }

  try {
    // Exchange code for user info via WorkOS
    const tokenResponse = await fetch('https://api.workos.com/user_management/authenticate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workosApiKey}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: workosClientId,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error('WorkOS auth failed', { error });
      return Response.redirect('/login?error=auth_failed', 302);
    }

    const authData = await tokenResponse.json();
    const workosUser = authData.user;

    const db = getDb();

    // Find or create user
    const userResults = await db
      .select()
      .from(users)
      .where(eq(users.email, workosUser.email.toLowerCase()))
      .limit(1);

    let userId: string;

    if (userResults.length === 0) {
      // Create new user
      const newUser = await db
        .insert(users)
        .values({
          id: generateUlidUuid(),
          email: workosUser.email.toLowerCase(),
          firstName: workosUser.first_name,
          lastName: workosUser.last_name,
          workosUserId: workosUser.id,
        })
        .returning();
      userId = newUser[0].id;
    } else {
      userId = userResults[0].id;
      // Update WorkOS ID if not set
      if (!userResults[0].workosUserId) {
        await db
          .update(users)
          .set({ workosUserId: workosUser.id })
          .where(eq(users.id, userId));
      }
    }

    // Create JWT and session cookie
    const token = await createJwt({ sub: userId });
    const setCookie = buildSessionSetCookieHeader(token, {
      secure: !getBaseUrl(request).includes('localhost'),
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: state,
        'Set-Cookie': setCookie,
      },
    });
  } catch (error) {
    logger.error('OAuth callback error', { error: error instanceof Error ? error.message : String(error) });
    return Response.redirect('/login?error=callback_failed', 302);
  }
}, false);

// Logout
post('/auth/logout', async () => {
  const cookieHeader = clearSessionCookie();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookieHeader,
    },
  });
}, false);

// Check initial setup status
get('/auth/setup', async () => {
  const db = getDb();

  // Check if any admin user exists
  const adminCount = await db
    .select()
    .from(users)
    .where(eq(users.isAdmin, true))
    .limit(1);

  return json({
    setupRequired: adminCount.length === 0,
    authType,
  });
}, false);

// Initial admin setup
post('/auth/setup', async ({ request }) => {
  if (authType !== 'password') {
    return errorResponse('Setup is only available with password authentication', 400);
  }

  const db = getDb();

  // Check if any admin user exists
  const adminCount = await db
    .select()
    .from(users)
    .where(eq(users.isAdmin, true))
    .limit(1);

  if (adminCount.length > 0) {
    return errorResponse('Setup already completed', 400);
  }

  const body = await request.json();
  const { email, password, firstName, lastName } = body;

  if (!email || !password) {
    return errorResponse('Email and password are required', 400);
  }

  if (password.length < 8) {
    return errorResponse('Password must be at least 8 characters', 400);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create admin user
  const newUser = await db
    .insert(users)
    .values({
      id: generateUlidUuid(),
      email: email.toLowerCase(),
      firstName,
      lastName,
      passwordHash,
      isAdmin: true,
    })
    .returning();

  // Create JWT and session cookie
  const token = await createJwt({ sub: newUser[0].id });
  const setCookie = buildSessionSetCookieHeader(token, {
    secure: !getBaseUrl(request).includes('localhost'),
  });

  return new Response(
    JSON.stringify({
      success: true,
      user: {
        id: newUser[0].id,
        email: newUser[0].email,
      },
    }),
    {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookie,
      },
    }
  );
}, false);

// Helper to get base URL
function getBaseUrl(request: Request): string {
  const host = request.headers.get('host') ?? 'localhost:3000';
  const scheme = host.includes('localhost') ? 'http' : 'https';
  return `${scheme}://${host}`;
}

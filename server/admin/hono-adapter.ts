/**
 * AdminJS Hono Adapter
 * 
 * A Hono adapter for AdminJS, similar to @adminjs/express but for Hono.
 */

import AdminJS, { Router as AdminRouter } from 'adminjs';
import { Hono } from 'hono';
// serveStatic is available but not currently used
// import { serveStatic } from 'hono/serve-static';
import path from 'node:path';
import fs from 'node:fs';
import { logger } from '~/server/utils/logger';

/**
 * Convert AdminJS route path format to Hono format
 * AdminJS uses {paramName}, Hono uses :paramName
 */
function convertToHonoRoute(adminPath: string): string {
  return adminPath.replace(/{(\w+)}/g, ':$1');
}

/**
 * Parse multipart form data from a Request
 */
async function parseFormData(request: Request): Promise<{ fields: Record<string, unknown>; files: Record<string, unknown> }> {
  const contentType = request.headers.get('content-type') || '';
  const fields: Record<string, unknown> = {};
  const files: Record<string, unknown> = {};

  if (contentType.includes('application/json')) {
    try {
      const json = await request.json();
      Object.assign(fields, json);
    } catch {
      // Empty body or invalid JSON
    }
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    try {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        fields[key] = value;
      }
    } catch {
      // Empty body
    }
  } else if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          // Convert File to a format AdminJS expects
          const buffer = await value.arrayBuffer();
          files[key] = {
            name: value.name,
            type: value.type,
            size: value.size,
            path: '', // AdminJS may expect a file path for some operations
            buffer: Buffer.from(buffer),
          };
        } else {
          fields[key] = value;
        }
      }
    } catch {
      // Empty body
    }
  }

  return { fields, files };
}

/**
 * Get the current admin user from session (if authenticated)
 */
function getAdminUser(request: Request): Record<string, unknown> | null {
  const cookie = request.headers.get('cookie') || '';
  const sessionMatch = cookie.match(/admin_session=([^;]+)/);
  
  if (sessionMatch) {
    try {
      const decoded = Buffer.from(sessionMatch[1], 'base64').toString();
      return { email: decoded };
    } catch {
      return null;
    }
  }
  
  return null;
}

export interface BuildRouterOptions {
  /** Custom authentication function */
  authenticate?: (email: string, password: string) => Promise<Record<string, unknown> | null>;
  /** Session cookie name */
  cookieName?: string;
  /** Cookie options */
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    path?: string;
    maxAge?: number;
  };
}

/**
 * Build a Hono router for AdminJS
 */
export function buildRouter(admin: AdminJS, _options: BuildRouterOptions = {}): Hono {
  const rootPath = admin.options.rootPath;
  const router = new Hono();
  const { routes, assets } = AdminRouter;

  // Initialize AdminJS (builds the frontend bundle)
  admin.initialize().then(() => {
    logger.info('AdminJS: bundle ready');
  }).catch((err) => {
    logger.error('AdminJS: bundle error', { error: err instanceof Error ? err.message : String(err) });
  });

  // Serve static assets (prepend rootPath)
  for (const asset of assets) {
    const assetPath = rootPath + asset.path;
    router.get(assetPath, async (c) => {
      try {
        const filePath = path.resolve(asset.src);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          
          const mimeTypes: Record<string, string> = {
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.eot': 'application/vnd.ms-fontobject',
          };
          
          c.header('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          c.header('Cache-Control', 'public, max-age=86400');
          return c.body(content);
        }
        return c.text('Asset not found', 404);
      } catch (error) {
        logger.error('Asset error', { error: error instanceof Error ? error.message : String(error) });
        return c.text('Asset error', 500);
      }
    });
  }

  // Register all AdminJS routes (prepend rootPath)
  for (const route of routes) {
    // Convert path format and prepend rootPath
    const routePath = route.path === '' ? rootPath : rootPath + convertToHonoRoute(route.path);
    
    const handler = async (c: any) => {
      try {
        const request = c.req.raw as Request;
        const url = new URL(request.url);
        
        // Get current admin user from session
        const currentAdmin = getAdminUser(request);
        
        // Create the controller instance
        const controller = new route.Controller({ admin }, currentAdmin);
        
        // Parse request body for POST requests
        const { fields, files } = route.method === 'POST' 
          ? await parseFormData(request)
          : { fields: {}, files: {} };
        
        // Build the request object that AdminJS expects
        const adminRequest = {
          params: c.req.param() || {},
          query: Object.fromEntries(url.searchParams),
          payload: { ...fields, ...files },
          method: request.method.toLowerCase(),
          // Additional properties that some controllers might need
          headers: Object.fromEntries(request.headers),
          url: url.pathname + url.search,
          path: url.pathname,
        };

        // Call the controller action
        const response = await controller[route.action](adminRequest, c.res);

        // Handle the response
        if (response === null || response === undefined) {
          // Controller handled the response directly (e.g., redirect)
          return c.body(null);
        }

        if (typeof response === 'string') {
          // HTML response
          if (route.contentType) {
            c.header('Content-Type', route.contentType);
          } else {
            c.header('Content-Type', 'text/html; charset=utf-8');
          }
          return c.body(response);
        }

        if (typeof response === 'object') {
          // JSON response
          return c.json(response);
        }

        return c.body(response);
      } catch (error) {
        logger.error('AdminJS route error', { action: route.action, error: error instanceof Error ? error.message : String(error) });
        return c.text(`Admin error: ${error}`, 500);
      }
    };

    // Register the route with the appropriate method
    if (route.method === 'GET') {
      router.get(routePath, handler);
    } else if (route.method === 'POST') {
      router.post(routePath, handler);
    }
  }

  return router;
}

/**
 * Build an authenticated Hono router for AdminJS
 */
export function buildAuthenticatedRouter(
  admin: AdminJS,
  options: BuildRouterOptions & {
    authenticate: (email: string, password: string) => Promise<Record<string, unknown> | null>;
  }
): Hono {
  const router = new Hono();
  const {
    authenticate,
    cookieName = 'adminjs_session',
    cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: admin.options.rootPath,
      maxAge: 86400, // 24 hours
    },
  } = options;

  const rootPath = admin.options.rootPath;

  // Login page
  router.get(`${rootPath}/login`, async (c) => {
    const html = await admin.renderLogin({
      action: `${rootPath}/login`,
      errorMessage: c.req.query('error') || null,
    });
    return c.html(html);
  });

  // Login handler
  router.post(`${rootPath}/login`, async (c) => {
    try {
      const { fields } = await parseFormData(c.req.raw);
      const email = fields.email as string;
      const password = fields.password as string;

      const user = await authenticate(email, password);
      
      if (user) {
        // Create session
        const session = Buffer.from(JSON.stringify(user)).toString('base64');
        const cookieParts = [
          `${cookieName}=${session}`,
          `Path=${cookieOptions.path}`,
          cookieOptions.httpOnly ? 'HttpOnly' : '',
          cookieOptions.secure ? 'Secure' : '',
          `SameSite=${cookieOptions.sameSite}`,
          cookieOptions.maxAge ? `Max-Age=${cookieOptions.maxAge}` : '',
        ].filter(Boolean).join('; ');
        
        c.header('Set-Cookie', cookieParts);
        return c.redirect(admin.options.rootPath);
      }

      return c.redirect(`${admin.options.rootPath}/login?error=Invalid+credentials`);
    } catch (error) {
      logger.error('Login error', { error: error instanceof Error ? error.message : String(error) });
      return c.redirect(`${admin.options.rootPath}/login?error=Login+failed`);
    }
  });

  // Logout handler
  router.get(`${rootPath}/logout`, (c) => {
    c.header('Set-Cookie', `${cookieName}=; Path=${cookieOptions.path}; Max-Age=0`);
    return c.redirect(`${rootPath}/login`);
  });

  // Auth middleware for all other routes
  router.use('*', async (c, next) => {
    const reqPath = new URL(c.req.url).pathname;
    
    // Skip auth for login/logout routes
    if (reqPath === `${rootPath}/login` || reqPath === `${rootPath}/logout`) {
      return next();
    }

    const cookie = c.req.header('cookie') || '';
    const sessionMatch = cookie.match(new RegExp(`${cookieName}=([^;]+)`));
    
    if (!sessionMatch) {
      return c.redirect(`${rootPath}/login`);
    }

    try {
      const user = JSON.parse(Buffer.from(sessionMatch[1], 'base64').toString());
      if (user) {
        // Store user in context for later use
        (c as unknown as { set: (key: string, value: unknown) => void }).set('adminUser', user);
        return next();
      }
    } catch {
      // Invalid session
    }

    return c.redirect(`${rootPath}/login`);
  });

  // Mount the main AdminJS router
  // Note: buildRouter already registers routes with the full rootPath prefix
  const adminRouter = buildRouter(admin, options);
  router.route('/', adminRouter);

  return router;
}

export default {
  buildRouter,
  buildAuthenticatedRouter,
};

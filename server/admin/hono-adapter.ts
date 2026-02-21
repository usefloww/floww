/**
 * AdminJS Hono Adapter
 * 
 * A Hono adapter for AdminJS, similar to @adminjs/express but for Hono.
 * This adapter handles only AdminJS route/asset registration.
 * Authentication is handled externally before requests reach these routes.
 */

import AdminJS, { Router as AdminRouter } from 'adminjs';
import { Hono } from 'hono';
import path from 'node:path';
import fs from 'node:fs';
import { logger } from '~/server/utils/logger';

function convertToHonoRoute(adminPath: string): string {
  return adminPath.replace(/{(\w+)}/g, ':$1');
}

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
          const buffer = await value.arrayBuffer();
          files[key] = {
            name: value.name,
            type: value.type,
            size: value.size,
            path: '',
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
 * Build a Hono router for AdminJS.
 * Must be awaited — initializes the AdminJS frontend bundle before registering asset routes.
 */
export async function buildRouter(admin: AdminJS): Promise<Hono> {
  const rootPath = admin.options.rootPath;
  const router = new Hono();
  const { routes, assets } = AdminRouter;

  await admin.initialize();
  logger.info('AdminJS: bundle ready');

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

  for (const route of routes) {
    const routePath = route.path === '' ? rootPath : rootPath + convertToHonoRoute(route.path);
    
    const handler = async (c: any) => {
      try {
        const request = c.req.raw as Request;
        const url = new URL(request.url);
        
        const controller = new route.Controller({ admin }, null);
        
        const { fields, files } = route.method === 'POST' 
          ? await parseFormData(request)
          : { fields: {}, files: {} };
        
        const adminRequest = {
          params: c.req.param() || {},
          query: Object.fromEntries(url.searchParams),
          payload: { ...fields, ...files },
          method: request.method.toLowerCase(),
          headers: Object.fromEntries(request.headers),
          url: url.pathname + url.search,
          path: url.pathname,
        };

        const response = await controller[route.action](adminRequest, c.res);

        if (response === null || response === undefined) {
          return c.body(null);
        }

        if (typeof response === 'string') {
          if (route.contentType) {
            c.header('Content-Type', route.contentType);
          } else {
            c.header('Content-Type', 'text/html; charset=utf-8');
          }
          return c.body(response);
        }

        if (typeof response === 'object') {
          return c.json(response);
        }

        return c.body(response);
      } catch (error) {
        logger.error('AdminJS route error', { action: route.action, error: error instanceof Error ? error.message : String(error) });
        return c.text(`Admin error: ${error}`, 500);
      }
    };

    if (route.method === 'GET') {
      router.get(routePath, handler);
    } else if (route.method === 'POST') {
      router.post(routePath, handler);
    }
  }

  return router;
}

/**
 * Docker Registry Proxy Routes
 *
 * Proxies requests to Docker Registry V2 API.
 * Used for custom runtime images.
 *
 * GET /v2/ - Version check
 * GET /v2/:repository/manifests/:reference - Get manifest
 * HEAD /v2/:repository/manifests/:reference - Check manifest exists
 * GET /v2/:repository/blobs/:digest - Get blob
 * HEAD /v2/:repository/blobs/:digest - Check blob exists
 * GET /v2/:repository/tags/list - List tags
 * GET /v2/_catalog - List repositories
 */

import { get, json, errorResponse } from '~/server/api/router';
import { createRegistryProxy } from '~/server/packages/registry-proxy';
import { logger } from '~/server/utils/logger';

// Get proxy instance
const proxy = createRegistryProxy();

// Version check
get('/v2/', async ({ user }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  return json({ version: '2.0' });
});

// List repositories
get('/v2/_catalog', async ({ user }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  // Note: This would require additional implementation in the registry proxy
  return json({
    repositories: [],
  });
});

// List tags
get('/v2/:repository/tags/list', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const { repository } = params;

  try {
    const tagList = await proxy.listTags(repository);
    return json(tagList);
  } catch (error) {
    logger.error('Failed to list tags', { repository, error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Failed to list tags', 500);
  }
});

// Get manifest
get('/v2/:repository/manifests/:reference', async ({ user, params, request }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const { repository, reference } = params;

  // Check if this is a HEAD request simulation
  const method = request.method;

  try {
    const manifest = await proxy.getManifest(repository, reference);

    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': manifest.mediaType,
          'Docker-Content-Digest': manifest.digest,
        },
      });
    }

    return json(manifest);
  } catch (error) {
    logger.error('Failed to get manifest', { repository, reference, error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Manifest not found', 404);
  }
});

// Get blob
get('/v2/:repository/blobs/:digest', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const { repository, digest } = params;

  try {
    const blob = await proxy.proxyBlob(repository, digest);

    return new Response(blob.stream, {
      headers: {
        'Content-Type': blob.contentType,
        'Content-Length': blob.size.toString(),
        'Docker-Content-Digest': digest,
      },
    });
  } catch (error) {
    logger.error('Failed to get blob', { repository, digest, error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Blob not found', 404);
  }
});

// Check if image exists
get('/v2/:repository/check/:reference', async ({ user, params }) => {
  if (!user) return errorResponse('Unauthorized', 401);

  const { repository, reference } = params;

  try {
    const exists = await proxy.imageExists(repository, reference);
    return json({ exists });
  } catch (error) {
    logger.error('Failed to check image', { repository, reference, error: error instanceof Error ? error.message : String(error) });
    return json({ exists: false });
  }
});

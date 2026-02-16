/**
 * Secret Routes
 *
 * GET /api/secrets - List secrets (names only, no values)
 * POST /api/secrets - Create/update secret
 * DELETE /api/secrets/:name - Delete secret
 */

import { eq, and } from 'drizzle-orm';
import { get, post, del, json, errorResponse, parseBody } from '~/server/api/router';
import { getDb } from '~/server/db';
import { secrets, namespaces, organizationMembers } from '~/server/db/schema';
import { generateUlidUuid } from '~/server/utils/uuid';
import { encryptSecret } from '~/server/utils/encryption';
import { createSecretSchema } from '~/server/api/schemas';

// List secrets (names only)
get('/secrets', async (ctx) => {
  const { user, query } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const namespaceId = query.get('namespaceId');
  if (!namespaceId) {
    return errorResponse('namespaceId is required', 400);
  }

  const db = getDb();

  // Check access to namespace
  const [hasAccess] = await db
    .select({ id: namespaces.id })
    .from(namespaces)
    .innerJoin(
      organizationMembers,
      eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
    )
    .where(and(eq(namespaces.id, namespaceId), eq(organizationMembers.userId, user.id)))
    .limit(1);

  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const result = await db
    .select({
      id: secrets.id,
      name: secrets.name,
      provider: secrets.provider,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .where(eq(secrets.namespaceId, namespaceId));

  return json({
    results: result.map((s) => ({
      id: s.id,
      name: s.name,
      provider: s.provider,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
});

// Create or update secret
post('/secrets', async (ctx) => {
  const { user, request } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const parsed = await parseBody(request, createSecretSchema);
  if ('error' in parsed) return parsed.error;

  const { namespaceId, name, value, provider } = parsed.data;

  const db = getDb();

  // Check access to namespace
  const [hasAccess] = await db
    .select({ id: namespaces.id })
    .from(namespaces)
    .innerJoin(
      organizationMembers,
      eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
    )
    .where(and(eq(namespaces.id, namespaceId), eq(organizationMembers.userId, user.id)))
    .limit(1);

  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  const encryptedValue = encryptSecret(value);

  // Try to update existing secret
  const [existing] = await db
    .select()
    .from(secrets)
    .where(and(eq(secrets.namespaceId, namespaceId), eq(secrets.name, name)))
    .limit(1);

  if (existing) {
    await db
      .update(secrets)
      .set({
        encryptedValue,
        provider: provider ?? existing.provider,
        updatedAt: new Date(),
      })
      .where(eq(secrets.id, existing.id));

    return json({
      id: existing.id,
      name: existing.name,
      provider: provider ?? existing.provider,
      updated: true,
    });
  }

  // Create new secret
  const [secret] = await db
    .insert(secrets)
    .values({
      id: generateUlidUuid(),
      namespaceId,
      name,
      provider: provider ?? 'custom',
      encryptedValue,
    })
    .returning();

  return json({
    id: secret.id,
    name: secret.name,
    provider: secret.provider,
    updated: false,
  }, 201);
});

// Delete secret
del('/secrets/:secretId', async (ctx) => {
  const { user, params } = ctx;
  if (!user) return errorResponse('Unauthorized', 401);

  const db = getDb();

  // Get secret and verify access
  const [secret] = await db
    .select()
    .from(secrets)
    .where(eq(secrets.id, params.secretId))
    .limit(1);

  if (!secret) {
    return errorResponse('Secret not found', 404);
  }

  // Check access
  const [hasAccess] = await db
    .select({ id: namespaces.id })
    .from(namespaces)
    .innerJoin(
      organizationMembers,
      eq(namespaces.organizationOwnerId, organizationMembers.organizationId)
    )
    .where(
      and(eq(namespaces.id, secret.namespaceId), eq(organizationMembers.userId, user.id))
    )
    .limit(1);

  if (!hasAccess && !user.isAdmin) {
    return errorResponse('Access denied', 403);
  }

  await db.delete(secrets).where(eq(secrets.id, params.secretId));

  return json({ success: true });
});

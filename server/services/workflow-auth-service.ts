/**
 * Workflow Auth Service
 *
 * Generates and validates JWT tokens for workflow authentication.
 * These tokens are short-lived and passed to workflow invocations, allowing
 * workflows to authenticate back to the backend for operations like KV-store access.
 */

import * as jose from 'jose';
import { settings } from '~/server/settings';

// Settings from environment
const WORKFLOW_JWT_SECRET = settings.auth.WORKFLOW_JWT_SECRET ?? 'dev-secret-change-in-production';
const WORKFLOW_JWT_ALGORITHM = 'HS256';
const WORKFLOW_JWT_EXPIRATION_SECONDS = 300;

// Encode secret for jose
const secretKey = new TextEncoder().encode(WORKFLOW_JWT_SECRET);

export interface WorkflowTokenClaims {
  sub: string;
  workflowId: string;
  namespaceId: string;
  invocationId: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
}

/**
 * Generate a short-lived JWT token for a workflow invocation
 *
 * Token claims:
 * - sub: "workflow:<workflow_id>"
 * - workflow_id: UUID of the workflow
 * - namespace_id: UUID of the namespace
 * - invocation_id: Unique identifier for this invocation
 * - iat: Issued at timestamp
 * - exp: Expiration timestamp
 * - aud: Audience ("floww-workflow")
 * - iss: Issuer ("floww-backend")
 */
export async function generateInvocationToken(
  workflowId: string,
  namespaceId: string,
  invocationId?: string
): Promise<string> {
  const actualInvocationId = invocationId ?? crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const token = await new jose.SignJWT({
    workflow_id: workflowId,
    namespace_id: namespaceId,
    invocation_id: actualInvocationId,
  })
    .setProtectedHeader({ alg: WORKFLOW_JWT_ALGORITHM })
    .setSubject(`workflow:${workflowId}`)
    .setIssuedAt(now)
    .setExpirationTime(now + WORKFLOW_JWT_EXPIRATION_SECONDS)
    .setAudience('floww-workflow')
    .setIssuer('floww-backend')
    .sign(secretKey);

  return token;
}

/**
 * Validate a workflow JWT token and return its claims
 *
 * Throws:
 * - JWTExpired: Token has expired
 * - JWTClaimValidationFailed: Token validation failed
 * - JWTInvalid: Token is invalid
 */
export async function validateToken(token: string): Promise<WorkflowTokenClaims> {
  const { payload } = await jose.jwtVerify(token, secretKey, {
    audience: 'floww-workflow',
    issuer: 'floww-backend',
  });

  return {
    sub: payload.sub ?? '',
    workflowId: (payload.workflow_id as string) ?? '',
    namespaceId: (payload.namespace_id as string) ?? '',
    invocationId: (payload.invocation_id as string) ?? '',
    iat: payload.iat ?? 0,
    exp: payload.exp ?? 0,
    aud: Array.isArray(payload.aud) ? payload.aud[0] : (payload.aud ?? ''),
    iss: payload.iss ?? '',
  };
}

/**
 * Verify a workflow invocation token and return the workflow ID
 *
 * Throws on invalid/expired token
 */
export async function verifyInvocationToken(token: string): Promise<string> {
  const claims = await validateToken(token);
  return claims.workflowId;
}

/**
 * Extract the namespace ID from a verified token
 */
export async function getNamespaceFromToken(token: string): Promise<string> {
  const claims = await validateToken(token);
  return claims.namespaceId;
}

/**
 * Check if a token is still valid (not expired)
 * Returns true if valid, false otherwise (does not throw)
 */
export async function isTokenValid(token: string): Promise<boolean> {
  try {
    await validateToken(token);
    return true;
  } catch {
    return false;
  }
}

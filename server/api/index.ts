/**
 * API Router
 *
 * Central router for all API endpoints.
 * All routes are prefixed with /api
 */

// Re-export everything from router
export {
  get,
  post,
  put,
  patch,
  del,
  json,
  errorResponse,
  handleApiRequest,
  type ApiContext,
  type RouteHandler,
} from './router';

// Import and register routes
// These must be imported AFTER the re-exports above to avoid circular dependency issues
import './routes/health';
import './routes/config';
import './routes/whoami';
import './routes/organizations';
import './routes/workflows';
import './routes/executions';
import './routes/providers';
import './routes/triggers';
import './routes/runtimes';
import './routes/secrets';
import './routes/subscriptions';
import './routes/namespaces';
// Note: webhooks are handled directly in src/server.ts at /webhook/:path (not under /api/)
import './routes/device-auth';
import './routes/admin-auth';
import './routes/oauth';
import './routes/kv-store';
import './routes/centrifugo';
import './routes/provider-types';
import './routes/dev';
import './routes/docker-proxy';
import './routes/workflow-deployments';

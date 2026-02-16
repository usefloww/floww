import { createServerFn } from '@tanstack/react-start';
import { requireUser } from './utils';

export interface MessagePart {
  type: string;
  text?: string;
  data?: {
    message?: string;
    question?: string;
    options?: Array<{ id: string; label: string; description?: string }>;
    provider_type?: string;
    provider?: string;
    configured?: boolean;
    setupUrl?: string;
    code?: string;
    explanation?: string;
    allow_multiple?: boolean;
    allowMultiple?: boolean;
    secret_name?: string;
    secretName?: string;
    secretType?: string;
    summary?: string;
    trigger?: { type: string; source: string; details: string };
    actions?: Array<{ provider: string; description: string }>;
    requiredProviders?: string[];
    requiredSecrets?: string[];
  };
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface BuilderChatRequest {
  workflowId: string;
  messages: ChatMessage[];
  userMessage: string;
  currentCode: string;
  namespaceId?: string;
  currentPlan?: {
    summary: string;
    trigger: { type: string; source: string; details: string };
    actions: Array<{ provider: string; description: string }>;
    requiredProviders: string[];
    requiredSecrets: string[];
  };
}

export interface BuilderChatResponse {
  message: {
    role: string;
    parts: MessagePart[];
  };
  code?: string;
  plan?: {
    summary: string;
    trigger: { type: string; source: string; details: string };
    actions: Array<{ provider: string; description: string }>;
    requiredProviders: string[];
    requiredSecrets: string[];
  };
}

/**
 * Send a chat message for AI-assisted workflow building
 */
export const builderChat = createServerFn({ method: 'POST' })
  .inputValidator((input: BuilderChatRequest) => input)
  .handler(async ({ data }): Promise<BuilderChatResponse> => {
    const { settings } = await import('~/server/settings');
    if (!settings.general.ENABLE_AI_BUILDER) {
      return {
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: 'AI Builder is disabled.',
            },
          ],
        },
      };
    }

    const user = await requireUser();
    const { hasWorkflowAccess } = await import('~/server/services/access-service');
    const { getWorkflow } = await import('~/server/services/workflow-service');
    const { processMessage } = await import('~/server/packages/ai-generator/agentic');
    const { listProviders } = await import('~/server/services/provider-service');
    const { getDb } = await import('~/server/db');
    const { secrets: secretsTable } = await import('~/server/db/schema');
    const { eq } = await import('drizzle-orm');

    // Check access
    const hasAccess = await hasWorkflowAccess(user.id, data.workflowId);
    if (!hasAccess && !user.isAdmin) {
      throw new Error('Access denied');
    }

    // Get workflow to verify it exists and get namespace
    const workflow = await getWorkflow(data.workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    try {
      // Validate user message
      if (!data.userMessage || data.userMessage.trim() === '') {
        throw new Error('User message cannot be empty');
      }

      // Get configured providers for this namespace
      const namespaceId = data.namespaceId || workflow.namespaceId;
      let configuredProviders: Array<{ name: string; type: string; configured: boolean }> = [];

      try {
        const providers = await listProviders(user.id, { namespaceId });
        configuredProviders = providers.map((p: { type: string }) => ({
          name: p.type,
          type: p.type,
          configured: true,
        }));
      } catch {
        configuredProviders = [];
      }

      // Get configured secrets for this namespace (names only)
      let configuredSecrets: Array<{ name: string }> = [];

      try {
        const db = getDb();
        const secretRows = await db
          .select({ name: secretsTable.name })
          .from(secretsTable)
          .where(eq(secretsTable.namespaceId, namespaceId));
        configuredSecrets = secretRows;
      } catch {
        configuredSecrets = [];
      }

      // Convert messages to conversation format with validation
      const conversationHistory = data.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.content && m.content.trim() !== '')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // Build agent context
      const agentContext = {
        namespaceId,
        workflowId: data.workflowId,
        configuredProviders,
        configuredSecrets,
        currentCode: data.currentCode || undefined,
        currentPlan: data.currentPlan,
      };

      // Process the message through the agentic workflow builder
      const result = await processMessage(data.userMessage, conversationHistory, agentContext);

      // Convert agent response to expected format
      const parts: MessagePart[] = result.parts.map((part) => ({
        type: part.type,
        text: part.text,
        data: part.data as MessagePart['data'],
      }));

      // Add a fallback text part if no parts were added
      if (parts.length === 0) {
        parts.push({ type: 'text', text: 'I processed your request.' });
      }

      return {
        message: {
          role: 'assistant',
          parts,
        },
        code: result.code,
        plan: result.plan,
      };
    } catch (error) {
      console.error('Builder chat error:', error);

      // Don't expose internal error details - provide user-friendly message
      const isApiError = error instanceof Error && (
        error.message.includes('API') ||
        error.message.includes('OPENROUTER') ||
        error.message.includes('network') ||
        error.message.includes('fetch')
      );

      const userMessage = isApiError
        ? 'Unable to connect to the AI service. Please check your configuration and try again.'
        : 'An error occurred while processing your request. Please try again.';

      return {
        message: {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: userMessage,
            },
          ],
        },
      };
    }
  });

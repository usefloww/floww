/**
 * AI Generator Package
 *
 * Provides AI-assisted workflow generation using OpenRouter.
 */

import { settings } from '~/server/settings';

export interface GenerationRequest {
  prompt: string;
  existingCode?: string;
  context?: {
    providers?: string[];
    triggers?: string[];
    secrets?: string[];
  };
  options?: GenerationOptions;
}

export interface GenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface GenerationResult {
  code: string;
  explanation?: string;
  suggestedName?: string;
  suggestedProviders?: string[];
  suggestedSecrets?: string[];
  confidence: number;
}

export interface StreamingChunk {
  type: 'code' | 'explanation' | 'metadata';
  content: string;
  done: boolean;
}

/**
 * System prompt for workflow generation
 */
const SYSTEM_PROMPT = `You are an expert TypeScript developer specializing in automation workflows.
Your task is to generate workflow code using the Floww SDK.

Key patterns to follow:
1. Import from 'floww' for workflow primitives
2. Use async/await for all async operations
3. Handle errors gracefully with try/catch
4. Add JSDoc comments for complex logic
5. Use TypeScript types for parameters

Available trigger types:
- webhook: HTTP webhook triggers
- cron: Scheduled triggers
- manual: User-initiated triggers

Available provider integrations:
- slack: Slack messaging
- google: Google services (Sheets, Drive, Calendar)
- github: GitHub API
- stripe: Stripe payments
- custom: Custom HTTP integrations

Example workflow structure:
\`\`\`typescript
import { defineWorkflow, trigger, action } from 'floww';

export default defineWorkflow({
  name: 'My Workflow',
  triggers: [
    trigger.webhook({ path: '/my-hook' }),
  ],
  run: async (ctx) => {
    // Workflow logic here
    return { success: true };
  },
});
\`\`\`

Generate clean, production-ready code based on the user's request.`;

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Get the model name for OpenRouter API (strip openrouter/ prefix if present)
 */
function getModelName(model?: string): string {
  const modelName = model || settings.ai.AI_MODEL_CODEGEN;
  return modelName.replace(/^openrouter\//, '');
}

/**
 * Build the user prompt with context
 */
function buildUserPrompt(request: GenerationRequest): string {
  let prompt = request.prompt;

  if (request.existingCode) {
    prompt += `\n\nExisting code to modify:\n\`\`\`typescript\n${request.existingCode}\n\`\`\``;
  }

  if (request.context) {
    if (request.context.providers?.length) {
      prompt += `\n\nAvailable providers: ${request.context.providers.join(', ')}`;
    }
    if (request.context.triggers?.length) {
      prompt += `\nExisting triggers: ${request.context.triggers.join(', ')}`;
    }
    if (request.context.secrets?.length) {
      prompt += `\nAvailable secrets: ${request.context.secrets.join(', ')}`;
    }
  }

  return prompt;
}

/**
 * Parse the AI response to extract code and metadata
 */
function parseResponse(content: string): GenerationResult {
  // Extract code blocks
  const codeMatch = content.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : content.trim();

  // Extract explanation (text before/after code block)
  const explanation = content.replace(/```[\s\S]*?```/g, '').trim();

  // Try to extract workflow name from code
  const nameMatch = code.match(/name:\s*['"`]([^'"`]+)['"`]/);
  const suggestedName = nameMatch ? nameMatch[1] : undefined;

  // Extract provider references
  const providers: string[] = [];
  if (code.includes('slack')) providers.push('slack');
  if (code.includes('google')) providers.push('google');
  if (code.includes('github')) providers.push('github');
  if (code.includes('stripe')) providers.push('stripe');

  return {
    code,
    explanation: explanation || undefined,
    suggestedName,
    suggestedProviders: providers.length > 0 ? providers : undefined,
    confidence: 0.85,
  };
}

/**
 * Generate workflow code using OpenRouter
 */
export async function generateWorkflow(request: GenerationRequest): Promise<GenerationResult> {
  const apiKey = settings.ai.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const userPrompt = buildUserPrompt(request);

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': settings.general.PUBLIC_API_URL || 'https://floww.dev',
      'X-Title': 'Floww Workflow Builder',
    },
    body: JSON.stringify({
      model: getModelName(request.options?.model),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: request.options?.temperature ?? 0.1,
      max_tokens: request.options?.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  return parseResponse(content);
}

/**
 * Generate workflow code with streaming using OpenRouter
 */
export async function* generateWorkflowStream(
  request: GenerationRequest
): AsyncGenerator<StreamingChunk, void, unknown> {
  const apiKey = settings.ai.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const userPrompt = buildUserPrompt(request);

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': settings.general.PUBLIC_API_URL || 'https://floww.dev',
      'X-Title': 'Floww Workflow Builder',
    },
    body: JSON.stringify({
      model: getModelName(request.options?.model),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: request.options?.temperature ?? 0.1,
      max_tokens: request.options?.maxTokens ?? 2000,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      yield { type: 'code', content: '', done: true };
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const json = JSON.parse(line.slice(6));
          const content = json.choices[0]?.delta?.content ?? '';
          if (content) {
            yield { type: 'code', content, done: false };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
}

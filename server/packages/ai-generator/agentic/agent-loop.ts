/**
 * Agent Loop Implementation
 *
 * Implements the agentic workflow builder using Vercel AI SDK.
 */

import { generateText, stepCountIs, type ModelMessage } from 'ai';
import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider';
import { settings } from '~/server/settings';
import type { AgentContext, AgentResponse, ConversationMessage, MessagePart, Plan, SecretSetupData, ToolResult } from './context';
import { buildSystemPrompt, buildCodeGenerationPrompt, isPlanApproval } from './system-prompt';
import {
  createAskQuestionTool,
  createCheckProvidersTool,
  createCheckSecretsTool,
  createSubmitPlanTool,
  createGenerateCodeTool,
  createUpdateCodeTool,
} from './tools';

const MAX_ITERATIONS = 10;

/**
 * Create the OpenRouter provider instance
 */
function createOpenRouterProvider() {
  const apiKey = settings.ai.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured. Please set the OPENROUTER_API_KEY environment variable.');
  }

  return createOpenRouter({
    apiKey,
    headers: {
      'HTTP-Referer': settings.general.PUBLIC_API_URL || 'https://floww.dev',
      'X-Title': 'Floww Workflow Builder',
    },
  });
}

/**
 * Get the model name (remove any prefix)
 */
function getModelName(): string {
  const modelName = settings.ai.AI_MODEL_CODEGEN;
  if (!modelName) {
    throw new Error('AI_MODEL_CODEGEN is not configured. Please set the AI_MODEL_CODEGEN environment variable.');
  }
  // Remove any openrouter/ or anthropic/ prefix
  return modelName.replace(/^(openrouter|anthropic)\//, '');
}

/**
 * Convert conversation messages to AI SDK format
 */
function convertToAIMessages(messages: ConversationMessage[]): ModelMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Check which secrets from a plan are not yet configured
 */
function getUnconfiguredSecrets(plan: Plan, context: AgentContext): string[] {
  if (!plan.requiredSecrets || plan.requiredSecrets.length === 0) return [];
  const configuredNames = new Set(context.configuredSecrets.map((s) => s.name));
  return plan.requiredSecrets.filter((name) => !configuredNames.has(name));
}

/**
 * Build a terminal response prompting the user to configure missing secrets
 */
function buildSecretSetupResponse(missingSecrets: string[]): AgentResponse {
  const parts: MessagePart[] = [
    {
      type: 'text',
      text: `Before generating code, the following secrets need to be configured: ${missingSecrets.join(', ')}. Please set them up and then continue.`,
    },
  ];

  for (const name of missingSecrets) {
    const setupData: SecretSetupData = {
      secretName: name,
      secretType: 'custom',
      configured: false,
      message: `Secret "${name}" needs to be configured before we can proceed.`,
    };
    parts.push({
      type: 'data-secret-setup',
      data: setupData,
    });
  }

  return {
    parts,
    isTerminal: true,
    terminalReason: 'text',
  };
}

/**
 * Process a user message through the agent loop
 */
export async function processMessage(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  context: AgentContext
): Promise<AgentResponse> {
  // Validate inputs
  if (!userMessage || userMessage.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  // Validate conversation history
  for (const msg of conversationHistory) {
    if (!msg.content || msg.content.trim() === '') {
      throw new Error('Conversation history contains empty messages');
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      throw new Error(`Invalid message role: ${msg.role}`);
    }
  }

  const openrouter = createOpenRouterProvider();
  const modelName = getModelName();

  // Check for plan approval shortcut
  if (context.currentPlan && isPlanApproval(userMessage)) {
    // Before generating code, check if required secrets are configured
    const unconfiguredSecrets = getUnconfiguredSecrets(context.currentPlan, context);
    if (unconfiguredSecrets.length > 0) {
      return buildSecretSetupResponse(unconfiguredSecrets);
    }

    return await generateCodeFromPlan(context.currentPlan, context, openrouter, modelName);
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(context);

  // Create context-aware tools
  const tools = {
    ask_clarifying_question: createAskQuestionTool(),
    check_providers: createCheckProvidersTool(context),
    check_secrets: createCheckSecretsTool(context),
    submit_plan: createSubmitPlanTool(context),
    generate_workflow_code: createGenerateCodeTool(),
    update_workflow_code: createUpdateCodeTool(context),
  };

  // Convert conversation history to AI SDK format with validation
  const convertedMessages = convertToAIMessages(conversationHistory);

  // Validate all messages before sending
  for (let i = 0; i < convertedMessages.length; i++) {
    const msg = convertedMessages[i];
    if (!msg.content || typeof msg.content !== 'string') {
      console.error(`Invalid message at index ${i}:`, msg);
      throw new Error(`Conversation history contains invalid message at position ${i + 1}`);
    }
  }

  const messages: ModelMessage[] = [
    ...convertedMessages,
    { role: 'user', content: userMessage },
  ];

  // Debug: log what we're sending to the AI
  console.log('[Agent Loop] Sending to AI:', {
    modelName,
    messageCount: messages.length,
    messages: messages.map((m, i) => ({
      index: i,
      role: m.role,
      contentType: typeof m.content,
      contentLength: typeof m.content === 'string' ? m.content.length : 'N/A',
      contentPreview: typeof m.content === 'string' ? m.content.substring(0, 100) : m.content,
    })),
  });

  // Track terminal state and collected parts
  let isTerminal = false;
  let shouldStop = false;
  let terminalReason: AgentResponse['terminalReason'];
  const collectedParts: MessagePart[] = [];
  let generatedCode: string | undefined;
  let generatedPlan: Plan | undefined;

  try {
    const result = await generateText({
      model: openrouter(modelName),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: (result) => shouldStop || stepCountIs(MAX_ITERATIONS)(result),
      onStepFinish: ({ toolCalls, toolResults }) => {
        if (toolResults && toolResults.length > 0) {
          for (let i = 0; i < toolResults.length; i++) {
            const toolResult = toolResults[i];
            const output = toolResult.output as ToolResult | undefined;
            if (output) {
              collectedParts.push(...output.parts);

              if (output.code) {
                generatedCode = output.code;
              }
              if (output.plan) {
                generatedPlan = output.plan;
              }

              if (output.isTerminal) {
                isTerminal = true;
                shouldStop = true;

                if (toolCalls && i < toolCalls.length) {
                  const toolName = toolCalls[i].toolName;
                  if (toolName === 'ask_clarifying_question') {
                    terminalReason = 'question';
                  } else if (toolName === 'submit_plan') {
                    terminalReason = 'plan';
                  } else if (toolName === 'generate_workflow_code') {
                    terminalReason = 'code';
                  } else if (toolName === 'update_workflow_code') {
                    terminalReason = 'update';
                  }
                }
              }
            }
          }
        }
      },
    });

    // If no tool was called, add the text response
    if (collectedParts.length === 0 && result.text) {
      collectedParts.push({
        type: 'text',
        text: result.text,
      });
      isTerminal = true;
      terminalReason = 'text';
    }

    return {
      parts: collectedParts,
      code: generatedCode,
      plan: generatedPlan,
      isTerminal,
      terminalReason,
    };
  } catch (error) {
    console.error('Agent loop error:', error);

    // Don't expose internal error details to users
    const userMessage =
      error instanceof Error && error.message.includes('API')
        ? 'I encountered an error connecting to the AI service. Please try again later.'
        : 'I encountered an error while processing your request. Please try again.';

    return {
      parts: [
        {
          type: 'text',
          text: userMessage,
        },
      ],
      isTerminal: true,
      terminalReason: 'text',
    };
  }
}

/**
 * Generate code directly from an approved plan (shortcut path)
 */
async function generateCodeFromPlan(
  plan: Plan,
  context: AgentContext,
  openrouter: OpenRouterProvider,
  modelName: string
): Promise<AgentResponse> {
  const systemPrompt = buildSystemPrompt(context);
  const codeGenPrompt = buildCodeGenerationPrompt(plan, context);

  const tools = {
    generate_workflow_code: createGenerateCodeTool(),
    update_workflow_code: createUpdateCodeTool(context),
  };

  const collectedParts: MessagePart[] = [];
  let generatedCode: string | undefined;
  let shouldStop = false;

  try {
    await generateText({
      model: openrouter(modelName),
      system: systemPrompt,
      messages: [{ role: 'user', content: codeGenPrompt }],
      tools,
      stopWhen: (result) => shouldStop || stepCountIs(6)(result),
      onStepFinish: ({ toolResults }) => {
        if (toolResults && toolResults.length > 0) {
          for (const toolResult of toolResults) {
            const output = toolResult.output as ToolResult | undefined;
            if (output) {
              collectedParts.push(...output.parts);
              if (output.code) {
                generatedCode = output.code;
              }
              if (output.isTerminal) {
                shouldStop = true;
              }
            }
          }
        }
      },
    });

    // Ensure we have meaningful output
    if (collectedParts.length === 0) {
      collectedParts.push({
        type: 'text',
        text: generatedCode
          ? 'I generated the workflow code based on the approved plan.'
          : 'Code generation did not produce any output. Please try again.',
      });
    }

    return {
      parts: collectedParts,
      code: generatedCode,
      isTerminal: true,
      terminalReason: 'code',
    };
  } catch (error) {
    console.error('Code generation error:', error);

    // Don't expose internal error details to users
    const userMessage =
      error instanceof Error && error.message.includes('API')
        ? 'I encountered an error connecting to the AI service. Please try again later.'
        : 'I encountered an error while generating code. Please try again.';

    return {
      parts: [
        {
          type: 'text',
          text: userMessage,
        },
      ],
      isTerminal: true,
      terminalReason: 'text',
    };
  }
}

/**
 * Agentic Workflow Builder
 *
 * Main entry point for the agentic workflow builder.
 * Provides a tool-calling based AI assistant for building Floww workflows.
 */

// Export types
export type {
  AgentContext,
  AgentResponse,
  ConversationMessage,
  MessagePart,
  MessagePartType,
  Plan,
  PlanAction,
  PlanTrigger,
  QuestionData,
  QuestionOption,
  ProviderSetupData,
  SecretSetupData,
  CodeData,
  ConfiguredProvider,
  ToolResult,
} from './context';

// Export the main function
export { processMessage } from './agent-loop';

// Export utilities
export { isPlanApproval } from './system-prompt';
export { AVAILABLE_PROVIDERS } from './context';

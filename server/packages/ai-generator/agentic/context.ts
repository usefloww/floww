/**
 * Agent Context and Types
 *
 * Defines the context and message types for the agentic workflow builder.
 */

// ============================================================================
// Message Part Types (matching Python's MessagePart)
// ============================================================================

export type MessagePartType =
  | 'text'
  | 'data-question'
  | 'data-plan-confirmation'
  | 'data-code'
  | 'data-provider-setup'
  | 'data-secret-setup';

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface QuestionData {
  question: string;
  options: QuestionOption[];
  allowMultiple?: boolean;
}

export interface PlanTrigger {
  type: string;
  source: string;
  details: string;
}

export interface PlanAction {
  provider: string;
  description: string;
}

export interface Plan {
  summary: string;
  trigger: PlanTrigger;
  actions: PlanAction[];
  requiredProviders: string[];
  requiredSecrets: string[];
}

export interface ProviderSetupData {
  provider: string;
  configured: boolean;
  setupUrl?: string;
}

export interface SecretSetupData {
  secretName: string;
  secretType: string;
  description?: string;
  configured: boolean;
  message?: string;
}

export interface CodeData {
  code: string;
  explanation?: string;
}

export interface MessagePart {
  type: MessagePartType;
  text?: string;
  data?: QuestionData | Plan | ProviderSetupData | SecretSetupData | CodeData | Record<string, unknown>;
}

// ============================================================================
// Agent Context
// ============================================================================

export interface ConfiguredProvider {
  name: string;
  type: string;
  configured: boolean;
}

export interface ConfiguredSecret {
  name: string;
}

export interface AgentContext {
  namespaceId: string;
  workflowId?: string;
  configuredProviders: ConfiguredProvider[];
  configuredSecrets: ConfiguredSecret[];
  currentCode?: string;
  currentPlan?: Plan;
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// Agent Response
// ============================================================================

export interface AgentResponse {
  parts: MessagePart[];
  code?: string;
  plan?: Plan;
  isTerminal: boolean;
  terminalReason?: 'question' | 'plan' | 'code' | 'update' | 'text';
}

// ============================================================================
// Tool Result Types
// ============================================================================

export interface ToolResult {
  isTerminal: boolean;
  parts: MessagePart[];
  code?: string;
  plan?: Plan;
}

// ============================================================================
// Available Providers (static list matching floww-sdk)
// ============================================================================

export const AVAILABLE_PROVIDERS = [
  { name: 'builtin', displayName: 'Builtin', capabilities: ['triggers (webhook, cron, manual)'] },
  { name: 'github', displayName: 'GitHub', capabilities: ['triggers', 'actions'] },
  { name: 'slack', displayName: 'Slack', capabilities: ['triggers', 'actions'] },
  { name: 'discord', displayName: 'Discord', capabilities: ['triggers', 'actions'] },
  { name: 'jira', displayName: 'Jira', capabilities: ['triggers', 'actions'] },
  { name: 'gitlab', displayName: 'GitLab', capabilities: ['triggers'] },
  { name: 'todoist', displayName: 'Todoist', capabilities: ['actions'] },
  { name: 'kvstore', displayName: 'KV Store', capabilities: ['key-value storage'] },
  { name: 'openai', displayName: 'OpenAI', capabilities: ['AI models'] },
  { name: 'anthropic', displayName: 'Anthropic', capabilities: ['AI models'] },
  { name: 'googleai', displayName: 'Google AI', capabilities: ['AI models'] },
] as const;

export type AvailableProviderName = (typeof AVAILABLE_PROVIDERS)[number]['name'];

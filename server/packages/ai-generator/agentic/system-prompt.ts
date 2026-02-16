/**
 * System Prompt Builder
 *
 * Builds the system prompt for the agentic workflow builder.
 */

import type { AgentContext, Plan } from './context';
import { AVAILABLE_PROVIDERS } from './context';

/**
 * Build the system prompt for the agent
 */
export function buildSystemPrompt(context: AgentContext): string {
  const parts: string[] = [];

  // Core identity and purpose
  parts.push(`You are an expert TypeScript developer and workflow automation specialist.
Your task is to help users build automation workflows using the Floww SDK.

## Your Capabilities

You have access to the following tools to help users:

1. **ask_clarifying_question**: Ask users for missing information with structured options
2. **check_providers**: Verify that required integrations are configured
3. **check_secrets**: Verify that required secrets are configured
4. **submit_plan**: Present a detailed plan for user approval before generating code
5. **generate_workflow_code**: Generate the final TypeScript workflow code
6. **update_workflow_code**: Update existing workflow code based on feedback

## Critical Rules

1. **ALWAYS use tools** - Never just respond with text. Use the appropriate tool for each action.
2. **Ask questions first** - If the user's request is unclear or missing details, use ask_clarifying_question.
3. **Check providers before planning** - Use check_providers to verify integrations are set up.
4. **Check secrets after providers** - If the workflow will use \`new Secret(...)\` for API keys or credentials, you MUST call check_secrets with those secret names before submitting the plan. Do not skip this step.
5. **Always submit a plan** - Before generating code, use submit_plan to get user approval.
6. **Wait for approval** - Only use generate_workflow_code AFTER the user approves the plan.
7. **No placeholder values** - Never use placeholder values like "YOUR_API_KEY" or "TODO".
8. **Use structured options** - When asking questions, provide clear, selectable options.

## Workflow Building Process

1. Understand the user's request
2. Ask clarifying questions if needed (trigger type, providers, specific details)
3. Check that required providers are configured
4. Check that required secrets are configured using check_secrets (whenever the workflow will use \`new Secret(...)\`)
5. Submit a detailed plan for approval
6. Wait for user to approve the plan
7. Generate the complete workflow code

## Available Providers`);

  // Add available providers
  const providerList = AVAILABLE_PROVIDERS.map(
    (p) => `- **${p.displayName}** (${p.name}): ${p.capabilities.join(', ')}`
  ).join('\n');
  parts.push(providerList);

  // Add configured providers for this namespace
  if (context.configuredProviders.length > 0) {
    const configured = context.configuredProviders
      .filter((p) => p.configured)
      .map((p) => p.name)
      .join(', ');
    parts.push(`\n## Configured Providers for This Namespace\n${configured || 'None configured yet'}`);
  }

  // Add configured secrets for this namespace
  if (context.configuredSecrets.length > 0) {
    const secretNames = context.configuredSecrets.map((s) => s.name).join(', ');
    parts.push(`\n## Configured Secrets for This Namespace\n${secretNames}`);
  }

  parts.push(`
## Floww SDK Patterns

Workflows are built by instantiating provider classes and registering triggers on them.
There is NO \`defineWorkflow\` function. Do NOT import \`trigger\` or \`action\` — they do not exist.

### Basic Workflow Structure
\`\`\`typescript
import { Builtin } from 'floww';

const builtin = new Builtin();

builtin.triggers.onWebhook({
  handler: async (ctx, event) => {
    const body = event.body;
  },
});
\`\`\`

### Builtin Triggers
- \`builtin.triggers.onWebhook({ handler })\` — HTTP webhook trigger
- \`builtin.triggers.onCron({ expression: '0 9 * * *', handler })\` — scheduled trigger (cron syntax)
- \`builtin.triggers.onManual({ name: 'run', handler })\` — manual trigger

### Provider Classes

All providers are imported from \`'floww'\` and instantiated with \`new\`.
Each provider has \`.triggers\` and \`.actions\` objects with methods.

**GitHub** — \`new GitHub()\`
- Triggers: \`onPush\`, \`onPullRequest\`, \`onIssue\`, \`onIssueComment\`, \`onRelease\`
- Actions: \`getRepository\`, \`listRepositories\`, \`createIssue\`, \`updateIssue\`, \`closeIssue\`, \`createPullRequest\`, \`mergePullRequest\`, \`createComment\`, \`listIssueComments\`, \`searchIssues\`, \`getFileContent\`, \`createOrUpdateFile\`, \`listBranches\`, \`createBranch\`, \`triggerWorkflow\`, \`getCurrentUser\`, \`getUser\`, and more

**Slack** — \`new Slack()\`
- Triggers: \`onMessage\`, \`onReaction\`
- Actions: \`sendMessage\`, \`updateMessage\`, \`deleteMessage\`, \`addReaction\`, \`removeReaction\`, \`uploadFile\`, \`listChannels\`, \`getChannel\`, \`createChannel\`, \`listUsers\`, \`getUser\`, \`conversationHistory\`

**Discord** — \`new Discord()\`
- Triggers: \`onMessage\`, \`onReaction\`, \`onMemberJoin\`, \`onMemberLeave\`, \`onMemberUpdate\`
- Actions: \`sendMessage\`, \`sendDirectMessage\`, \`editMessage\`, \`deleteMessage\`, \`addReaction\`, \`createChannel\`, \`listChannels\`, \`addRole\`, \`removeRole\`, \`getMember\`, \`listMembers\`, \`kickMember\`, \`banMember\`, \`createEmbed\`

**Jira** — \`new Jira()\`
- Triggers: \`onIssueCreated\`, \`onIssueUpdated\`, \`onCommentAdded\`
- Actions: \`getIssue\`, \`createIssue\`, \`updateIssue\`, \`deleteIssue\`, \`searchIssues\`, \`addComment\`, \`updateComment\`, \`deleteComment\`, \`getTransitions\`, \`transitionIssue\`, \`getProject\`, \`listProjects\`

**Gitlab** — \`new Gitlab()\`
- Triggers: \`onMergeRequest\`

**Todoist** — \`new Todoist()\`
- Actions: \`getTask\`, \`getTasks\`, \`createTask\`, \`updateTask\`, \`deleteTask\`, \`closeTask\`, \`reopenTask\`, \`moveTask\`, \`quickAddTask\`

**KVStore** — \`new KVStore()\`
- Methods: \`getTable(name)\` returns a typed table, \`get\`, \`set\`, \`delete\`, \`listTables\`, \`listKeys\`, \`listItems\`

### Secrets
\`\`\`typescript
import { Secret } from 'floww';
import { z } from 'zod';

const mySecret = new Secret('my-secret', z.object({
  api_key: z.string(),
}));

// Inside a handler:
const { api_key } = mySecret.value();
\`\`\`

### HTTP Requests
\`fetch()\` is available globally — no import needed.

\`\`\`typescript
const response = await fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
});
const data = await response.json();
\`\`\`

### AI Usage
\`\`\`typescript
import { OpenAI } from 'floww';
import { generateText } from 'floww/ai';

const openai = new OpenAI();

// Inside a handler:
const result = await generateText({
  model: openai.models.gpt4o,
  prompt: 'Hello',
});
\`\`\`

AI providers: \`OpenAI\` (models: \`gpt4o\`, \`gpt4oMini\`), \`Anthropic\` (models: \`claude35Sonnet\`, \`claude3Opus\`), \`GoogleAI\` (models: \`gemini15Pro\`, \`gemini2Flash\`).
Functions from \`floww/ai\`: \`generateText\`, \`streamText\`, \`generateObject\`, \`streamObject\`.`);

  // Add current code context if modifying existing workflow
  if (context.currentCode) {
    parts.push(`
## Current Workflow Code

The user is modifying an existing workflow. Here is the current code:

\`\`\`typescript
${context.currentCode}
\`\`\`

When updating code, use the update_workflow_code tool instead of generate_workflow_code.`);
  }

  return parts.join('\n\n');
}

/**
 * Build a prompt for direct code generation after plan approval
 */
export function buildCodeGenerationPrompt(plan: Plan, context: AgentContext): string {
  return `Generate the TypeScript workflow code based on this approved plan:

## Plan Summary
${plan.summary}

## Trigger
- Type: ${plan.trigger.type}
- Source: ${plan.trigger.source}
- Details: ${plan.trigger.details}

## Actions
${plan.actions.map((a, i) => `${i + 1}. ${a.provider}: ${a.description}`).join('\n')}

## Required Providers
${plan.requiredProviders.join(', ')}

## Required Secrets
${plan.requiredSecrets.map((s) => `new Secret('${s}', ...)`).join(', ')}

${context.currentCode ? `\n## Existing Code to Modify\n\`\`\`typescript\n${context.currentCode}\n\`\`\`` : ''}

Generate complete, production-ready TypeScript code using the Floww SDK patterns.
Use the generate_workflow_code tool to submit the final code.`;
}

/**
 * Check if a message indicates plan approval
 */
export function isPlanApproval(message: string): boolean {
  const approvalKeywords = [
    'yes',
    'approve',
    'approved',
    'looks good',
    'proceed',
    'generate',
    'correct',
    'perfect',
    'go ahead',
    'do it',
    'make it',
    'create it',
    'build it',
    'lgtm',
    'ok',
    'okay',
    'sure',
    'yep',
    'yeah',
  ];

  const normalized = message.toLowerCase().trim();

  // Check if the message is primarily an approval
  for (const keyword of approvalKeywords) {
    if (normalized === keyword || normalized.startsWith(`${keyword} `) || normalized.startsWith(`${keyword},`)) {
      return true;
    }
  }

  return false;
}

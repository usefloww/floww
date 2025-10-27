import {
  intro,
  outro,
  text,
  confirm,
  select,
  isCancel,
  cancel,
} from "@clack/prompts";
import {
  fetchProviderType,
  createProvider,
  ProviderSetupStep,
  fetchNamespaces,
} from "../api/apiMethods";
import { UsedProvider } from "./availability";
import { logger } from "../utils/logger";

export async function setupUnavailableProviders(
  unavailableProviders: UsedProvider[]
): Promise<void> {
  if (unavailableProviders.length === 0) {
    return;
  }

  logger.warn(
    `${unavailableProviders.length} provider(s) need configuration`
  );
  intro("🔌 Provider Setup Required");

  const providersList = unavailableProviders
    .map(
      (provider) =>
        `  • ${provider.type}${
          provider.alias ? ` (alias: ${provider.alias})` : ""
        }`
    )
    .join("\n");

  logger.plain(
    `Found ${unavailableProviders.length} unavailable provider(s) that need to be configured:\n${providersList}`
  );

  const shouldContinue = await confirm({
    message: "Would you like to set up these providers now?",
    initialValue: true,
  });

  if (isCancel(shouldContinue)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }

  if (!shouldContinue) {
    outro("❌ Provider setup cancelled. Your code may not work correctly.");
    return;
  }

  // Get available namespaces
  const namespaces = await logger.task(
    "Fetching namespaces",
    async () => await fetchNamespaces()
  );

  let selectedNamespaceId: string;

  if (namespaces.length === 1) {
    selectedNamespaceId = namespaces[0].id;
    logger.plain(`Using namespace: ${namespaces[0].id}`);
  } else {
    const namespaceChoice = await select({
      message: "Select a namespace for these providers:",
      options: namespaces.map((ns) => ({
        value: ns.id,
        label: ns.display_name || ns.name,
        hint: ns.name,
      })),
    });

    if (isCancel(namespaceChoice)) {
      cancel("Operation cancelled.");
      process.exit(0);
    }

    selectedNamespaceId = namespaceChoice as string;
  }

  // Set up each unavailable provider
  for (const provider of unavailableProviders) {
    await setupSingleProvider(provider, selectedNamespaceId);
  }

  outro("✅ All providers have been configured successfully!");
}

async function setupSingleProvider(
  provider: UsedProvider,
  namespaceId: string
): Promise<void> {
  logger.plain(
    `\n🔧 Setting up ${provider.type}${
      provider.alias ? ` (alias: ${provider.alias})` : ""
    }`
  );

  try {
    // Fetch provider type configuration
    const providerType = await logger.task(
      `Fetching ${provider.type} configuration`,
      async () => {
        return await fetchProviderType(provider.type);
      }
    );

    // Collect configuration values
    const config: Record<string, any> = {};

    for (const step of providerType.setup_steps) {
      const value = await promptForSetupStep(step);
      config[step.alias] = value;
    }

    // Create the provider
    await logger.task("Creating provider", async () => {
      await createProvider({
        namespace_id: namespaceId,
        type: provider.type,
        alias: provider.alias || provider.type,
        config,
      });
    });

    logger.success(`${provider.type} provider created successfully`);
  } catch (error) {
    logger.error(`Failed to setup ${provider.type}`, error);
    throw error;
  }
}

async function promptForSetupStep(step: ProviderSetupStep): Promise<string> {
  // Build message with optional description hint
  let message = step.title;
  if (step.description && step.description !== step.title) {
    message += ` (${step.description})`;
  }

  step.placeholder = "glpat-xxx";

  const basePrompt = {
    message,
    placeholder: step.placeholder,
    initialValue: step.default,
    validate: (value: string) => {
      if (step.required && (!value || value.trim() === "")) {
        return "This field is required";
      }
      return;
    },
  };

  let result: string | symbol;

  switch (step.type) {
    case "password":
    case "secret":
    case "token":
      result = await text(basePrompt);
      break;

    case "text":
    case "string":
    case "url":
    case "email":
    default:
      result = await text(basePrompt);
      break;
  }

  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }

  return result as string;
}

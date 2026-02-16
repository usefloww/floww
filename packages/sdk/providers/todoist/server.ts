import type { ProviderDefinition, SetupStep } from "../base";

interface TodoistSecrets {
  api_token: string;
}

const setupSteps: SetupStep[] = [
  {
    type: "secret",
    key: "api_token",
    label: "API Token",
    description:
      "Your Todoist API token (https://todoist.com/prefs/integrations)",
    required: true,
  },
];

export const TodoistServerProvider: ProviderDefinition<TodoistSecrets> = {
  providerType: "todoist",
  setupSteps,
  triggerDefinitions: {}, // No triggers yet (matches Python backend)
};

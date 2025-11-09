import inquirer from "inquirer";
import { ApiClient } from "../api/types";
import { NotFoundError } from "../api/errors";

export type SecretDefinition = {
  key: string;
  label: string;
  type: "string" | "password";
  required: boolean;
};

export type ProviderSecrets = Record<string, string>;

// Backend API response types
interface SecretResponse {
  id: string;
  namespace_id: string;
  name: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

interface SecretWithValueResponse extends SecretResponse {
  value: string;
}

export class SecretManager {
  private apiClient: ApiClient;
  private namespaceId: string;

  constructor(apiClient: ApiClient, namespaceId: string) {
    this.apiClient = apiClient;
    this.namespaceId = namespaceId;
  }

  /**
   * Get a specific secret value from the backend
   */
  async getSecret(
    providerType: string,
    credentialName: string,
    key: string,
  ): Promise<string | undefined> {
    const secretName = `${credentialName}:${key}`;

    try {
      // First, list secrets to find the matching one
      const secrets = await this.apiClient.apiCall<SecretResponse[]>(
        `/secrets/namespace/${this.namespaceId}?provider=${encodeURIComponent(providerType)}&name=${encodeURIComponent(secretName)}`,
      );

      if (!Array.isArray(secrets) || secrets.length === 0) {
        return undefined;
      }

      // Get the secret with its decrypted value
      const secret = secrets[0];
      const secretWithValue =
        await this.apiClient.apiCall<SecretWithValueResponse>(
          `/secrets/${secret.id}`,
        );

      return secretWithValue?.value;
    } catch (error) {
      // 404 Not Found is okay - it just means no secrets exist yet
      if (error instanceof NotFoundError) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Get all secrets for a provider credential
   */
  async getProviderSecrets(
    providerType: string,
    credentialName: string,
  ): Promise<ProviderSecrets | undefined> {
    try {
      // List all secrets for this provider
      const allSecrets = await this.apiClient.apiCall<SecretResponse[]>(
        `/secrets/namespace/${this.namespaceId}?provider=${encodeURIComponent(providerType)}`,
      );

      if (!Array.isArray(allSecrets) || allSecrets.length === 0) {
        return undefined;
      }

      // Filter secrets that match the credential name pattern
      const prefix = `${credentialName}:`;
      const matchingSecrets = allSecrets.filter((s) =>
        s.name.startsWith(prefix),
      );

      if (matchingSecrets.length === 0) {
        return undefined;
      }

      // Fetch all secret values
      const secrets: ProviderSecrets = {};
      for (const secret of matchingSecrets) {
        const secretWithValue =
          await this.apiClient.apiCall<SecretWithValueResponse>(
            `/secrets/${secret.id}`,
          );

        if (secretWithValue?.value) {
          // Extract the key from the name (remove "credentialName:" prefix)
          const key = secret.name.substring(prefix.length);
          secrets[key] = secretWithValue.value;
        }
      }

      return Object.keys(secrets).length > 0 ? secrets : undefined;
    } catch (error) {
      // 404 Not Found is okay - it just means no secrets exist yet
      if (error instanceof NotFoundError) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Set a specific secret value in the backend
   */
  async setSecret(
    providerType: string,
    credentialName: string,
    key: string,
    value: string,
  ): Promise<void> {
    const secretName = `${credentialName}:${key}`;

    try {
      // Check if secret already exists
      const existing = await this.apiClient.apiCall<SecretResponse[]>(
        `/secrets/namespace/${this.namespaceId}?provider=${encodeURIComponent(providerType)}&name=${encodeURIComponent(secretName)}`,
      );

      if (Array.isArray(existing) && existing.length > 0) {
        // Update existing secret
        await this.apiClient.apiCall(`/secrets/${existing[0].id}`, {
          method: "PATCH",
          body: { value },
        });
      } else {
        // Create new secret
        await this.apiClient.apiCall("/secrets/", {
          method: "POST",
          body: {
            namespace_id: this.namespaceId,
            name: secretName,
            provider: providerType,
            value,
          },
        });
      }
    } catch (error) {
      // 404 Not Found means no secrets exist, so create new
      if (error instanceof NotFoundError) {
        await this.apiClient.apiCall("/secrets/", {
          method: "POST",
          body: {
            namespace_id: this.namespaceId,
            name: secretName,
            provider: providerType,
            value,
          },
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Set all secrets for a provider credential
   */
  async setProviderSecrets(
    providerType: string,
    credentialName: string,
    secrets: ProviderSecrets,
  ): Promise<void> {
    // Set each secret individually
    for (const [key, value] of Object.entries(secrets)) {
      await this.setSecret(providerType, credentialName, key, value);
    }
  }

  /**
   * Check if provider has all required secrets
   */
  async hasProviderSecrets(
    providerType: string,
    credentialName: string,
    requiredKeys: string[],
  ): Promise<boolean> {
    const providerSecrets = await this.getProviderSecrets(
      providerType,
      credentialName,
    );
    if (!providerSecrets) return false;

    return requiredKeys.every(
      (key) => providerSecrets[key] && providerSecrets[key].length > 0,
    );
  }

  /**
   * Ensure provider has all required secrets, prompting if necessary
   */
  async ensureProviderSecrets(
    providerType: string,
    credentialName: string,
    definitions: SecretDefinition[],
  ): Promise<ProviderSecrets> {
    const requiredKeys = definitions.map((d) => d.key);
    const hasSecrets = await this.hasProviderSecrets(
      providerType,
      credentialName,
      requiredKeys,
    );

    if (!hasSecrets) {
      // Trigger interactive setup
      return await this.promptForSecrets(
        providerType,
        credentialName,
        definitions,
      );
    }

    // Load existing secrets
    return (await this.getProviderSecrets(providerType, credentialName)) || {};
  }

  /**
   * Interactively prompt for secrets
   */
  async promptForSecrets(
    providerType: string,
    credentialName: string,
    definitions: SecretDefinition[],
  ): Promise<ProviderSecrets> {
    // Clear screen and show header
    console.clear();
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`   🔐 Credential Setup: ${providerType}`);
    console.log("═══════════════════════════════════════════════════════════");
    console.log();
    console.log(`Setting up credential: "${credentialName}"`);
    console.log();

    const secrets: ProviderSecrets = {};

    // Build inquirer prompts
    const prompts: any[] = [];
    for (const def of definitions) {
      const existingValue = await this.getSecret(
        providerType,
        credentialName,
        def.key,
      );

      // Skip if already exists and not required
      if (existingValue && !def.required) {
        secrets[def.key] = existingValue;
        continue;
      }

      prompts.push({
        type: def.type === "password" ? "password" : "input",
        name: def.key,
        message: def.label,
        default: existingValue || undefined,
        validate: (input: string) => {
          if (def.required && !input.trim()) {
            return `${def.label} is required`;
          }
          return true;
        },
        transformer: (input: string) => {
          // Show if existing value is being kept
          if (!input && existingValue) {
            return "(keeping existing value)";
          }
          return input;
        },
      });
    }

    // Prompt user for all secrets
    if (prompts.length > 0) {
      const answers = await inquirer.prompt(prompts);

      // Merge answers with existing secrets
      for (const [key, value] of Object.entries(answers)) {
        if (value) {
          secrets[key] = value as string;
        } else {
          // If no value provided, use existing value
          const existingValue = await this.getSecret(
            providerType,
            credentialName,
            key,
          );
          if (existingValue) {
            secrets[key] = existingValue;
          }
        }
      }
    }

    // Save the secrets to backend
    await this.setProviderSecrets(providerType, credentialName, secrets);

    console.log();
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`   ✅ Credential "${credentialName}" saved successfully!`);
    console.log("═══════════════════════════════════════════════════════════");
    console.log();

    return secrets;
  }

  /**
   * Clear all secrets for a provider credential
   */
  async clearProviderSecrets(
    providerType: string,
    credentialName: string,
  ): Promise<void> {
    try {
      // List all secrets for this provider and credential
      const allSecrets = await this.apiClient.apiCall<SecretResponse[]>(
        `/secrets/namespace/${this.namespaceId}?provider=${encodeURIComponent(providerType)}`,
      );

      if (!Array.isArray(allSecrets) || allSecrets.length === 0) {
        return;
      }

      // Filter secrets that match the credential name pattern
      const prefix = `${credentialName}:`;
      const matchingSecrets = allSecrets.filter((s) =>
        s.name.startsWith(prefix),
      );

      // Delete each matching secret
      for (const secret of matchingSecrets) {
        await this.apiClient.apiCall(`/secrets/${secret.id}`, {
          method: "DELETE",
        });
      }
    } catch (error) {
      // 404 Not Found is okay - it just means no secrets exist
      if (error instanceof NotFoundError) {
        return;
      }
      throw error;
    }
  }

  /**
   * Clear all secrets in the namespace
   */
  async clearAllSecrets(): Promise<void> {
    try {
      // List all secrets in the namespace
      const allSecrets = await this.apiClient.apiCall<SecretResponse[]>(
        `/secrets/namespace/${this.namespaceId}`,
      );

      if (!Array.isArray(allSecrets) || allSecrets.length === 0) {
        return;
      }

      // Delete each secret
      for (const secret of allSecrets) {
        await this.apiClient.apiCall(`/secrets/${secret.id}`, {
          method: "DELETE",
        });
      }
    } catch (error) {
      // 404 Not Found is okay - it just means no secrets exist
      if (error instanceof NotFoundError) {
        return;
      }
      throw error;
    }
  }
}

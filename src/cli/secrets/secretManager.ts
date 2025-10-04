import fs from 'fs';
import path from 'path';
import os from 'os';
import * as readline from 'readline';

const CONFIG_DIR = path.join(os.homedir(), '.floww');
const SECRETS_FILE = path.join(CONFIG_DIR, 'secrets.json');

export type SecretDefinition = {
  key: string;
  label: string;
  type: 'string' | 'password';
  required: boolean;
};

export type ProviderSecrets = Record<string, string>;

// Structure: { "providerType:credentialName": { key: value } }
// e.g., { "gitlab:work-account": { accessToken: "..." } }
export type SecretsStore = Record<string, ProviderSecrets>;

// TODO: Implement this on top of the backend instead
export class SecretManager {
  private secrets: SecretsStore;

  constructor() {
    this.secrets = this.loadSecrets();
  }

  private loadSecrets(): SecretsStore {
    if (!fs.existsSync(SECRETS_FILE)) {
      return {};
    }
    try {
      const data = fs.readFileSync(SECRETS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load secrets');
      return {};
    }
  }

  private saveSecrets(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(this.secrets, null, 2));
    fs.chmodSync(SECRETS_FILE, 0o600); // Secure permissions (owner read/write only)
  }

  private getCredentialKey(providerType: string, credentialName: string): string {
    return `${providerType}:${credentialName}`;
  }

  getSecret(providerType: string, credentialName: string, key: string): string | undefined {
    const credentialKey = this.getCredentialKey(providerType, credentialName);
    return this.secrets[credentialKey]?.[key];
  }

  getProviderSecrets(providerType: string, credentialName: string): ProviderSecrets | undefined {
    const credentialKey = this.getCredentialKey(providerType, credentialName);
    return this.secrets[credentialKey];
  }

  setSecret(providerType: string, credentialName: string, key: string, value: string): void {
    const credentialKey = this.getCredentialKey(providerType, credentialName);
    if (!this.secrets[credentialKey]) {
      this.secrets[credentialKey] = {};
    }
    this.secrets[credentialKey][key] = value;
    this.saveSecrets();
  }

  setProviderSecrets(providerType: string, credentialName: string, secrets: ProviderSecrets): void {
    const credentialKey = this.getCredentialKey(providerType, credentialName);
    this.secrets[credentialKey] = secrets;
    this.saveSecrets();
  }

  hasProviderSecrets(providerType: string, credentialName: string, requiredKeys: string[]): boolean {
    const credentialKey = this.getCredentialKey(providerType, credentialName);
    const providerSecrets = this.secrets[credentialKey];
    if (!providerSecrets) return false;

    return requiredKeys.every(key => providerSecrets[key] && providerSecrets[key].length > 0);
  }

  async ensureProviderSecrets(
    providerType: string,
    credentialName: string,
    definitions: SecretDefinition[]
  ): Promise<ProviderSecrets> {
    const requiredKeys = definitions.map(d => d.key);
    const hasSecrets = this.hasProviderSecrets(providerType, credentialName, requiredKeys);

    if (!hasSecrets) {
      // Trigger interactive setup
      return await this.promptForSecrets(providerType, credentialName, definitions);
    }

    // Load existing secrets
    return this.getProviderSecrets(providerType, credentialName) || {};
  }

  async promptForSecrets(providerType: string, credentialName: string, definitions: SecretDefinition[]): Promise<ProviderSecrets> {
    // Clear screen and show header
    console.clear();
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   🔐 Credential Setup: ${providerType}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log();
    console.log(`Setting up credential: "${credentialName}"`);
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const secrets: ProviderSecrets = {};

    for (let i = 0; i < definitions.length; i++) {
      const def = definitions[i];
      const existingValue = this.getSecret(providerType, credentialName, def.key);

      if (existingValue && !def.required) {
        secrets[def.key] = existingValue;
        continue;
      }

      // Show progress
      console.log(`\n[${i + 1}/${definitions.length}] ${def.label}`);

      if (def.required) {
        console.log('    (required)');
      } else {
        console.log('    (optional)');
      }

      const prompt = existingValue
        ? `\n    Enter value [press enter to keep existing]: `
        : `\n    Enter value: `;

      const value = await new Promise<string>((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer.trim());
        });
      });

      if (value) {
        secrets[def.key] = value;
        console.log(`    ✓ Saved`);
      } else if (existingValue) {
        secrets[def.key] = existingValue;
        console.log(`    ✓ Kept existing value`);
      } else if (def.required) {
        console.log();
        console.error(`    ❌ ${def.label} is required`);
        rl.close();
        process.exit(1);
      } else {
        console.log(`    ⊘ Skipped`);
      }
    }

    rl.close();

    // Save the secrets
    this.setProviderSecrets(providerType, credentialName, secrets);

    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   ✅ Credential "${credentialName}" saved successfully!`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log();

    return secrets;
  }

  clearProviderSecrets(providerType: string, credentialName: string): void {
    const credentialKey = this.getCredentialKey(providerType, credentialName);
    delete this.secrets[credentialKey];
    this.saveSecrets();
  }

  clearAllSecrets(): void {
    this.secrets = {};
    this.saveSecrets();
  }
}

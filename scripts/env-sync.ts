#!/usr/bin/env tsx
/**
 * AWS Parameter Store Environment Sync Tool
 *
 * Syncs environment variables between local .env file and AWS Parameter Store.
 *
 * .env.example format (marks which variables sync to Parameter Store):
 *   DATABASE_URL=aws-ssm:
 *   AUTH_CLIENT_SECRET=aws-ssm:
 *   LOG_LEVEL=info              # Not synced (no aws-ssm: marker)
 *
 * Script constructs Parameter Store path from variable name:
 *   DATABASE_URL=aws-ssm: → /floww-dashboard/local/DATABASE_URL
 *
 * Usage:
 *   pnpm env:pull              # Pull all from Parameter Store → .env
 *   pnpm env:push              # Diff & interactively push .env → Parameter Store
 *   pnpm env:push --yes        # Push all without prompts
 *   pnpm env:push --dry-run    # Preview what would change
 */

import { SSMClient, GetParameterCommand, PutParameterCommand, ParameterNotFound } from '@aws-sdk/client-ssm';
import { fromEnv } from '@aws-sdk/credential-providers';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AWS_SSM_PREFIX = 'aws-ssm:';
const PARAMETER_STORE_BASE_PATH = '/floww-dashboard/local';

/**
 * Strip quotes from environment variable values
 */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Add quotes to environment variable values if needed
 */
function addQuotes(value: string): string {
  // Don't quote if already quoted
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return value;
  }

  // Use double quotes for all values
  // Escape existing double quotes and backslashes
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Create SSM client with explicit credential priority
 * Prioritizes AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY over AWS_PROFILE
 */
function createSSMClient(): SSMClient {
  const region = process.env.AWS_REGION || 'us-east-1';

  // If AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set, use them explicitly
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return new SSMClient({
      region,
      credentials: fromEnv(),
    });
  }

  // Otherwise use default credential provider chain
  return new SSMClient({ region });
}

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

interface EnvVariable {
  key: string;
  value: string;
  parameterPath?: string;
}

interface ParsedEnv {
  variables: EnvVariable[];
  ssmVariables: EnvVariable[];
  lines: string[];
}

/**
 * Parse .env file format, preserving comments and structure
 */
function parseEnvFile(filePath: string): ParsedEnv {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const variables: EnvVariable[] = [];
  const ssmVariables: EnvVariable[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, value] = match;
    const envVar: EnvVariable = { key, value };

    // Check if this is an SSM-synced variable (simplified format: aws-ssm:)
    if (value === AWS_SSM_PREFIX || value.startsWith(AWS_SSM_PREFIX)) {
      // Use the variable name itself as the parameter name
      envVar.parameterPath = `${PARAMETER_STORE_BASE_PATH}/${key}`;
      ssmVariables.push(envVar);
    }

    variables.push(envVar);
  }

  return { variables, ssmVariables, lines };
}

/**
 * Parse .env file for actual values (not SSM paths)
 * Strips quotes from values for internal storage
 */
function parseLocalEnv(filePath: string): Map<string, string> {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const env = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, value] = match;
    // Strip quotes from the value
    env.set(key, stripQuotes(value));
  }

  return env;
}

/**
 * Get parameter from AWS Parameter Store
 */
async function getParameter(client: SSMClient, path: string): Promise<string | null> {
  try {
    const command = new GetParameterCommand({
      Name: path,
      WithDecryption: true,
    });
    const response = await client.send(command);
    return response.Parameter?.Value || null;
  } catch (error: any) {
    if (error.name === 'ParameterNotFound' || error instanceof ParameterNotFound) {
      return null;
    }
    throw error;
  }
}

/**
 * Put parameter to AWS Parameter Store
 * Handles both new parameters (with tags) and updates (with overwrite)
 */
async function putParameter(client: SSMClient, path: string, value: string, isNew: boolean = false): Promise<void> {
  if (isNew) {
    // Create new parameter with tags (no Overwrite flag)
    const command = new PutParameterCommand({
      Name: path,
      Value: value,
      Type: 'SecureString',
      Tags: [
        { Key: 'project', Value: 'floww-dashboard' },
        { Key: 'environment', Value: 'local' },
      ],
    });
    await client.send(command);
  } else {
    // Update existing parameter (with Overwrite, no Tags)
    const command = new PutParameterCommand({
      Name: path,
      Value: value,
      Type: 'SecureString',
      Overwrite: true,
    });
    await client.send(command);
  }
}

/**
 * Prompt user for confirmation
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Update .env file with new values while preserving structure
 * Always quotes values for consistency
 */
function updateEnvFile(filePath: string, updates: Map<string, string>): void {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const updatedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      updatedLines.push(line);
      continue;
    }

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      const [, key] = match;
      if (updates.has(key)) {
        // Add quotes to the value
        const quotedValue = addQuotes(updates.get(key)!);
        updatedLines.push(`${key}=${quotedValue}`);
      } else {
        updatedLines.push(line);
      }
    } else {
      updatedLines.push(line);
    }
  }

  writeFileSync(filePath, updatedLines.join('\n'), 'utf-8');
}

/**
 * Normalize .env file to ensure all values are quoted
 */
function normalizeEnvFile(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const normalizedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      normalizedLines.push(line);
      continue;
    }

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Strip quotes then re-add them to normalize
      const unquoted = stripQuotes(value);
      const quoted = addQuotes(unquoted);
      normalizedLines.push(`${key}=${quoted}`);
    } else {
      normalizedLines.push(line);
    }
  }

  writeFileSync(filePath, normalizedLines.join('\n'), 'utf-8');
}

/**
 * PULL: Fetch all parameters from AWS and update local .env
 */
async function pullFromParameterStore(): Promise<void> {
  console.log(`${colors.bold}${colors.cyan}🔽 Pulling from AWS Parameter Store...${colors.reset}\n`);

  const rootDir = resolve(__dirname, '..');
  const envExamplePath = resolve(rootDir, '.env.example');
  const envPath = resolve(rootDir, '.env');

  // Parse .env.example to find SSM variables
  const exampleEnv = parseEnvFile(envExamplePath);
  if (exampleEnv.ssmVariables.length === 0) {
    console.log(`${colors.yellow}No aws-ssm: variables found in .env.example${colors.reset}`);
    return;
  }

  console.log(`Found ${colors.bold}${exampleEnv.ssmVariables.length}${colors.reset} SSM-synced variables\n`);

  // Initialize AWS SSM client
  const client = createSSMClient();

  // Fetch all parameters from AWS
  const updates = new Map<string, string>();
  let fetchedCount = 0;

  for (const ssmVar of exampleEnv.ssmVariables) {
    try {
      const value = await getParameter(client, ssmVar.parameterPath!);
      if (value !== null) {
        updates.set(ssmVar.key, value);
        fetchedCount++;
        console.log(`${colors.green}✓${colors.reset} ${ssmVar.key} ${colors.dim}← ${ssmVar.parameterPath}${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠${colors.reset} ${ssmVar.key} ${colors.dim}(not found in Parameter Store)${colors.reset}`);
      }
    } catch (error: any) {
      console.log(`${colors.red}✗${colors.reset} ${ssmVar.key}: ${error.message}`);
    }
  }

  if (updates.size === 0) {
    console.log(`\n${colors.yellow}No parameters found to pull${colors.reset}`);
    return;
  }

  // Update .env file
  updateEnvFile(envPath, updates);

  console.log(`\n${colors.bold}${colors.green}✓ Successfully pulled ${fetchedCount} parameters to .env${colors.reset}`);
}

/**
 * PUSH: Compare local .env with AWS and prompt for differences
 */
async function pushToParameterStore(dryRun: boolean = false, autoYes: boolean = false): Promise<void> {
  const mode = dryRun ? 'DRY RUN' : 'PUSH';
  console.log(`${colors.bold}${colors.magenta}🔼 ${mode}: Pushing to AWS Parameter Store...${colors.reset}\n`);

  const rootDir = resolve(__dirname, '..');
  const envExamplePath = resolve(rootDir, '.env.example');
  const envPath = resolve(rootDir, '.env');

  // Normalize .env file to ensure all values are quoted
  console.log(`${colors.dim}Normalizing .env file (ensuring all values are quoted)...${colors.reset}\n`);
  normalizeEnvFile(envPath);

  // Parse files
  const exampleEnv = parseEnvFile(envExamplePath);
  const localEnv = parseLocalEnv(envPath);

  if (exampleEnv.ssmVariables.length === 0) {
    console.log(`${colors.yellow}No aws-ssm: variables found in .env.example${colors.reset}`);
    return;
  }

  console.log(`Found ${colors.bold}${exampleEnv.ssmVariables.length}${colors.reset} SSM-synced variables\n`);

  // Initialize AWS SSM client
  const client = createSSMClient();

  // Compare local vs remote
  const changes: Array<{ key: string; path: string; local: string; remote: string | null }> = [];

  for (const ssmVar of exampleEnv.ssmVariables) {
    const localValue = localEnv.get(ssmVar.key);
    if (!localValue) {
      console.log(`${colors.yellow}⚠${colors.reset} ${ssmVar.key} ${colors.dim}(not found in .env, skipping)${colors.reset}`);
      continue;
    }

    try {
      const remoteValue = await getParameter(client, ssmVar.parameterPath!);

      if (remoteValue === null) {
        changes.push({ key: ssmVar.key, path: ssmVar.parameterPath!, local: localValue, remote: null });
        console.log(`${colors.cyan}+${colors.reset} ${ssmVar.key} ${colors.dim}(new parameter)${colors.reset}`);
      } else if (remoteValue !== localValue) {
        changes.push({ key: ssmVar.key, path: ssmVar.parameterPath!, local: localValue, remote: remoteValue });
        console.log(`${colors.yellow}~${colors.reset} ${ssmVar.key} ${colors.dim}(differs)${colors.reset}`);
      } else {
        console.log(`${colors.dim}=${colors.reset} ${ssmVar.key} ${colors.dim}(unchanged)${colors.reset}`);
      }
    } catch (error: any) {
      console.log(`${colors.red}✗${colors.reset} ${ssmVar.key}: ${error.message}`);
    }
  }

  if (changes.length === 0) {
    console.log(`\n${colors.green}✓ All parameters are in sync${colors.reset}`);
    return;
  }

  console.log(`\n${colors.bold}Found ${changes.length} difference(s):${colors.reset}\n`);

  // Prompt for each change
  let pushedCount = 0;

  for (const change of changes) {
    console.log(`${colors.bold}${change.key}${colors.reset}`);
    if (change.remote === null) {
      console.log(`  ${colors.cyan}Status:${colors.reset} New parameter (does not exist in Parameter Store)`);
    } else {
      console.log(`  ${colors.green}Local:${colors.reset}  ${truncateValue(change.local)}`);
      console.log(`  ${colors.red}Remote:${colors.reset} ${truncateValue(change.remote)}`);
    }

    if (dryRun) {
      console.log(`  ${colors.dim}[DRY RUN] Would update remote${colors.reset}\n`);
      continue;
    }

    let shouldPush = autoYes;
    if (!autoYes) {
      const answer = await prompt(`  Push local → remote? [y/N]: `);
      shouldPush = answer === 'y' || answer === 'yes';
    }

    if (shouldPush) {
      try {
        const isNew = change.remote === null;
        await putParameter(client, change.path, change.local, isNew);
        pushedCount++;
        console.log(`  ${colors.green}✓ Pushed to ${change.path}${colors.reset}\n`);
      } catch (error: any) {
        console.log(`  ${colors.red}✗ Failed: ${error.message}${colors.reset}\n`);
      }
    } else {
      console.log(`  ${colors.dim}Skipped${colors.reset}\n`);
    }
  }

  if (dryRun) {
    console.log(`${colors.bold}${colors.magenta}DRY RUN: No changes made${colors.reset}`);
  } else {
    console.log(`${colors.bold}${colors.green}✓ Successfully pushed ${pushedCount} parameter(s)${colors.reset}`);
  }
}

/**
 * Truncate long values for display
 */
function truncateValue(value: string, maxLength: number = 60): string {
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength) + '...';
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || !['pull', 'push'].includes(command)) {
    console.log(`${colors.bold}AWS Parameter Store Environment Sync${colors.reset}\n`);
    console.log('Usage:');
    console.log('  pnpm env:pull              Pull all from Parameter Store → .env');
    console.log('  pnpm env:push              Diff & interactively push .env → Parameter Store');
    console.log('  pnpm env:push --yes        Push all without prompts');
    console.log('  pnpm env:push --dry-run    Preview what would change\n');
    process.exit(1);
  }

  try {
    if (command === 'pull') {
      await pullFromParameterStore();
    } else if (command === 'push') {
      const dryRun = args.includes('--dry-run');
      const autoYes = args.includes('--yes');
      await pushToParameterStore(dryRun, autoYes);
    }
  } catch (error: any) {
    console.error(`\n${colors.red}${colors.bold}Error:${colors.reset} ${error.message}`);
    if (error.stack) {
      console.error(colors.dim + error.stack + colors.reset);
    }
    process.exit(1);
  }
}

main();

import * as readline from 'readline';
import fs from 'fs';
import path from 'path';
import { initProjectConfig, hasProjectConfig, getProjectConfigPath } from '../config/projectConfig';
import { fetchNamespaces, fetchWorkflows, createWorkflow } from '../api/apiMethods';

interface InitOptions {
  force?: boolean;
  name?: string;
  namespace?: string;
  description?: string;
  silent?: boolean; // For internal use when called from deploy
}


class InteractivePrompt {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async ask(prompt: string, validator?: (input: string) => string | null): Promise<string> {
    while (true) {
      const answer = await new Promise<string>((resolve) => {
        this.rl.question(prompt, (input) => resolve(input.trim()));
      });

      if (validator) {
        const error = validator(answer);
        if (error) {
          console.log(`❌ ${error}`);
          continue;
        }
      }

      return answer;
    }
  }

  async select(prompt: string, options: Array<{ value: string; label: string; description?: string }>): Promise<string> {
    console.log(`\n${prompt}`);
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option.label}${option.description ? ` - ${option.description}` : ''}`);
    });
    console.log();

    const answer = await this.ask('Select option (number): ', (input) => {
      const num = parseInt(input);
      if (isNaN(num) || num < 1 || num > options.length) {
        return `Please enter a number between 1 and ${options.length}`;
      }
      return null;
    });

    return options[parseInt(answer) - 1].value;
  }

  async confirm(prompt: string, defaultValue: boolean = true): Promise<boolean> {
    const suffix = defaultValue ? ' (Y/n): ' : ' (y/N): ';
    const answer = await new Promise<string>((resolve) => {
      this.rl.question(prompt + suffix, (input) => resolve(input.trim().toLowerCase()));
    });

    if (!answer) return defaultValue;
    return answer === 'y' || answer === 'yes';
  }

  close() {
    this.rl.close();
  }
}




export async function initCommand(options: InitOptions = {}): Promise<string | null> {
  if (!options.silent) {
    console.log('🚀 Initializing new Floww project\n');
  }

  // Check if config already exists
  if (hasProjectConfig() && !options.force) {
    if (!options.silent) {
      console.error('❌ floww.yaml already exists in this directory.');
      console.error('   Use --force to overwrite or run this command in a different directory.');
    }
    return null;
  }

  const prompt = new InteractivePrompt();

  try {

    // Get workflow name
    let name = options.name;
    if (!name) {
      name = await prompt.ask('Workflow name: ', (input) => {
        if (!input) return 'Workflow name is required';
        if (input.length < 2) return 'Name must be at least 2 characters';
        if (!/^[a-zA-Z0-9\-_\s]+$/.test(input)) return 'Name can only contain letters, numbers, spaces, hyphens, and underscores';
        return null;
      });
    }

    // Fetch and select namespace
    let namespaceId = options.namespace;
    if (!namespaceId) {
      console.log('📋 Fetching your namespaces...');
      const namespaces = await fetchNamespaces();

      if (namespaces.length === 0) {
        console.error('❌ No namespaces found. Please create a namespace in the Floww dashboard first.');
        process.exit(1);
      }

      if (namespaces.length === 1) {
        namespaceId = namespaces[0].id;
        console.log(`✅ Using namespace: ${namespaces[0].display_name}`);
      } else {
        namespaceId = await prompt.select('📋 Select a namespace:',
          namespaces.map(ns => ({
            value: ns.id,
            label: ns.display_name,
            description: ns.name
          }))
        );
      }
    }

    // Check for existing workflows and offer options
    console.log('📋 Checking existing workflows...');
    const workflows = await fetchWorkflows();
    const namespaceWorkflows = workflows.filter(w => w.namespace_id === namespaceId);

    let workflowId: string | undefined;

    if (namespaceWorkflows.length > 0) {
      const options = [
        ...namespaceWorkflows.map(w => ({
          value: `existing:${w.id}`,
          label: w.name,
          description: w.description || 'Existing workflow'
        })),
        {
          value: 'new',
          label: 'Create new workflow',
          description: 'Start fresh with a new workflow'
        }
      ];

      const selection = await prompt.select('🚀 Choose workflow option:', options);

      if (selection.startsWith('existing:')) {
        workflowId = selection.replace('existing:', '');
        const selectedWorkflow = namespaceWorkflows.find(w => w.id === workflowId);
        console.log(`✅ Using existing workflow: ${selectedWorkflow?.name}`);
      }
    }

    // Create new workflow if needed
    if (!workflowId) {
      console.log('🆕 Creating new workflow...');

      let description = options.description;
      if (!description) {
        description = await prompt.ask('Description (optional): ', () => null);
        if (!description) description = undefined;
      }

      const newWorkflow = await createWorkflow(name, namespaceId, description);
      workflowId = newWorkflow.id;
      console.log(`✅ Created workflow: ${newWorkflow.name}`);
    }

    // Create config
    const config = {
      namespaceId,
      workflowId,
      name,
      ...(options.description && { description: options.description }),
      version: '1.0.0',
      entrypoint: 'main.ts',
    };

    // Save config
    initProjectConfig(config, process.cwd(), options.force);

    if (!options.silent) {
      console.log('\n✅ Created floww.yaml');
      console.log(`   Workflow: ${name}`);
      console.log(`   Workflow ID: ${workflowId}`);
    }

    // Create example workflow file if it doesn't exist
    const exampleFile = path.join(process.cwd(), 'main.ts');
    if (!fs.existsSync(exampleFile) && !options.silent) {
      const shouldCreateExample = await prompt.confirm('Create example main.ts file?');
      if (shouldCreateExample) {
        createExampleWorkflow(exampleFile);
        console.log('✅ Created main.ts');
      }
    }

    if (!options.silent) {
      console.log('\n🎉 Project initialized successfully!');
      console.log('\nNext steps:');
      console.log('  1. Edit your workflow in main.ts');
      console.log('  2. Run: floww dev main.ts');
      console.log('  3. Deploy: floww deploy');
      console.log('  4. Start building! 🚀\n');
    }

    return workflowId;

  } catch (error) {
    console.error('\n❌ Failed to initialize project:', error instanceof Error ? error.message : error);
    if (options.silent) {
      throw error;
    }
    process.exit(1);
  } finally {
    prompt.close();
  }
}

function createExampleWorkflow(filePath: string) {
  const template = `import { Builtin } from '@DeveloperFlows/floww-sdk';

const builtin = new Builtin();

export default [
  builtin.triggers.onCron({
    expression: '*/5 * * * * *', // Every 5 seconds
    handler: (ctx, event) => {
      console.log('Hello from your workflow! 👋');
      console.log('Triggered at:', event.scheduledTime);
    }
  })
];
`;

  fs.writeFileSync(filePath, template, 'utf-8');
}

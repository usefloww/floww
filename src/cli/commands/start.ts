import { FlowEngine } from '../runtime/engine';
import { loadProjectConfig, hasProjectConfig } from '../config/projectConfig';
import path from 'path';

interface StartOptions {
  port: string;
  host: string;
}

export async function startCommand(file: string | undefined, options: StartOptions) {
  const port = parseInt(options.port);
  const host = options.host;

  // Determine the file to use
  let entrypoint: string;
  if (file) {
    entrypoint = file;
  } else if (hasProjectConfig()) {
    const config = loadProjectConfig();
    entrypoint = config.entrypoint || 'main.ts';
  } else {
    entrypoint = 'main.ts';
  }

  // Resolve to absolute path
  const absolutePath = path.resolve(entrypoint);

  console.log(`\n🚀 Production Mode`);
  console.log(`📂 Loading: ${entrypoint}\n`);

  const engine = new FlowEngine(port, host);

  // Load and start triggers
  try {
    await engine.load(absolutePath);
    await engine.start();
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await engine.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await engine.stop();
    process.exit(0);
  });
}

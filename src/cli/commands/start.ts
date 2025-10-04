import { FlowEngine } from '../runtime/engine';

interface StartOptions {
  port: string;
  host: string;
}

export async function startCommand(file: string, options: StartOptions) {
  const port = parseInt(options.port);
  const host = options.host;

  console.log(`\n🚀 Production Mode`);
  console.log(`📂 Loading: ${file}\n`);

  const engine = new FlowEngine(port, host);

  // Load and start triggers
  try {
    await engine.load(file);
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

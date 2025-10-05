import chokidar from 'chokidar';
import { FlowEngine } from '../runtime/engine';
import { executeUserProject, getUserProject } from '@/codeExecution';

interface DevOptions {
  port: string;
  host: string;
}

export async function devCommand(file: string, options: DevOptions) {
  const port = parseInt(options.port);
  const host = options.host;

  console.log(`\n🔧 Development Mode`);
  console.log(`📂 Watching: ${file}\n`);

  const engine = new FlowEngine(port, host);

  // Load and start triggers
  try {
    await engine.load(file);
    await engine.start();
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }

  // Watch for file changes
  const watcher = chokidar.watch(file, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', async (path) => {
    console.log(`\n📝 File changed: ${path}`);
    try {
      await engine.reload(file);
    } catch (error) {
      console.error('Failed to reload:', error);
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await watcher.close();
    await engine.stop();
    process.exit(0);
  });
}

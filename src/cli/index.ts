#!/usr/bin/env node
import { Command } from 'commander';
import { devCommand } from './commands/dev';
import { startCommand } from './commands/start';

const program = new Command();

program
  .name('floww')
  .description('CLI for running trigger-based workflows')
  .version('1.0.0');

program
  .command('dev')
  .description('Run triggers in development mode with auto-reload')
  .argument('<file>', 'Path to the triggers file')
  .option('-p, --port <port>', 'Port for webhook server', '3000')
  .option('-h, --host <host>', 'Host for webhook server', 'localhost')
  .action(devCommand);

program
  .command('start')
  .description('Run triggers in production mode')
  .argument('<file>', 'Path to the triggers file')
  .option('-p, --port <port>', 'Port for webhook server', '3000')
  .option('-h, --host <host>', 'Host for webhook server', '0.0.0.0')
  .action(startCommand);

program.parse();

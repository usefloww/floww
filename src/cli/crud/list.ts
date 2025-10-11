import { fetchWorkflows, fetchNamespaces, type Workflow, type Namespace } from '../api/apiMethods';
import Table from 'cli-table3';
import chalk from 'chalk';
import logSymbols from 'log-symbols';

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export async function listWorkflowsCommand() {
  try {
    const workflows = await fetchWorkflows();

    if (workflows.length === 0) {
      console.log(`\n${logSymbols.warning} ${chalk.yellow('No workflows found')}`);
      return;
    }

    const table = new Table({
      head: [
        chalk.gray('NAME'),
        chalk.gray('NAMESPACE'),
        chalk.gray('ID'),
        chalk.gray('CREATED'),
        chalk.gray('DESCRIPTION')
      ],
      style: {
        head: [],
        border: []
      },
      chars: {
        'top': '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        'bottom': '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        'left': '',
        'left-mid': '',
        'mid': '',
        'mid-mid': '',
        'right': '',
        'right-mid': '',
        'middle': ' '
      }
    });

    workflows.forEach((workflow: Workflow) => {
      table.push([
        chalk.white(workflow.name),
        chalk.cyan(workflow.namespace_name || workflow.namespace_id),
        chalk.dim(workflow.id),
        chalk.green(formatDate(workflow.created_at)),
        chalk.dim(truncateText(workflow.description || '', 50))
      ]);
    });

    console.log('\n' + table.toString());
  } catch (error) {
    console.error(`${logSymbols.error} ${chalk.red('Failed to fetch workflows:')} ${error}`);
    process.exit(1);
  }
}

export async function listNamespacesCommand() {
  try {
    console.log(`${logSymbols.info} ${chalk.blue('Fetching namespaces...')}`);
    const namespaces = await fetchNamespaces();

    if (namespaces.length === 0) {
      console.log(`\n${logSymbols.warning} ${chalk.yellow('No namespaces found')}`);
      return;
    }

    const table = new Table({
      head: [
        chalk.gray('NAME'),
        chalk.gray('DISPLAY NAME'),
        chalk.gray('ID'),
        chalk.gray('OWNER')
      ],
      style: {
        head: [],
        border: []
      },
      chars: {
        'top': '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        'bottom': '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        'left': '',
        'left-mid': '',
        'mid': '',
        'mid-mid': '',
        'right': '',
        'right-mid': '',
        'middle': ' '
      }
    });

    namespaces.forEach((namespace: Namespace) => {
      let owner = chalk.dim('unknown');
      if (namespace.user_owner_id) {
        owner = chalk.blue(`user:${namespace.user_owner_id.substring(0, 8)}`);
      } else if (namespace.organization_owner_id) {
        owner = chalk.magenta(`org:${namespace.organization_owner_id.substring(0, 8)}`);
      }

      table.push([
        chalk.white(namespace.name),
        chalk.cyan(namespace.display_name || namespace.name),
        chalk.dim(namespace.id.substring(0, 8)),
        owner
      ]);
    });

    console.log('\n' + table.toString());
  } catch (error) {
    console.error(`${logSymbols.error} ${chalk.red('Failed to fetch namespaces:')} ${error}`);
    process.exit(1);
  }
}
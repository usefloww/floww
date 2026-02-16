import ts from 'typescript';
import path from 'path';

let cachedParsedOptions: ts.CompilerOptions | null = null;

function getCompilerOptions(): ts.CompilerOptions {
  if (cachedParsedOptions) return cachedParsedOptions;

  const rootDir = process.cwd();
  const configPath = path.join(rootDir, 'tsconfig.app.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error('Failed to read tsconfig.app.json');
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);

  cachedParsedOptions = {
    ...parsed.options,
    noEmit: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    skipLibCheck: true,
  };

  return cachedParsedOptions;
}

export async function validateGeneratedCode(
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const rootDir = process.cwd();
  const virtualFileName = path.join(rootDir, '__generated_workflow__.ts');
  const options = getCompilerOptions();

  const defaultHost = ts.createCompilerHost(options);

  const customHost: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (fileName, languageVersionOrOptions, onError) => {
      if (path.normalize(fileName) === virtualFileName) {
        return ts.createSourceFile(virtualFileName, code, ts.ScriptTarget.ES2020);
      }
      return defaultHost.getSourceFile(fileName, languageVersionOrOptions, onError);
    },
    fileExists: (fileName) => {
      if (path.normalize(fileName) === virtualFileName) return true;
      return ts.sys.fileExists(fileName);
    },
    readFile: (fileName) => {
      if (path.normalize(fileName) === virtualFileName) return code;
      return ts.sys.readFile(fileName);
    },
  };

  const program = ts.createProgram([virtualFileName], options, customHost);
  const sourceFile = program.getSourceFile(virtualFileName);

  if (!sourceFile) {
    return { valid: false, error: 'Failed to create source file for validation' };
  }

  const diagnostics = [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ];

  const errors = diagnostics.filter((d) => {
    if (d.category !== ts.DiagnosticCategory.Error) return false;
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    if (msg.includes('ZodObject')) return false;
    return true;
  });

  if (errors.length > 0) {
    const messages = errors.slice(0, 5).map((d) => {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      if (d.file && d.start !== undefined) {
        const { line } = d.file.getLineAndCharacterOfPosition(d.start);
        return `Line ${line + 1}: ${msg}`;
      }
      return msg;
    });

    const suffix = errors.length > 5 ? `\n...and ${errors.length - 5} more errors` : '';
    return { valid: false, error: messages.join('\n') + suffix };
  }

  return { valid: true };
}

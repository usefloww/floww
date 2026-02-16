import { tool } from 'ai';
import { z } from 'zod';
import type { MessagePart, CodeData, AgentContext } from '../context';
import { extractSecrets, cleanCode, buildSecretParts } from './code-utils';
import { validateGeneratedCode } from './validate-code';

export function createUpdateCodeTool(context: AgentContext) {
  return tool({
    description:
      'Update existing workflow code based on user feedback or requests. ' +
      'Use this when the user wants to modify an existing workflow. ' +
      'This is a terminal tool - the update completes the current request.',
    inputSchema: z.object({
      code: z.string().describe('The complete updated TypeScript workflow code'),
      changesMade: z.string().describe('Summary of the changes made to the code'),
    }),
    execute: async ({ code, changesMade }) => {
      const cleanedCode = cleanCode(code);

      const validation = await validateGeneratedCode(cleanedCode);
      if (!validation.valid) {
        return {
          isTerminal: false,
          parts: [
            {
              type: 'text' as const,
              text:
                `Build validation failed:\n${validation.error}\n\n` +
                'Fix the code and call update_workflow_code again with corrected code.',
            },
          ],
        };
      }

      const newSecrets = extractSecrets(cleanedCode);
      const oldSecrets = context.currentCode ? extractSecrets(context.currentCode) : [];
      const addedSecrets = newSecrets.filter((s) => !oldSecrets.includes(s));

      const parts: MessagePart[] = [];

      parts.push({
        type: 'text',
        text: changesMade,
      });

      const codeData: CodeData = {
        code: cleanedCode,
        explanation: changesMade,
      };
      parts.push({
        type: 'data-code',
        data: codeData,
      });

      parts.push(...buildSecretParts(addedSecrets));

      return {
        isTerminal: true,
        parts,
        code: cleanedCode,
      };
    },
  });
}

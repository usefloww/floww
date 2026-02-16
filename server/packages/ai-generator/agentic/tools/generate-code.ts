import { tool } from 'ai';
import { z } from 'zod';
import type { MessagePart, CodeData } from '../context';
import { extractSecrets, cleanCode, buildSecretParts } from './code-utils';
import { validateGeneratedCode } from './validate-code';

export function createGenerateCodeTool() {
  return tool({
    description:
      'Generate the final TypeScript workflow code. ' +
      'Only use this tool AFTER the user has approved the plan. ' +
      'The code should be complete and production-ready. ' +
      'This is a terminal tool - code generation completes the workflow building process.',
    inputSchema: z.object({
      code: z.string().describe('The complete TypeScript workflow code'),
      explanation: z.string().describe('Brief explanation of what the code does'),
    }),
    execute: async ({ code, explanation }) => {
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
                'Fix the code and call generate_workflow_code again with corrected code.',
            },
          ],
        };
      }

      const secrets = extractSecrets(cleanedCode);
      const parts: MessagePart[] = [];

      parts.push({
        type: 'text',
        text: explanation,
      });

      const codeData: CodeData = {
        code: cleanedCode,
        explanation,
      };
      parts.push({
        type: 'data-code',
        data: codeData,
      });

      parts.push(...buildSecretParts(secrets));

      return {
        isTerminal: true,
        parts,
        code: cleanedCode,
      };
    },
  });
}

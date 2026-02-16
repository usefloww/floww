/**
 * Ask Clarifying Question Tool
 *
 * Allows the AI to ask the user for missing information with structured options.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { MessagePart, QuestionData } from '../context';

const QuestionOptionSchema = z.object({
  id: z.string().describe('Unique identifier for this option'),
  label: z.string().describe('Display label for this option'),
  description: z.string().optional().describe('Optional description for this option'),
});

export function createAskQuestionTool() {
  return tool({
    description:
      'Ask the user a clarifying question when you need more information to proceed. ' +
      'Always provide structured options when possible to make it easier for the user to respond. ' +
      'This is a terminal tool - the conversation will pause until the user responds.',
    inputSchema: z.object({
      question: z.string().describe('The question to ask the user'),
      options: z
        .array(QuestionOptionSchema)
        .min(2)
        .describe('Structured options for the user to choose from'),
      allowMultiple: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether the user can select multiple options'),
    }),
    execute: async ({ question, options, allowMultiple }) => {
      const questionData: QuestionData = {
        question,
        options,
        allowMultiple,
      };

      const part: MessagePart = {
        type: 'data-question',
        data: questionData,
      };

      return {
        isTerminal: true,
        parts: [part],
      };
    },
  });
}

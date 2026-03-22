/**
 * AI Utilities
 *
 * Re-exports utilities from Vercel's AI SDK v6 for use with the Floww SDK.
 *
 * @example
 * ```typescript
 * import { getProvider } from 'floww';
 * import { generateText } from 'floww/ai';
 * import { z } from 'zod';
 *
 * const openai = getProvider('openai', 'my-credential');
 *
 * const result = await generateText({
 *   model: openai.models.gpt4o,
 *   system: 'You are a helpful assistant',
 *   prompt: 'What is the weather in San Francisco?',
 *   tools: {
 *     getWeather: {
 *       description: 'Get the weather',
 *       inputSchema: z.object({ city: z.string() }),
 *       execute: async ({ city }) => {
 *         return { temp: 72, condition: 'sunny' };
 *       }
 *     }
 *   },
 *   maxSteps: 5
 * });
 * ```
 */

export {
  generateText,
  streamText,
  generateObject,
  streamObject,
  embed,
  embedMany,
  cosineSimilarity,
  tool,
  dynamicTool,
  stepCountIs,
} from "ai";

export type {
  CoreMessage,
  CoreSystemMessage,
  CoreUserMessage,
  CoreAssistantMessage,
  CoreToolMessage,
  TextStreamPart,
  ToolCallPart,
  ToolResultPart,
} from "ai";

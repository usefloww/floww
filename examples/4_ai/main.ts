/**
 * AI Weather Example
 *
 * A simple example showing AI with tools in a cron workflow.
 * Runs every minute and asks the AI about the weather.
 *
 */

import { OpenAI, Builtin } from "floww";
import { generateText, stepCountIs } from "floww/ai";
import { z } from "zod";

const openai = new OpenAI();
const builtin = new Builtin();

export const weatherCheck = builtin.triggers.onCron({
  expression: "*/10 * * * * *", // Every 10 seconds
  handler: async (ctx, event) => {
    console.log("\n🌤️  Checking weather...");

    try {
      const result = await generateText({
        model: openai.models.gpt4oMini,
        system:
          "You are a helpful weather assistant. Use the getWeather tool to check weather, then provide a natural language response describing the weather.",
        prompt:
          "What's the weather like in San Francisco? Please use the weather tool and then tell me about it.",
        tools: {
          getWeather: {
            description: "Get the current weather for a city",
            inputSchema: z.object({
              city: z.string().describe("The city name"),
            }),
            execute: async ({ city }) => {
              // Simulated weather data
              const temp = Math.floor(Math.random() * 15) + 15; // 15-30°C
              const conditions = ["sunny", "cloudy", "rainy", "partly cloudy"];
              const condition =
                conditions[Math.floor(Math.random() * conditions.length)];

              return {
                city,
                temperature: temp,
                condition,
              };
            },
          },
        },
        stopWhen: stepCountIs(5), // Allow up to 5 steps for tool calling and response
      });

      console.log("Result:", result.text);
    } catch (error) {
      console.error("Error generating response:", error);
      throw error;
    }
  },
});

import type { OpenAI } from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

export type Tool = { definition: OpenAI.ChatCompletionTool, call: (parameters: string) => Promise<string> };
export type ToolProps<Schema extends z.ZodType<any, any>> = {
  name: string;
  description: string;
  schema: Schema;
  call: (parameters: z.infer<Schema>) => Promise<string>;
}

type Result<R, E> = { value: R } | { error: E };

function Success<R>(value: R): Result<R, never> {
  return { value };
}

function Fail<E>(error: E): Result<never, E> {
  return { error };
}

function safeParse<Schema extends z.ZodType<any, any>>(schema: Schema, paramString: string): Result<z.infer<Schema>, string> {
  try {
    return Success(schema.parse(JSON.parse(paramString)));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Fail(`Schema validation error: ${error.message}`);
    }
    if (error instanceof SyntaxError) {
      return Fail(`Invalid JSON: ${error.message}`);
    }
    return Fail(`Unknown error: ${error}`);
  }
}

export const makeTool = <Schema extends z.ZodType<any, any>>({
  name,
  description,
  schema,
  call,
}: ToolProps<Schema>): Tool => {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description,
        parameters: zodToJsonSchema(schema),
      },
    },
    call: async (paramString: string) => {
      try {
        const paramObj = schema.parse(JSON.parse(paramString));
        return await call(paramObj).then(JSON.stringify);
      } catch (error) {
        console.log(error);
        return JSON.stringify({
          error,
        });
      }
    },
  };
};
import type { OpenAI } from "openai";
import { parse, type Schema, type ValueOf } from "./schema";

export type Tool = {
  definition: OpenAI.ChatCompletionTool;
  call: (parameters: string) => Promise<string>;
};

export type ToolProps<T extends Schema> = {
  name: string;
  description: string;
  schema: T;
  call: (parameters: ValueOf<T>) => Promise<string>;
}

export const makeTool = <T extends Schema>({
  name,
  description,
  schema,
  call,
}: ToolProps<T>): Tool => {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description,
        parameters: schema
      },
    },
    call: async (paramString: string) => {
      try {
        const paramObj = parse(schema, JSON.parse(paramString));
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

export { schema } from "./schema";

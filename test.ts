import {
  makeAgent,
  NEW_ITERATION,
  TEXT_CHUNK,
  TOOL_CALL_REQUEST,
  TOOL_CALL_RESPONSE,
} from "./index";
import { OpenAI } from "openai";
import vm from "node:vm";
import { makeTool, schema } from "./tools";

const openAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_URL,
});

const tools = [
  makeTool({
    name: "execute_script",
    description: "Execute JavaScript code in sandbox without network access, write the result to the global variable 'result', you can write code to get the information you need",
    schema: schema({
      type: "object",
      properties: {
        script: {
          type: "string",
        },
      },
      required: ["script"],
    }),
    call: async ({ script }) => {
      const context: { result: string | null } = { result: null };
      console.log(script)
      const sc = new vm.Script(script);
      sc.runInNewContext(context);
      return context.result ?? "No result";
    }
  }),
];


const agent = makeAgent({
  tools,
  model: "deepseek-chat",
  openAI,
  systemPrompt: "You are a helpful assistant.",
});

for await (const chunk of agent("理论上我国的回文数车牌号可以有多少个，可以写程序计算")) {
  if (chunk.type === NEW_ITERATION) {
    console.log("-".repeat(20));
  } else if (chunk.type === TEXT_CHUNK) {
    console.write(chunk.content);
  } else if (chunk.type === TOOL_CALL_REQUEST) {
    console.log(`Tool call: ${chunk.name}(${chunk.arguments})`);
  } else if (chunk.type === TOOL_CALL_RESPONSE) {
    console.log(`Tool call response: ${chunk.result}`);
  }
}

import { type OpenAI } from "openai";
import { type Tool } from "./tools";

export type AgentOutputChunk = NewIteration | ToolCallRequest | ToolCallResponse | TextChunk;

export const NEW_ITERATION = Symbol("new_iteration");
export const TOOL_CALL_REQUEST = Symbol("tool_call_request");
export const TOOL_CALL_RESPONSE = Symbol("tool_call_response");
export const TEXT_CHUNK = Symbol("text");

export type NewIteration = {
  type: typeof NEW_ITERATION;
}

const newIteration = (): NewIteration => ({ type: NEW_ITERATION });

export type ToolCallRequest = {
  type: typeof TOOL_CALL_REQUEST;
  id: string;
  name: string;
  arguments: string;
}

const toolCallRequest = (id: string, name: string, args: string): ToolCallRequest => ({ type: TOOL_CALL_REQUEST, id, name, arguments: args });

export type ToolCallResponse = {
  type: typeof TOOL_CALL_RESPONSE;
  id: string;
  result: string;
}

const toolCallResponse = (id: string, result: string): ToolCallResponse => ({ type: TOOL_CALL_RESPONSE, id, result });

export type TextChunk = {
  type: typeof TEXT_CHUNK;
  content: string;
}

const textChunk = (content: string): TextChunk => ({ type: TEXT_CHUNK, content });

const runIteration = async function *({
  openAI,
  params,
}: {
  openAI: OpenAI,
  params: OpenAI.ChatCompletionCreateParams
}): AsyncGenerator<TextChunk | ToolCallRequest> {
  const response = await openAI.chat.completions.create({
    ...params,
    stream: true,
  });

  const toolCallRequests = new Map<number, ToolCallRequest>();

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) {
      continue;
    }
    if (delta.content) {
      yield textChunk(delta.content);
    }
    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.id) {
          toolCallRequests.set(
            toolCall.index,
            toolCallRequest(
              toolCall.id,
              toolCall.function?.name ?? "",
              toolCall.function?.arguments ?? ""
            )
          );
        } else {
          const request = toolCallRequests.get(toolCall.index);
          if (request) {
            if (toolCall.function) {
              request.name += toolCall.function.name ?? '';
              request.arguments += toolCall.function.arguments ?? '';
            }
          } else {
            console.error("Tool call request not found");
          }
        }
      }
    }
  }

  for (const request of toolCallRequests.values()) {
    yield request;
  }
}

export const makeAgent = ({
  tools,
  model,
  openAI,
  systemPrompt,
}: {
  tools: Tool[],
  model: string,
  openAI: OpenAI,
  systemPrompt: string,
}) => async function * (message: string): AsyncGenerator<AgentOutputChunk> {
  // 初始化消息历史
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: "Please answer the following user question based on the user's language. You can make tool calls to get information. Please also tell what you want to do when you are making a tool call. If a tool call fails, you can try another way, don't give up too soon." },
    { role: "user", content: message }
  ];

  const toolMap = tools.reduce((acc, tool) => {
    if (tool.definition.function) {
      acc[tool.definition.function.name] = tool;
    }
    return acc;
  }, {} as Record<string, {
    definition: OpenAI.ChatCompletionTool,
    call: (parameters: string) => Promise<string>,
  }>);

  let hasMoreIterations = true;
  while (hasMoreIterations) {
    const assistantMessage: OpenAI.ChatCompletionAssistantMessageParam = { role: "assistant", content: "" };

    yield newIteration();

    const chunks = runIteration({
      openAI,
      params: tools.length > 0 ? {
        model,
        messages,
        tools: tools.map(tool => tool.definition),
        tool_choice: "auto",
      } : {
        model,
        messages,
      }
    });

    messages.push(assistantMessage);

    hasMoreIterations = false;

    for await (const chunk of chunks) {
      if (chunk.type === TEXT_CHUNK) {
        assistantMessage.content += chunk.content;
        yield chunk;
      }
      if (chunk.type === TOOL_CALL_REQUEST) {
        hasMoreIterations = true;
        yield toolCallRequest(chunk.id, chunk.name, chunk.arguments);
        const tool = toolMap[chunk.name];
        if (tool) {
          if (!assistantMessage.tool_calls) {
            assistantMessage.tool_calls = [];
          }
          assistantMessage.tool_calls.push({
            id: chunk.id,
            type: "function",
            function: {
              name: chunk.name,
              arguments: chunk.arguments,
            }
          });
          const result = await tool.call(chunk.arguments);
          messages.push({
            role: "tool",
            content: result,
            tool_call_id: chunk.id,
          });
          yield toolCallResponse(chunk.id, result);
        }
      }
    }
  }
}



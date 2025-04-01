import { type OpenAI } from "openai";
import { type Tool } from "./tools";
import { defaultSystemPrompt } from "./prompts";

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

/**
 * Collect tool call request segments in each chunk, and combine them into complete tool call requests
 * @param toolCallRequests tool call request list
 * @param deltaToolCalls tool call request
 * @returns tool call request list
 */
const collectToolCallRequests = (
  toolCallRequests: ToolCallRequest[],
  deltaToolCalls: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[],
): ToolCallRequest[] => {
  for (const toolCall of deltaToolCalls) {
    const { index, id, function: { name = "", arguments: args = "" } = {} } = toolCall;
    if (id) {
      toolCallRequests[index] = toolCallRequest(id, name, args);
    } else if (index < toolCallRequests.length && toolCallRequests[index]) {
      toolCallRequests[index].name += name;
      toolCallRequests[index].arguments += args;
    }
  }
  return toolCallRequests;
}

/**
 * Run an agentic iteration
 * @param openAI openai client
 * @param params openai completion params
 * @yields text chunks
 * @returns tool call request list
 */
const runAgenticIteration = async function* (
  openAI: OpenAI,
  params: OpenAI.ChatCompletionCreateParams
): AsyncGenerator<string, ToolCallRequest[], void> {
  const toolCallRequests: ToolCallRequest[] = [];

  for await (const chunk of await openAI.chat.completions.create({
    ...params,
    stream: true,
  })) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      yield delta.content;
    }
    collectToolCallRequests(toolCallRequests, delta?.tool_calls ?? []);
  }
  return toolCallRequests;
}


export const makeAgent = ({
  tools,
  model,
  openAI,
  systemPrompt = defaultSystemPrompt,
}: {
  tools: Tool[],
  model: string,
  openAI: OpenAI,
  systemPrompt?: string,
}) => async function * (message: string): AsyncGenerator<AgentOutputChunk> {
  // Initialize message history
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
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

    const chunks = runAgenticIteration(
      openAI,
      tools.length > 0 ? {
        model,
        messages,
        tools: tools.map(tool => tool.definition),
        tool_choice: "auto",
        parallel_tool_calls: true,
      } : {
        model,
        messages,
      }
    );

    messages.push(assistantMessage);

    hasMoreIterations = false;

    for await (const chunk of chunks) {
      assistantMessage.content += chunk;
      yield textChunk(chunk);
    }

    const toolCallRequests = (await chunks.next()).value as ToolCallRequest[];

    for (const toolCallRequest of toolCallRequests) {
      hasMoreIterations = true;
      yield toolCallRequest;
      const tool = toolMap[toolCallRequest.name];
      if (tool) {
        if (!assistantMessage.tool_calls) {
          assistantMessage.tool_calls = [];
        }
        assistantMessage.tool_calls.push({
          id: toolCallRequest.id,
          type: "function",
          function: {
            name: toolCallRequest.name,
            arguments: toolCallRequest.arguments,
          }
        });
        const result = await tool.call(toolCallRequest.arguments);
        messages.push({
          role: "tool",
          content: result,
          tool_call_id: toolCallRequest.id,
        });
        yield toolCallResponse(toolCallRequest.id, result);
      }
    }
  }
}



import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { ChatMistralAI } from "@langchain/mistralai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env from .env.development for local, or use environment variables in Docker
dotenv.config({ path: ".env.development" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const IS_DOCKER = process.env.IS_DOCKER === "true";

// Simple logger
const log = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data ? JSON.stringify(data) : ''),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err?.message || err),
  debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data ? JSON.stringify(data) : ''),
};

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store for active sessions
const sessions = new Map();

// MCP Client setup
let mcpClient = null;
let mcpTools = [];

// Helper to send WebSocket message safely
function wsSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

async function initMCPClient() {
  try {
    const mcpServerPath = IS_DOCKER
      ? "/app/mcp-server/src/index.js"
      : path.resolve(__dirname, "../../mcp-server/src/index.js");

    log.info("Starting MCP server", { path: mcpServerPath });

    const transport = new StdioClientTransport({
      command: "node",
      args: [mcpServerPath],
      env: { ...process.env },
    });

    mcpClient = new Client(
      { name: "map-bot-backend", version: "1.0.0" },
      { capabilities: {} }
    );

    await mcpClient.connect(transport);
    log.info("MCP server connected");

    const toolsResponse = await mcpClient.listTools();
    log.info(`Loaded ${toolsResponse.tools.length} tools`, {
      tools: toolsResponse.tools.map((t) => t.name),
    });

    // Convert MCP tools to LangChain tools
    mcpTools = toolsResponse.tools.map((tool) => {
      const zodSchema = jsonSchemaToZod(tool.inputSchema);

      return new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: zodSchema,
        func: async (input) => {
          log.info(`>> Tool: ${tool.name}`, input);

          const startTime = Date.now();
          const result = await mcpClient.callTool({
            name: tool.name,
            arguments: input,
          });
          const duration = Date.now() - startTime;

          const responseText = result.content[0].text;

          try {
            const parsed = JSON.parse(responseText);
            if (parsed.error) {
              log.error(`<< Tool Error: ${tool.name} (${duration}ms)`, parsed.error);
            } else {
              const resultCount = Array.isArray(parsed.result) ? parsed.result.length : 1;
              log.info(`<< Tool OK: ${tool.name} (${duration}ms) - ${resultCount} result(s)`);
            }
          } catch {
            log.info(`<< Tool OK: ${tool.name} (${duration}ms)`);
          }

          return responseText;
        },
      });
    });
  } catch (error) {
    log.error("Failed to initialize MCP client", error);
    throw error;
  }
}

// Helper to convert JSON Schema to Zod schema
function jsonSchemaToZod(jsonSchema) {
  const properties = jsonSchema.properties || {};
  const required = jsonSchema.required || [];

  const zodProps = {};
  for (const [key, prop] of Object.entries(properties)) {
    let zodType;
    switch (prop.type) {
      case "string":
        zodType = prop.enum ? z.enum(prop.enum) : z.string();
        break;
      case "number":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      default:
        zodType = z.any();
    }

    if (prop.description) {
      zodType = zodType.describe(prop.description);
    }

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    zodProps[key] = zodType;
  }

  return z.object(zodProps);
}

// Create streaming agent
function createAgent() {
  const llm = new ChatMistralAI({
    model: "mistral-large-latest",
    apiKey: process.env.MISTRAL_API_KEY,
    temperature: 0.1,
    streaming: true,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a helpful Map assistant powered by OpenStreetMap. You help users find places, get directions, and explore locations.

When you use tools, the results will include a "mapAction" that tells the frontend how to display the results on the map.

Always be helpful and provide useful information about the places and directions you find. Format your responses nicely with relevant details.

When showing search results:
- List the places with their names and addresses
- Mention that they are now shown on the map

When showing directions:
- Provide the total distance and duration
- Give a summary of key steps
- Mention the route is displayed on the map

Be conversational and helpful!`,
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = createToolCallingAgent({
    llm,
    tools: mcpTools,
    prompt,
  });

  return new AgentExecutor({
    agent,
    tools: mcpTools,
    verbose: false,
    returnIntermediateSteps: true,
  });
}

// Extract text from various chunk formats
function extractTextFromChunk(chunk, eventName) {
  if (!chunk) return '';

  // Log the raw chunk structure for debugging
  log.debug(`Chunk from ${eventName}`, {
    hasContent: 'content' in chunk,
    contentType: typeof chunk.content,
    hasText: 'text' in chunk,
    hasKwargs: 'kwargs' in chunk,
    hasLc_kwargs: 'lc_kwargs' in chunk,
    keys: Object.keys(chunk),
  });
  
  // Direct string content
  if (typeof chunk.content === 'string' && chunk.content) {
    return chunk.content;
  }
  
  // Array of content parts (common in newer LangChain)
  if (Array.isArray(chunk.content) && chunk.content.length > 0) {
    const text = chunk.content
      .map(part => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .join('');
    if (text) return text;
  }
  
  // Check for text property directly
  if (chunk.text) {
    return chunk.text;
  }
  
  // AIMessageChunk format with kwargs
  if (chunk.kwargs?.content) {
    if (typeof chunk.kwargs.content === 'string') {
      return chunk.kwargs.content;
    }
    if (Array.isArray(chunk.kwargs.content) && chunk.kwargs.content.length > 0) {
      return chunk.kwargs.content
        .map(part => part?.text || part?.content || (typeof part === 'string' ? part : ''))
        .join('');
    }
  }

  // LangChain lc_kwargs format
  if (chunk.lc_kwargs?.content) {
    if (typeof chunk.lc_kwargs.content === 'string') {
      return chunk.lc_kwargs.content;
    }
  }

  // Try message property (some providers use this)
  if (chunk.message?.content) {
    if (typeof chunk.message.content === 'string') {
      return chunk.message.content;
    }
  }
  
  return '';
}

// WebSocket connection handler
wss.on("connection", (ws) => {
  const sessionId = Date.now().toString().slice(-6);
  sessions.set(sessionId, { chatHistory: [], ws });

  log.info(`New connection: ${sessionId}`);

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());
      const session = sessions.get(sessionId);

      if (message.type === "chat") {
        const userMessage = message.content;
        log.info(`[${sessionId}] User: "${userMessage}"`);

        // Send thinking indicator
        wsSend(ws, { type: "thinking", status: "Thinking..." });

        const startTime = Date.now();

        try {
          const agent = createAgent();

          // Track streaming state
          let fullResponse = "";
          let mapAction = null;
          let toolsUsed = [];
          let streamStarted = false;

          // Custom callbacks for streaming
          const callbacks = [
            {
              handleLLMNewToken(token) {
                if (token) {
                  if (!streamStarted) {
                    streamStarted = true;
                    log.info(`[${sessionId}] Stream started`);
                    wsSend(ws, { type: "thinking", status: null });
                  }
                  fullResponse += token;
                  wsSend(ws, { type: "stream", content: token });
                }
              },
              handleToolStart(tool, input) {
                const toolName = tool.name;
                toolsUsed.push(toolName);
                log.info(`[${sessionId}] Tool start: ${toolName}`);
                wsSend(ws, {
                  type: "thinking",
                  status: `Using ${toolName.replace(/_/g, " ")}...`,
                });
              },
              handleToolEnd(output) {
                try {
                  const parsed = JSON.parse(output);
                  if (parsed.mapAction) {
                    mapAction = parsed.mapAction;
                    log.info(`[${sessionId}] Map action: ${mapAction.type} - sending immediately`);
                    // Send map action immediately so map updates while LLM generates response
                    wsSend(ws, { type: "map_action", mapAction });
                  }
                } catch (e) {
                  // Not JSON, ignore
                }
                wsSend(ws, { type: "thinking", status: "Generating response..." });
              },
            },
          ];

          // Try using streamEvents with callbacks as fallback
          const stream = await agent.streamEvents(
            {
              input: userMessage,
              chat_history: session.chatHistory,
            },
            { 
              version: "v2",
              callbacks,
            }
          );

          for await (const event of stream) {
            const eventType = event.event;

            // Debug logging for understanding event structure
            if (eventType.includes("stream") || eventType.includes("chat_model")) {
              log.debug(`Event: ${eventType}`, {
                name: event.name,
                hasChunk: !!event.data?.chunk,
                chunkKeys: event.data?.chunk ? Object.keys(event.data.chunk) : [],
              });
            }

            // Tool events (backup if callbacks don't fire)
            if (eventType === "on_tool_start" && !toolsUsed.includes(event.name)) {
              const toolName = event.name;
              toolsUsed.push(toolName);
              log.info(`[${sessionId}] Tool start: ${toolName}`);
              wsSend(ws, {
                type: "thinking",
                status: `Using ${toolName.replace(/_/g, " ")}...`,
              });
            }

            if (eventType === "on_tool_end" && !mapAction) {
              try {
                const toolOutput = event.data?.output;
                if (toolOutput) {
                  const parsed = JSON.parse(toolOutput);
                  if (parsed.mapAction) {
                    mapAction = parsed.mapAction;
                    log.info(`[${sessionId}] Map action: ${mapAction.type} - sending immediately`);
                    // Send map action immediately so map updates while LLM generates response
                    wsSend(ws, { type: "map_action", mapAction });
                  }
                }
              } catch (e) {
                // Not JSON, ignore
              }
              wsSend(ws, { type: "thinking", status: "Generating response..." });
            }

            // Handle streaming - try multiple formats
            if (eventType === "on_chat_model_stream") {
              const chunk = event.data?.chunk;
              const text = extractTextFromChunk(chunk, eventType);

              if (text && !fullResponse.includes(text)) {
                if (!streamStarted) {
                  streamStarted = true;
                  log.info(`[${sessionId}] Stream started (from event)`);
                  wsSend(ws, { type: "thinking", status: null });
                }
                fullResponse += text;
                wsSend(ws, { type: "stream", content: text });
              }
            }

            // Final output fallback
            if (eventType === "on_chain_end" && event.name === "AgentExecutor") {
              const output = event.data?.output?.output;
              if (output && !streamStarted) {
                fullResponse = output;
                log.info(`[${sessionId}] Non-streaming response received`);
              }
            }
          }

          const duration = Date.now() - startTime;
          log.info(`[${sessionId}] Response in ${duration}ms (${toolsUsed.length} tools, streamed: ${streamStarted})`);

          // Send stream end with map action
          wsSend(ws, {
            type: "stream_end",
            content: fullResponse,
            mapAction,
          });

          // Update chat history
          if (userMessage?.trim()) {
            session.chatHistory.push(new HumanMessage(userMessage));
          }
          if (fullResponse?.trim()) {
            session.chatHistory.push(new AIMessage(fullResponse));
          }

          // Keep history manageable
          if (session.chatHistory.length > 20) {
            session.chatHistory = session.chatHistory.slice(-20);
          }

        } catch (error) {
          log.error(`[${sessionId}] Agent error`, error);
          wsSend(ws, {
            type: "error",
            content: "Sorry, I encountered an error processing your request. Please try again.",
          });
        }

        // Clear thinking status
        wsSend(ws, { type: "thinking", status: null });
      }
    } catch (error) {
      log.error("Message handling error", error);
    }
  });

  ws.on("close", () => {
    sessions.delete(sessionId);
    log.info(`Connection closed: ${sessionId}`);
  });

  // Send welcome message
  wsSend(ws, {
    type: "response",
    content:
      "👋 Hello! I'm your Map assistant powered by OpenStreetMap. I can help you:\n\n• **Search for places** - restaurants, cafes, hotels, etc.\n• **Get directions** - driving, walking, or cycling\n• **Find nearby places** - search by location and type\n• **Geocode addresses** - convert addresses to coordinates\n\nTry asking me something like:\n- \"Find cafes near Times Square\"\n- \"How do I get from Central Park to Brooklyn Bridge?\"\n- \"What restaurants are near latitude 40.7128, longitude -74.0060?\"",
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", mcpConnected: mcpClient !== null });
});

// Start server
async function start() {
  log.info("Starting Map Bot server...");

  try {
    await initMCPClient();

    server.listen(PORT, () => {
      log.info(`Server running on port ${PORT}`);
      log.info(`WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    log.error("Failed to start server", error);
    process.exit(1);
  }
}

start();

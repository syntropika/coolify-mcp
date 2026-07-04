#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createCoolifyRequest } from "./client.js";
import { loadConfig, requireExecuteConfig } from "./config.js";
import { runCodeMode } from "./codemode.js";
import {
  COOLIFY_AGENT_INSTRUCTIONS,
  EXECUTE_TOOL_DESCRIPTION,
  SEARCH_TOOL_DESCRIPTION,
  getGuide,
  stringifyToolResult,
} from "./guidance.js";

const config = loadConfig();
const server = new McpServer(
  {
    name: "coolify-code-mode-mcp",
    version: "0.1.0",
  },
  {
    instructions: COOLIFY_AGENT_INSTRUCTIONS,
  },
);

const codeDescription = `JavaScript to run as Code Mode. Prefer an async function:

async () => {
  const operations = await codemode.findOperations({ query: "deploy" });
  return operations;
}

The sandbox exposes codemode, console, URL, and URLSearchParams.`;

server.registerTool(
  "guide",
  {
    description: `Get Coolify-specific operating guidance before using search or execute.

Use this when the user asks for deployments, logs, environment variables, lifecycle actions, deletes, backups, resource discovery, or output formatting and you need the safest workflow. This is the local Coolify equivalent of a docs/workflow tool; it does not require credentials.`,
    inputSchema: {
      topic: z
        .string()
        .optional()
        .describe(
          "Optional guide topic: overview, discovery, deployments, logs, environment, lifecycle, deletion, backups, or formatting.",
        ),
    },
    annotations: {
      title: "Coolify guide",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ topic }) => asTextContent(getGuide(topic)),
);

server.registerTool(
  "search",
  {
    description: SEARCH_TOOL_DESCRIPTION,
    inputSchema: {
      code: z.string().min(1).describe(codeDescription),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .max(60_000)
        .optional()
        .describe("Execution timeout in milliseconds. Defaults to COOLIFY_CODE_TIMEOUT_MS or 15000."),
    },
    annotations: {
      title: "Search Coolify operations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ code, timeoutMs }) => {
    const output = await runCodeMode(code, {
      timeoutMs: timeoutMs ?? config.codeTimeoutMs,
      includeRequest: false,
    });

    return asJsonContent(output);
  },
);

server.registerTool(
  "execute",
  {
    description: EXECUTE_TOOL_DESCRIPTION,
    inputSchema: {
      code: z.string().min(1).describe(codeDescription),
      allowDestructive: z
        .boolean()
        .default(false)
        .describe("Required to permit DELETE requests. Defaults to false."),
      dryRun: z
        .boolean()
        .default(false)
        .describe("If true, return request plans without sending HTTP requests."),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .max(120_000)
        .optional()
        .describe("Execution timeout in milliseconds. Defaults to COOLIFY_CODE_TIMEOUT_MS or 15000."),
    },
    annotations: {
      title: "Execute Coolify API calls",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ code, allowDestructive, dryRun, timeoutMs }) => {
    requireExecuteConfig(config);

    const request = createCoolifyRequest({
      baseUrl: config.baseUrl,
      apiToken: config.apiToken,
      requestTimeoutMs: config.requestTimeoutMs,
      allowDestructive,
      dryRun,
    });

    const output = await runCodeMode(code, {
      timeoutMs: timeoutMs ?? config.codeTimeoutMs,
      request,
      includeRequest: true,
    });

    return asJsonContent(output);
  },
);

function asJsonContent(value: unknown) {
  return asTextContent(stringifyToolResult(value));
}

function asTextContent(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);

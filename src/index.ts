#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createCoolifyRequest } from "./client.js";
import { loadConfig, requireExecuteConfig } from "./config.js";
import { runCodeMode } from "./codemode.js";

const config = loadConfig();
const server = new McpServer({
  name: "coolify-code-mode-mcp",
  version: "0.1.0",
});

const codeDescription = `JavaScript to run as Code Mode. Prefer an async function:

async () => {
  const operations = await codemode.findOperations({ query: "deploy" });
  return operations;
}

The sandbox exposes codemode, console, URL, and URLSearchParams.`;

server.tool(
  "search",
  `Search the embedded Coolify OpenAPI document and operation catalog with model-written JavaScript.

Use this before execute to discover operationId values, paths, parameters, request bodies, and response shapes. The full OpenAPI document stays inside the sandbox unless your code returns part of it.

Available APIs:
- await codemode.spec()
- await codemode.operations()
- await codemode.operation(operationId)
- await codemode.findOperations({ query, tags, methods, pathIncludes, limit })`,
  {
    code: z.string().min(1).describe(codeDescription),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(60_000)
      .optional()
      .describe("Execution timeout in milliseconds. Defaults to COOLIFY_CODE_TIMEOUT_MS or 15000."),
  },
  async ({ code, timeoutMs }) => {
    const output = await runCodeMode(code, {
      timeoutMs: timeoutMs ?? config.codeTimeoutMs,
      includeRequest: false,
    });

    return asJsonContent(output);
  },
);

server.tool(
  "execute",
  `Execute model-written JavaScript against Coolify with an authenticated request helper.

Use this to perform one or more Coolify API calls in a single MCP tool call. Intermediate data stays inside the sandbox; return only the final result needed by the user.

Available APIs:
- all search APIs
- await codemode.request({ operationId, pathParams, query, body, headers, throwOnError })
- await codemode.request({ method, path, pathParams, query, body, headers, throwOnError })

The Coolify API token is never exposed to generated code. DELETE requests require allowDestructive: true on this outer tool call.`,
  {
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
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);

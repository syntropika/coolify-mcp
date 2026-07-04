# Coolify Code Mode MCP

This project exposes the full Coolify API to AI agents through a Cloudflare-style Code Mode MCP interface.

Instead of registering one MCP tool for every Coolify endpoint, the server exposes two tools:

- `search`: run JavaScript against the embedded Coolify OpenAPI document and operation catalog.
- `execute`: run JavaScript with an authenticated `codemode.request()` helper that can call multiple Coolify API operations inside one MCP tool call.

The generated catalog is based on the current Coolify `v4.x` OpenAPI document and covers 136 operations across Applications, Cloud Tokens, Databases, Deployments, GitHub Apps, Hetzner, Private Keys, Projects, Resources, Scheduled Tasks, Servers, Services, System, and Teams.

## Install

```bash
bun install
bun run generate
bun run build
```

`bun run build` writes a self-contained executable to:

```bash
dist/coolify-mcp
```

## Configure

Set these environment variables in the MCP client:

```bash
COOLIFY_BASE_URL=https://coolify.example.com
COOLIFY_API_TOKEN=your-coolify-api-token
```

`COOLIFY_BASE_URL` may be either the instance origin or the API root. Both of these work:

```bash
https://coolify.example.com
https://coolify.example.com/api/v1
```

Optional settings:

```bash
COOLIFY_OPENAPI_PATH=/absolute/path/to/openapi/coolify-openapi.json
COOLIFY_REQUEST_TIMEOUT_MS=30000
COOLIFY_CODE_TIMEOUT_MS=15000
```

## MCP Client Config

```json
{
  "mcpServers": {
    "coolify": {
      "command": "/absolute/path/to/projects/coolify-mcp/dist/coolify-mcp",
      "args": [],
      "env": {
        "COOLIFY_BASE_URL": "https://coolify.example.com",
        "COOLIFY_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Code Mode Examples

Find relevant operations:

```js
async () => {
  return codemode.findOperations({
    query: "application environment variables",
    tags: ["Applications"]
  });
}
```

Deploy every application tagged `production` in one MCP call:

```js
async () => {
  const apps = await codemode.request({
    operationId: "list-applications",
    query: { tag: "production" }
  });

  const deployments = [];
  for (const app of apps.data) {
    const deployment = await codemode.request({
      operationId: "deploy-by-tag-or-uuid",
      query: { uuid: app.uuid }
    });
    deployments.push({
      application: app.name,
      uuid: app.uuid,
      status: deployment.status,
      data: deployment.data
    });
  }

  return deployments;
}
```

Delete a resource in one call, with explicit destructive permission:

```js
async () => {
  return codemode.request({
    operationId: "delete-service-by-uuid",
    pathParams: { uuid: "service-uuid" }
  });
}
```

The MCP `execute` call must include `allowDestructive: true` for `DELETE` operations.

## Tool Contract

### `search`

Input:

```json
{
  "code": "async () => { return codemode.findOperations({ query: 'deploy' }); }",
  "timeoutMs": 15000
}
```

Available sandbox API:

- `codemode.spec()`
- `codemode.operations()`
- `codemode.operation(operationId)`
- `codemode.findOperations(criteria)`

### `execute`

Input:

```json
{
  "code": "async () => { return codemode.request({ operationId: 'list-projects' }); }",
  "allowDestructive": false,
  "dryRun": false,
  "timeoutMs": 15000
}
```

Available sandbox API:

- all `search` APIs
- `codemode.request(request)`

`codemode.request()` accepts:

```ts
type CoolifyRequest = {
  operationId?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path?: string;
  pathParams?: Record<string, string | number | boolean>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  throwOnError?: boolean;
};
```

Prefer `operationId` plus `pathParams` when possible. Raw `method` and `path` are supported for forward compatibility with new Coolify endpoints.

## Safety Model

The Coolify API token stays in the host process. Model-written code receives a request function, not the token.

By default:

- `DELETE` requests are blocked unless `allowDestructive` is true on the outer `execute` call.
- `dryRun` records request plans without sending HTTP requests.
- generated code has no `require`, `process`, filesystem, or direct `fetch` binding.

This local Node.js sandbox is a guardrail, not a hard production isolation boundary like Cloudflare Workers. Run it only for trusted MCP clients and rely on Coolify token scopes for final authorization.

## Documentation

- [Code Mode guide](docs/code-mode.md)
- [Operation coverage](docs/operations.md)
- [Agent skill](skills/coolify-code-mode/SKILL.md)

## Verify

```bash
bun run verify
```

The verification regenerates the OpenAPI catalog and runs tests that prove every operation in the embedded OpenAPI spec is discoverable and addressable through Code Mode.

# Code Mode Design

The Coolify MCP server follows the search-and-execute Code Mode pattern used for large OpenAPI APIs.

## Why Search And Execute

Coolify currently exposes 136 API operations. Registering every endpoint as a native MCP tool would force the model to load every operation schema before it knows which operation it needs.

This server exposes two compact tools:

- `search`: inspect the embedded OpenAPI document and operation catalog.
- `execute`: run authenticated Coolify API calls through `codemode.request()`.

Operation coverage is verified by the generated OpenAPI catalog, generated operation documentation, and tests.

## Search Runtime

`search` runs model-written JavaScript without Coolify credentials. Use it to find operation IDs, required path parameters, query parameters, and request body presence.

Available API:

```ts
codemode.spec(): Promise<OpenApiSpec>
codemode.operations(): Promise<OperationCatalogEntry[]>
codemode.operation(operationId: string): Promise<OperationCatalogEntry>
codemode.findOperations(criteria?: OperationSearchCriteria): Promise<OperationCatalogEntry[]>
```

Example:

```js
async () => {
  return codemode.findOperations({
    query: "database backup",
    tags: ["Databases"]
  });
}
```

## Execute Runtime

`execute` includes the search runtime plus:

```ts
codemode.request(input: CoolifyRequest): Promise<CoolifyResponse | DryRunRequest>
```

Prefer operation IDs:

```js
async () => {
  const project = await codemode.request({
    operationId: "get-project-by-uuid",
    pathParams: { uuid: "project-uuid" },
    throwOnError: true
  });

  const environments = await codemode.request({
    operationId: "get-environments",
    pathParams: { uuid: "project-uuid" },
    throwOnError: true
  });

  return { project: project.data, environments: environments.data };
}
```

Raw method/path calls are allowed for forward compatibility:

```js
async () => {
  return codemode.request({
    method: "GET",
    path: "/health"
  });
}
```

## Multi-Operation Calls

The agent can perform dependent operations in one outer MCP call:

```js
async () => {
  const apps = await codemode.request({ operationId: "list-applications" });

  const results = [];
  for (const app of apps.data.filter((item) => item.status === "running")) {
    const logs = await codemode.request({
      operationId: "get-application-logs-by-uuid",
      pathParams: { uuid: app.uuid }
    });
    results.push({ name: app.name, logs: logs.data });
  }

  return results;
}
```

Only `results` returns to the model context. The full application list and intermediate HTTP responses stay inside the Code Mode runtime.

## Destructive Operations

`DELETE` requests are blocked unless the outer `execute` call includes `allowDestructive: true`.

Use `dryRun: true` to inspect the request plan first:

```json
{
  "code": "async () => codemode.request({ operationId: 'delete-service-by-uuid', pathParams: { uuid: '...' } })",
  "dryRun": true
}
```

Then run the same code with:

```json
{
  "allowDestructive": true,
  "dryRun": false
}
```

## Sandbox Boundary

The generated code receives `codemode`, `console`, `URL`, and `URLSearchParams`.

It does not receive:

- `process`
- `require`
- filesystem APIs
- direct `fetch`
- the Coolify API token

The token remains in the MCP host process and is only used by the request callback. This Node.js sandbox is suitable as a local guardrail for trusted agent clients; use Coolify API token scopes as the final permission boundary.

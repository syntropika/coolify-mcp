# Tool reference

[Back to the README](../README.md)

The local stdio server exposes `guide`, `search`, and `execute`. Code Mode functions receive `codemode`, `console`, `URL`, and `URLSearchParams`.

## `guide`

Get Coolify workflow guidance without making API requests or requiring credentials.

```json
{
  "topic": "deletion"
}
```

`topic` is optional. Topics include `overview`, `discovery`, `deployments`, `logs`, `environment`, `lifecycle`, `deletion`, `backups`, and `formatting`.

## `search`

Run JavaScript against the embedded OpenAPI spec and operation catalog. No Coolify credentials are required.

```json
{
  "code": "async () => { return codemode.findOperations({ query: 'deploy' }); }",
  "timeoutMs": 15000
}
```

`code` is required. `timeoutMs` is optional and accepts a positive integer up to `60000`; it defaults to `COOLIFY_CODE_TIMEOUT_MS` or `15000`.

Available sandbox API:

- `codemode.spec()`
- `codemode.specPath()`
- `codemode.operations()`
- `codemode.operation(operationId)`
- `codemode.findOperations(criteria)`
- `codemode.classifyOperation(operationId)`
- `codemode.describeOperation(operationId)`
- `codemode.guide(topic)`
- `codemode.format.tsv(rows)`
- `codemode.format.compact(rows, columns?)`
- `codemode.redactSecrets(value)`

Every operation catalog entry includes:

```ts
type OperationClassification = {
  safetyCategory: "read" | "operational" | "configuration" | "destructive";
  actionType: "read" | "create" | "update" | "delete" | "deploy" | "lifecycle" | "validate" | "system";
  risk: "read" | "low" | "mutating" | "destructive" | "admin";
  mutates: boolean;
  destructive: boolean;
};
```

Use `safetyCategories`, `actionTypes`, `risks`, `mutates`, or `destructive` in `findOperations()` to narrow results. Other filters include `query`, `tags`, `methods`, `pathIncludes`, and `limit`. Search terms are matched against catalog text; all terms must match. Use `describeOperation()` to inspect parameters, request bodies, responses, and guidance before calling an unfamiliar operation.

## `execute`

Run JavaScript with an authenticated request helper. Requires `COOLIFY_BASE_URL` and `COOLIFY_API_TOKEN`, including for dry runs.

```json
{
  "code": "async () => { return codemode.request({ operationId: 'list-projects', throwOnError: true }); }",
  "allowDestructive": false,
  "dryRun": false,
  "timeoutMs": 15000
}
```

`code` is required. `allowDestructive` and `dryRun` default to `false`. `timeoutMs` is optional and accepts a positive integer up to `120000`; it defaults to `COOLIFY_CODE_TIMEOUT_MS` or `15000`.

The sandbox includes all `search` APIs plus `codemode.request(request)`:

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

Prefer `operationId` plus `pathParams` when possible. Raw `method` and `path` are supported for endpoints outside the bundled catalog. Supply either `operationId` or `method` and `path`, never both.

A live request returns `ok`, `status`, `statusText`, `headers`, and `data`. Set `throwOnError: true` to stop the function on a non-success HTTP response. Without it, check `ok` before using `data` or performing dependent operations.

### Preview a request

Set `dryRun: true` on the outer `execute` call:

```json
{
  "code": "async () => { return codemode.request({ operationId: 'deploy-by-tag-or-uuid', query: { uuid: 'application-uuid' } }); }",
  "dryRun": true
}
```

Each request returns a plan without sending HTTP. Plans include the method, URL, path, supplied query and body, and the operation ID when supplied. Catalog operations also include action/risk classification and operation guidance.

Dry runs return plans, not simulated API responses. A workflow that reads `response.data` to build its next request needs real data or known inputs; it cannot discover live resources in dry-run mode. Request bodies can contain secrets, so inspect and redact plans before sharing them.

### DELETE requests

Every DELETE request requires `allowDestructive: true`, including a dry run. For example, this previews a deletion without sending HTTP:

```json
{
  "code": "async () => { return codemode.request({ operationId: 'delete-service-by-uuid', pathParams: { uuid: 'service-uuid' } }); }",
  "allowDestructive": true,
  "dryRun": true
}
```

Run a deletion only with explicit user intent and the correct resource UUID. To execute the approved request, set `dryRun: false` and retain `allowDestructive: true`.

The flag controls DELETE requests only. Other mutations, including deploy/start/stop/restart and system enable/disable, are not blocked by it. Check catalog classifications and the [safety model](../README.md#safety-model).

## Returning results

`search` and `execute` return a JSON-encoded object containing the function's `result` and captured console `logs`. Large tool outputs are truncated, so keep results compact. Intermediate API responses stay inside the runtime unless the code returns or logs them.

Use `codemode.redactSecrets()` before returning environment variables, private keys, cloud tokens, credentials, or headers. It redacts recognized secret field names; review free-form text such as logs separately. Use `codemode.format.tsv()` or `codemode.format.compact()` for large lists.

For multi-operation examples and runtime details, see the [Code Mode guide](code-mode.md).

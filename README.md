# Coolify Code Mode MCP

**Manage your Coolify infrastructure from your AI agent.**

A local Model Context Protocol (MCP) server for developers running applications on Coolify. Give your agent access to application status, deployment logs, environment variables, databases, and more through three tools: `guide`, `search`, and `execute`.

Code Mode lets the agent compose multiple Coolify API calls in one JavaScript function and return the fields you need. Intermediate responses stay inside the function unless the code returns or logs them.

[Quick start](#quick-start) · [Example workflow](#example-workflow) · [Tool reference](docs/tool-reference.md) · [Operation coverage](docs/operations.md)

## Put it to work

Once connected, try prompts like these:

| Task | Prompt |
| --- | --- |
| Check application status | “List my Coolify applications with their names, UUIDs, and statuses. Do not make any changes.” |
| Investigate a deployment | “Inspect the latest deployment and recent logs for application `<uuid>`. Summarize the errors without changing anything.” |
| Inspect configuration | “List the environment variable names for application `<uuid>`. Do not return secret values or make changes.” |
| Plan a deployment | “Show a dry-run request plan to deploy application `<uuid>`. Do not send the deployment request.” |

These are example instructions for your agent. Read the [safety model](#safety-model) before using workflows that change resources.

## Why Code Mode?

Discover the operation you need, combine related calls, and choose what comes back to the conversation.

| Tool | What it does |
| --- | --- |
| `guide` | Provides Coolify workflow guidance for discovery, deployments, logs, environment variables, lifecycle actions, deletion, backups, and formatting. |
| `search` | Inspects the embedded OpenAPI spec to find operation IDs, parameters, request bodies, and risk classifications. No Coolify credentials required. |
| `execute` | Runs one or more authenticated API calls and returns your selected results. Supports request previews with `dryRun`. |

The bundled Coolify `v4.x` OpenAPI snapshot covers **136 operations**, including applications, projects, servers, services, databases, deployments, and backups. See the [full operation catalog](docs/operations.md) for coverage and classifications. Coverage reflects the bundled snapshot; your Coolify instance may expose newer endpoints.

## Quick start

You need Git, **Bun 1.3.8 or newer**, an existing Coolify instance with an API token, and an MCP client that can launch local stdio servers.

### 1. Clone and build

```bash
git clone https://github.com/syntropika/coolify-mcp.git
cd coolify-mcp
bun install --frozen-lockfile
bun run build
```

This builds `dist/coolify-mcp`, a self-contained executable with the bundled API catalog. You do not need to regenerate the OpenAPI spec to get started.

### 2. Connect your MCP client

For clients that use an `mcpServers` configuration, add:

```json
{
  "mcpServers": {
    "coolify": {
      "command": "/absolute/path/to/coolify-mcp/dist/coolify-mcp",
      "args": [],
      "env": {
        "COOLIFY_BASE_URL": "https://coolify.example.com",
        "COOLIFY_API_TOKEN": "your-coolify-api-token"
      }
    }
  }
}
```

Replace the command with the absolute path to your built executable and set your instance URL and token. If your client uses another configuration format, enter the same command and environment variables in its local MCP server settings.

`COOLIFY_BASE_URL` accepts either the instance origin (`https://coolify.example.com`) or the API root (`https://coolify.example.com/api/v1`). Keep the token in your local client configuration and out of version control.

Reload your client's MCP configuration. It should expose `guide`, `search`, and `execute`; the executable communicates over stdio and is launched by the client.

### 3. Make a read-only first request

Ask your agent:

> List my Coolify applications with their names, UUIDs, and statuses. Do not make any changes.

The [example below](#example-workflow) shows the discovery and API call behind that request. Use a token scoped to the operations you intend to permit.

## Example workflow

The agent can get discovery guidance with `guide`:

```json
{
  "topic": "discovery"
}
```

Then pass this JavaScript function as the `code` string to `search` to find read-only application operations:

```js
async () => {
  return codemode.findOperations({
    tags: ["Applications"],
    mutates: false
  });
}
```

To list applications, pass this function as the `code` string to `execute`:

```js
async () => {
  const apps = await codemode.request({
    operationId: "list-applications",
    throwOnError: true
  });

  return codemode.format.compact(apps.data, ["name", "uuid", "status"]);
}
```

This makes a read-only API call and returns only those three fields for each application. For composed workflows and request previews, see the [Code Mode guide](docs/code-mode.md) and [tool reference](docs/tool-reference.md).

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `COOLIFY_BASE_URL` | Coolify instance origin or API root. Required for `execute`. | None |
| `COOLIFY_API_TOKEN` | API token used for Coolify requests. Required for `execute`. | None |
| `COOLIFY_OPENAPI_PATH` | Absolute path to a custom OpenAPI JSON file. | Bundled spec |
| `COOLIFY_REQUEST_TIMEOUT_MS` | Timeout for each HTTP request, in milliseconds. | `30000` |
| `COOLIFY_CODE_TIMEOUT_MS` | Timeout for Code Mode execution, in milliseconds. | `15000` |

`guide` and `search` work without Coolify credentials. `execute` requires both the URL and token, including when `dryRun` is enabled. Each `search` or `execute` call can also set `timeoutMs`; see the [tool reference](docs/tool-reference.md).

## Safety model

- **DELETE is opt-in.** Requests with the `DELETE` method require `allowDestructive: true` on the outer `execute` call, including during a dry run.
- **Other mutations are not gated by that flag.** Deploy, start, stop, restart, enable, and disable may use GET endpoints. The catalog classifies their side effects; the HTTP method alone does not establish whether a call is read-only.
- **Preview requests with `dryRun: true`.** It returns request plans without sending HTTP requests, with classifications and guidance for catalog operations. It does not simulate API responses or validate a workflow against live state.
- **Choose what leaves the runtime.** Use selected fields, `codemode.format.tsv()`, or `codemode.format.compact()` for summaries. Call `codemode.redactSecrets()` before returning environment variables, keys, tokens, credentials, or headers, and inspect the output for secrets.
- **Use trusted clients and scoped tokens.** The token stays in the host process; generated code receives a request helper and has no direct `process`, `require`, filesystem, or `fetch` binding. The Node.js VM is a local guardrail, not a security isolation boundary. Coolify token scopes provide final authorization.

## Documentation

- [Tool reference](docs/tool-reference.md): tool inputs, sandbox APIs, request types, and dry-run behavior.
- [Code Mode guide](docs/code-mode.md): composed workflows and runtime design.
- [Operation coverage](docs/operations.md): every operation in the bundled catalog.
- [Agent skill](skills/coolify-code-mode/SKILL.md): reusable guidance for agents operating Coolify.

## Contributing

Found a confusing setup step or an operation that needs better guidance? [Open an issue](https://github.com/syntropika/coolify-mcp/issues) with a reproducible example and secrets removed. Documentation improvements and focused pull requests are welcome.

Check the bundled snapshot before submitting a change:

```bash
bun run typecheck
bun test tests/*.test.mjs
bun run build
```

For maintainers, `bun run generate` fetches the upstream Coolify `v4.x` OpenAPI spec and rewrites the bundled spec and operation docs. Review catalog changes and update the coverage expectations when refreshing it. `bun run verify` performs that refresh before typechecking, tests, and a build, so it can surface upstream changes beyond your local edit.

If this is useful for your Coolify setup, star the repository to help others find it.

## License

[MIT](LICENSE).

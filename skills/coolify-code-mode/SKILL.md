---
name: coolify-code-mode
description: Manage Coolify through the Coolify Code Mode MCP server. Use when an agent needs to inspect or operate Coolify projects, environments, applications, services, databases, servers, deployments, backups, scheduled tasks, private keys, GitHub apps, cloud tokens, Hetzner resources, teams, or API/system endpoints through the `search` and `execute` Code Mode tools.
---

# Coolify Code Mode

Use the Coolify MCP server through Code Mode. Prefer `search` for discovery and `execute` for operational work.

## Workflow

1. Call `search` unless you already know the exact operation IDs and parameters.
2. In `search`, use `codemode.findOperations()` first. Use `codemode.operation()` or `codemode.spec()` only when you need more detail.
3. Call `execute` with one JavaScript function that performs all dependent Coolify calls and returns only the final result needed by the user.
4. Use `operationId` and `pathParams` instead of hard-coded raw paths when possible.
5. Use `throwOnError: true` when a failed HTTP response should stop the workflow.

## Search Examples

Find deployment operations:

```js
async () => {
  return codemode.findOperations({ query: "deploy", limit: 20 });
}
```

Find application environment variable operations:

```js
async () => {
  return codemode.findOperations({
    query: "env",
    tags: ["Applications"]
  });
}
```

## Execute Examples

List projects and their environments in one call:

```js
async () => {
  const projects = await codemode.request({
    operationId: "list-projects",
    throwOnError: true
  });

  const results = [];
  for (const project of projects.data) {
    const environments = await codemode.request({
      operationId: "get-environments",
      pathParams: { uuid: project.uuid },
      throwOnError: true
    });
    results.push({
      project: project.name,
      uuid: project.uuid,
      environments: environments.data
    });
  }

  return results;
}
```

Deploy all applications with a tag:

```js
async () => {
  const apps = await codemode.request({
    operationId: "list-applications",
    query: { tag: "production" },
    throwOnError: true
  });

  const deployments = [];
  for (const app of apps.data) {
    const result = await codemode.request({
      operationId: "deploy-by-tag-or-uuid",
      query: { uuid: app.uuid },
      throwOnError: true
    });
    deployments.push({ application: app.name, uuid: app.uuid, deployment: result.data });
  }

  return deployments;
}
```

## Safety

For `DELETE` operations:

- Run `execute` with `dryRun: true` first when practical.
- Require explicit user intent before passing `allowDestructive: true`.
- Return the affected resource IDs and Coolify responses.

For credentials and secrets:

- Do not return private key material, tokens, or secret environment values unless the user explicitly asks and has a clear operational need.
- Prefer summaries for private keys, cloud tokens, and environment variables.

For broad changes:

- Search first, list the exact resources that match, and execute only against those resources.
- Use `throwOnError: true` for workflows where partial completion would be confusing.
- Return a result object with successes and failures when partial completion is acceptable.

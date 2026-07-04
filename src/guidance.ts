import type { HttpMethod, OperationClassification } from "./types.js";

const CHARS_PER_TOKEN = 4;
const MAX_TOOL_RESULT_TOKENS = 6_000;
const MAX_TOOL_RESULT_CHARS = CHARS_PER_TOKEN * MAX_TOOL_RESULT_TOKENS;

const SECRET_KEY_PATTERN =
  /(^|_|\b)(secret|token|password|passwd|passphrase|private[_-]?key|api[_-]?key|access[_-]?key|credential|auth|bearer)($|_|\b)/i;

export const COOLIFY_AGENT_INSTRUCTIONS = `# Coolify Code Mode MCP

Operate Coolify through a Cloudflare-style Code Mode workflow.

Core workflow:
1. Use guide when you need Coolify-specific operating rules.
2. Use search before execute unless you already know the exact operationId and required parameters.
3. Prefer operationId + pathParams over raw method/path calls.
4. In execute, perform dependent API calls in one JavaScript function and return only the final answer the user needs.
5. Keep outputs small. Prefer codemode.format.tsv(), codemode.format.compact(), and targeted fields over returning full resource payloads.
6. Treat UUIDs as the stable identifiers. When the user gives a name, list matching resources first and handle ambiguity explicitly.
7. Do not reveal tokens, private keys, passwords, or secret environment values unless the user explicitly asks and there is a clear operational need.
8. Use dryRun before DELETE operations when practical, and require explicit user intent before allowDestructive: true.

Safety categories:
- read: safe inspection.
- operational: deploy, start, stop, restart, cancel, validate, enable, or disable actions.
- configuration: create or update persistent configuration.
- destructive: delete operations.

This server is local/stdin. It intentionally does not implement Cloudflare-style remote OAuth or multi-tenant hosting.`;

export const SEARCH_TOOL_DESCRIPTION = `Search the embedded Coolify OpenAPI document and operation catalog with model-written JavaScript.

Use this tool when:
- you need operationId values, paths, parameters, request body shape, or response codes;
- the user names a Coolify resource but not a UUID;
- you are about to mutate Coolify and need to confirm the safest operation;
- you need to inspect safetyCategory before execute.

Recommended workflow:
1. Start with codemode.findOperations({ query, tags, safetyCategories, limit }).
2. Use codemode.operation(operationId) for one operation's parameters and safetyCategory.
3. Use codemode.guide(topic) for Coolify workflow guidance.
4. Avoid returning codemode.spec() wholesale; search narrowly.

Available APIs:
- await codemode.spec()
- codemode.specPath()
- await codemode.operations()
- await codemode.operation(operationId)
- await codemode.findOperations({ query, tags, methods, safetyCategories, actionTypes, risks, mutates, destructive, pathIncludes, limit })
- await codemode.classifyOperation(operationId)
- await codemode.describeOperation(operationId)
- codemode.guide(topic?)
- codemode.format.tsv(rows)
- codemode.format.compact(rows, columns?)
- codemode.redactSecrets(value)`;

export const EXECUTE_TOOL_DESCRIPTION = `Execute model-written JavaScript against Coolify with an authenticated request helper.

Use this tool when:
- you need to read live Coolify state;
- you need to perform one or more dependent API calls in one MCP call;
- you need to deploy, inspect deployments/logs, manage environment variables, or operate resources.

Recommended workflow:
1. Search first unless operation IDs and params are already known.
2. Resolve names to UUIDs before acting. If more than one resource matches, return the choices instead of guessing.
3. Use throwOnError: true when partial completion would be confusing.
4. Return summaries, compact tables, or selected fields. Do not return entire lists/log payloads unless asked.
5. Use codemode.redactSecrets() before returning env vars, tokens, keys, or credentials.
6. For DELETE: run dryRun when practical, then require allowDestructive: true only after explicit user intent.
7. For operational actions (deploy/start/stop/restart/cancel): clearly return the affected UUIDs and Coolify response.

Available APIs:
- all search APIs
- await codemode.request({ operationId, pathParams, query, body, headers, throwOnError })
- await codemode.request({ method, path, pathParams, query, body, headers, throwOnError })

The Coolify API token is never exposed to generated code. DELETE requests require allowDestructive: true on this outer tool call.`;

type GuideEntry = {
  title: string;
  aliases: string[];
  body: string;
};

const GUIDE_ENTRIES: GuideEntry[] = [
  {
    title: "overview",
    aliases: ["general", "workflow", "cloudflare-style"],
    body: `Coolify agents should follow a search-plan-execute pattern.

- Use search to discover operation IDs and safetyCategory.
- Use execute for live state and API actions.
- Prefer UUID-based calls. Resolve user-provided names by listing candidate resources first.
- Keep intermediate API responses inside the Code Mode function.
- Return only the result the user needs, preferably compacted or tabular.
- Redact secrets by default.`,
  },
  {
    title: "discovery",
    aliases: ["context", "resources", "projects", "environments", "servers"],
    body: `Resource discovery workflow:

1. list-projects, list-resources, list-applications, list-services, list-databases, or list-servers depending on the user's wording.
2. If the user names a project/environment/resource, match case-insensitively and include UUIDs in the result.
3. If there is exactly one match, continue with that UUID.
4. If there are multiple plausible matches, return a compact choices table and ask for the intended one.
5. Use codemode.format.tsv() for resource tables.`,
  },
  {
    title: "deployments",
    aliases: ["deploy", "deployment", "release"],
    body: `Deployment workflow:

1. Resolve the application UUID or tag first.
2. Use deploy-by-tag-or-uuid with the narrowest query possible: uuid for one app, tag only for explicit tag-wide deploys.
3. For force, pull request, or docker tag deploys, only include query parameters the user requested.
4. After triggering deploy, use list-deployments-by-app-uuid or get-deployment-by-uuid if the user wants status.
5. For failures, fetch application logs and the specific deployment record before explaining likely causes.`,
  },
  {
    title: "logs",
    aliases: ["log", "debug", "diagnose", "troubleshoot"],
    body: `Logs and debugging workflow:

- Use get-application-logs-by-uuid with a small lines value first, usually 100-300.
- For deployment issues, combine get-deployment-by-uuid with recent application logs.
- Return a short diagnosis with the relevant log excerpts, not the full raw log stream.
- If logs are too large, ask for a narrower time/window or return the latest high-signal lines.`,
  },
  {
    title: "environment",
    aliases: ["env", "envs", "variables", "secrets"],
    body: `Environment variable workflow:

1. Use the resource-specific env operations: application, service, or database.
2. Redact values by default with codemode.redactSecrets().
3. Use bulk update only when the user asked for multiple changes or provided a set of variables.
4. Before deleting an env var, identify it by env_uuid from the list operation.
5. Never print secret values unless explicitly requested.`,
  },
  {
    title: "lifecycle",
    aliases: ["start", "stop", "restart", "control"],
    body: `Lifecycle workflow:

- start/stop/restart operations are operational mutations even when the HTTP method is GET.
- Resolve the resource UUID first and return the affected resource name + UUID.
- Include docker_cleanup, force, instant_deploy, or latest only when the user requested those behaviors.
- Use throwOnError: true so failed lifecycle changes stop clearly.`,
  },
  {
    title: "deletion",
    aliases: ["delete", "destroy", "remove", "destructive"],
    body: `Deletion workflow:

1. Treat DELETE operations as destructive.
2. Prefer execute dryRun: true first to show method, URL, operationId, query, and safetyCategory.
3. Only run with allowDestructive: true after explicit user intent.
4. Be careful with delete_configurations, delete_volumes, docker_cleanup, and delete_connected_networks; include them only when requested.
5. Return affected UUIDs and the Coolify response.`,
  },
  {
    title: "backups",
    aliases: ["backup", "database backups", "scheduled backup"],
    body: `Database backup workflow:

- Use get-database-backups-by-uuid to inspect backup configuration.
- Use list-backup-executions for backup history.
- create-database-backup and update-database-backup change persistent configuration.
- delete-backup-configuration-by-uuid and delete-backup-execution-by-uuid are destructive; dry-run first when practical.`,
  },
  {
    title: "formatting",
    aliases: ["format", "output", "compact", "tsv"],
    body: `Output formatting workflow:

- Use codemode.format.tsv(rows) for lists and tables.
- Use codemode.format.compact(rows, columns) to keep only the columns the user needs.
- Use codemode.redactSecrets(value) before returning environment variables, cloud tokens, private keys, headers, or credentials.
- Return counts and pagination hints when lists are long.`,
  },
];

export function getGuide(topic?: string): string {
  if (!topic) {
    return [
      "Coolify guide topics:",
      ...GUIDE_ENTRIES.map((entry) => `- ${entry.title}: ${entry.aliases.join(", ")}`),
      "",
      "Call guide with a topic such as deployments, logs, environment, deletion, backups, or formatting.",
    ].join("\n");
  }

  const normalized = normalizeTopic(topic);
  const entry = GUIDE_ENTRIES.find(
    (candidate) =>
      normalizeTopic(candidate.title) === normalized ||
      candidate.aliases.some((alias) => normalizeTopic(alias) === normalized),
  );

  if (!entry) {
    return `${getGuide()}\n\nNo guide topic matched "${topic}".`;
  }

  return `# ${entry.title}\n\n${entry.body}`;
}

export function classifyOperationTarget(
  method: HttpMethod,
  path: string,
  operationId: string,
): OperationClassification {
  if (method === "DELETE") {
    return {
      safetyCategory: "destructive",
      actionType: "delete",
      risk: "destructive",
      mutates: true,
      destructive: true,
      guidance: "Destructive delete. Prefer dryRun first and require explicit user intent before allowDestructive.",
    };
  }

  const target = `${operationId} ${path}`.toLowerCase();
  if (/(^|[-/])(enable|disable)([-/]|$)/.test(target)) {
    return {
      safetyCategory: "operational",
      actionType: "system",
      risk: "admin",
      mutates: true,
      destructive: false,
      guidance: "Administrative system action. Confirm intent and return the exact endpoint/result.",
    };
  }

  if (operationId.startsWith("deploy-") || path === "/deploy") {
    return {
      safetyCategory: "operational",
      actionType: "deploy",
      risk: "mutating",
      mutates: true,
      destructive: false,
      guidance: "Deployment action. Resolve the target UUID/tag first and return affected resources and deployment status.",
    };
  }

  if (/(^|[-/])(start|stop|restart|cancel)([-/]|$)/.test(target)) {
    return {
      safetyCategory: "operational",
      actionType: "lifecycle",
      risk: "mutating",
      mutates: true,
      destructive: false,
      guidance: "Lifecycle action. Resolve the resource UUID first and include only requested options.",
    };
  }

  if (/(^|[-/])validate([-/]|$)/.test(target)) {
    return {
      safetyCategory: "operational",
      actionType: "validate",
      risk: "low",
      mutates: true,
      destructive: false,
      guidance: "Validation action. Usually low risk, but it may contact external providers or update validation state.",
    };
  }

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    const actionType = operationId.startsWith("create-") ? "create" : "update";
    return {
      safetyCategory: "configuration",
      actionType,
      risk: "mutating",
      mutates: true,
      destructive: false,
      guidance: "Configuration mutation. Use narrow inputs, throwOnError, and return changed fields/UUIDs.",
    };
  }

  return {
    safetyCategory: "read",
    actionType: "read",
    risk: "read",
    mutates: false,
    destructive: false,
    guidance: "Read-only operation. Keep returned fields focused and compact.",
  };
}

export function formatAsTsv(rows: unknown): string {
  if (!Array.isArray(rows)) {
    throw new Error("codemode.format.tsv expects an array of objects.");
  }

  if (rows.length === 0) return "";

  const objectRows = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("codemode.format.tsv expects each row to be an object.");
    }
    return row as Record<string, unknown>;
  });

  const headers = Array.from(
    objectRows.reduce((keys, row) => {
      for (const key of Object.keys(row)) keys.add(key);
      return keys;
    }, new Set<string>()),
  );

  return [
    headers.join("\t"),
    ...objectRows.map((row) => headers.map((header) => escapeTsvValue(row[header])).join("\t")),
  ].join("\n");
}

export function compactRows(rows: unknown, columns?: string[]): unknown {
  if (!Array.isArray(rows)) {
    throw new Error("codemode.format.compact expects an array.");
  }

  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const object = row as Record<string, unknown>;
    const selected = columns ?? inferCompactColumns(object);
    return Object.fromEntries(selected.filter((key) => key in object).map((key) => [key, object[key]]));
  });
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const secretNamedObject = ["name", "key", "variable"].some((field) => {
    const fieldValue = record[field];
    return typeof fieldValue === "string" && SECRET_KEY_PATTERN.test(fieldValue);
  });

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      if (SECRET_KEY_PATTERN.test(key)) {
        return [key, "[REDACTED]"];
      }

      if (key === "value" && (secretNamedObject || looksSecretishValue(item))) {
        return [key, "[REDACTED]"];
      }

      return [key, redactSecrets(item)];
    }),
  );
}

export function stringifyToolResult(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return truncateText(text);
}

export function truncateText(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) {
    return text;
  }

  const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN);
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}

--- TRUNCATED ---
Response was ~${estimatedTokens.toLocaleString()} tokens (limit: ${MAX_TOOL_RESULT_TOKENS.toLocaleString()}). Use guide/search with narrower filters, pagination, compact rows, or a smaller log line count.`;
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function escapeTsvValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/[ "\n\r\t]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function inferCompactColumns(row: Record<string, unknown>): string[] {
  const preferred = [
    "name",
    "uuid",
    "id",
    "status",
    "type",
    "resource_type",
    "fqdn",
    "domains",
    "created_at",
    "updated_at",
  ];
  const selected = preferred.filter((key) => key in row);
  return selected.length > 0 ? selected : Object.keys(row).slice(0, 8);
}

function looksSecretishValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length >= 32 && /^[A-Za-z0-9+/=_-]+$/.test(value)) return true;
  return /^(ghp_|ghs_|sk-|xox|eyJ|-----BEGIN )/.test(value);
}

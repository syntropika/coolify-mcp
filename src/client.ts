import type {
  CoolifyRequestInput,
  CoolifyResponse,
  DryRunRequest,
  HttpMethod,
  OperationCatalogEntry,
} from "./types.js";
import { getOperation } from "./openapi.js";
import { getOperationGuidance } from "./operation-policy.js";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const satisfies readonly HttpMethod[];
const HTTP_METHOD_SET = new Set<string>(HTTP_METHODS);

export type CoolifyClientOptions = {
  baseUrl: string;
  apiToken: string;
  requestTimeoutMs: number;
  allowDestructive: boolean;
  dryRun: boolean;
};

export class CoolifyHttpError extends Error {
  readonly response: CoolifyResponse;

  constructor(message: string, response: CoolifyResponse) {
    super(message);
    this.name = "CoolifyHttpError";
    this.response = response;
  }
}

export function createCoolifyRequest(options: CoolifyClientOptions) {
  return async function request(input: CoolifyRequestInput): Promise<CoolifyResponse | DryRunRequest> {
    const plan = buildRequestPlan(input, options);

    if (plan.method === "DELETE" && !options.allowDestructive) {
      throw new Error(
        `Blocked destructive operation ${input.operationId ?? `${plan.method} ${plan.path}`}. ` +
          "Pass allowDestructive: true to the outer execute tool call to permit DELETE requests.",
      );
    }

    if (options.dryRun) {
      return {
        dryRun: true,
        method: plan.method,
        url: plan.url.toString(),
        operationId: input.operationId,
        path: plan.path,
        safetyCategory: plan.operation?.safetyCategory,
        actionType: plan.operation?.actionType,
        risk: plan.operation?.risk,
        mutates: plan.operation?.mutates,
        destructive: plan.operation?.destructive,
        guidance: plan.operation ? getOperationGuidance(plan.operation) : undefined,
        query: input.query,
        body: input.body,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs);

    try {
      const response = await fetch(plan.url, {
        method: plan.method,
        headers: {
          Authorization: `Bearer ${options.apiToken}`,
          Accept: "application/json",
          ...plan.headers,
        },
        body: plan.body,
        signal: controller.signal,
      });

      const result = await toCoolifyResponse(response);

      if (input.throwOnError && !result.ok) {
        throw new CoolifyHttpError(
          `Coolify request failed with ${result.status} ${result.statusText}`,
          result,
        );
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function buildRequestPlan(
  input: CoolifyRequestInput,
  options: Pick<CoolifyClientOptions, "baseUrl">,
): {
  method: HttpMethod;
  path: string;
  url: URL;
  headers: Record<string, string>;
  body: BodyInit | undefined;
  operation?: OperationCatalogEntry;
} {
  const target = resolveRequestTarget(input);

  const resolvedPath = applyPathParams(target.path, input.pathParams ?? {});
  const url = buildCoolifyUrl(options.baseUrl, resolvedPath);
  appendQuery(url, input.query ?? {});

  const headers: Record<string, string> = {
    ...(input.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (input.body !== undefined) {
    headers["Content-Type"] ??= "application/json";
    body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  }

  return {
    method: target.method,
    path: resolvedPath,
    url,
    headers,
    body,
    operation: target.operation,
  };
}

function resolveRequestTarget(input: CoolifyRequestInput): {
  method: HttpMethod;
  path: string;
  operation?: OperationCatalogEntry;
} {
  if (input.operationId) {
    if (input.method !== undefined || input.path !== undefined) {
      throw new Error("Coolify request accepts either operationId or method/path, not both.");
    }

    const operation = getOperation(input.operationId);
    if (!operation) {
      throw new Error(`Unknown Coolify operationId: ${input.operationId}`);
    }

    return {
      method: operation.method,
      path: operation.path,
      operation,
    };
  }

  if (input.method === undefined || input.path === undefined) {
    throw new Error("Coolify request requires operationId or both method and path.");
  }

  if (typeof input.path !== "string" || input.path.length === 0) {
    throw new Error("Coolify request path must be a non-empty string.");
  }

  return {
    method: normalizeHttpMethod(input.method),
    path: input.path,
  };
}

function normalizeHttpMethod(method: unknown): HttpMethod {
  if (typeof method !== "string") {
    throw new Error("Coolify request method must be a string.");
  }

  const normalized = method.toUpperCase();
  if (!HTTP_METHOD_SET.has(normalized)) {
    throw new Error(`Unsupported Coolify request method: ${method}`);
  }

  return normalized as HttpMethod;
}

export function buildCoolifyUrl(baseUrl: string, requestPath: string): URL {
  if (!baseUrl) {
    throw new Error("COOLIFY_BASE_URL is required for execute.");
  }

  const base = new URL(baseUrl);
  const normalizedBasePath = base.pathname.replace(/\/+$/, "");

  if (!normalizedBasePath.endsWith("/api/v1")) {
    base.pathname = `${normalizedBasePath}/api/v1`;
  }

  const apiRoot = base.pathname.replace(/\/+$/, "");
  const normalizedRequestPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  base.pathname = `${apiRoot}${normalizedRequestPath}`;
  return base;
}

function applyPathParams(
  pathTemplate: string,
  pathParams: Record<string, string | number | boolean>,
): string {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, name: string) => {
    if (!(name in pathParams)) {
      throw new Error(`Missing path parameter: ${name}`);
    }
    return encodeURIComponent(String(pathParams[name]));
  });
}

function appendQuery(url: URL, query: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function toCoolifyResponse(response: Response): Promise<CoolifyResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  let data: unknown = text;

  if (text && contentType.includes("application/json")) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers,
    data,
  };
}

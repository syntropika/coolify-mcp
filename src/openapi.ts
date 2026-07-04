import { readFileSync } from "node:fs";
import { classifyOperationTarget } from "./guidance.js";
import { COOLIFY_OPENAPI_SPEC } from "./openapi-spec.js";
import type {
  HttpMethod,
  OpenApiOperation,
  OpenApiSpec,
  OperationCatalogEntry,
  OperationSearchCriteria,
} from "./types.js";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

let cachedSpec: OpenApiSpec | undefined;
let cachedCatalog: OperationCatalogEntry[] | undefined;
let cachedByOperationId: Map<string, OperationCatalogEntry> | undefined;

export function getOpenApiPath(): string {
  if (process.env.COOLIFY_OPENAPI_PATH) {
    return process.env.COOLIFY_OPENAPI_PATH;
  }

  return "embedded:src/openapi-spec.ts";
}

export function loadOpenApiSpec(): OpenApiSpec {
  if (cachedSpec) return cachedSpec;

  const filePath = process.env.COOLIFY_OPENAPI_PATH;
  const spec = filePath
    ? (JSON.parse(readFileSync(filePath, "utf8")) as OpenApiSpec)
    : (COOLIFY_OPENAPI_SPEC as OpenApiSpec);

  if (!spec.paths || typeof spec.paths !== "object") {
    throw new Error(`Invalid Coolify OpenAPI source at ${getOpenApiPath()}: missing paths object`);
  }

  cachedSpec = spec;
  return spec;
}

export function getOperationCatalog(): OperationCatalogEntry[] {
  if (cachedCatalog) return cachedCatalog;

  const spec = loadOpenApiSpec();
  const catalog: OperationCatalogEntry[] = [];

  for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method] as OpenApiOperation | undefined;
      if (!operation) continue;

      const operationId = operation.operationId ?? `${method}-${apiPath}`;
      const httpMethod = method.toUpperCase() as HttpMethod;
      const classification = classifyOperationTarget(httpMethod, apiPath, operationId);
      const parameters = operation.parameters ?? [];
      const pathParameters = parameters
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name);
      const queryParameters = parameters
        .filter((parameter) => parameter.in === "query")
        .map((parameter) => parameter.name);
      const requiredParameters = parameters
        .filter((parameter) => parameter.required)
        .map((parameter) => parameter.name);

      catalog.push({
        operationId,
        method: httpMethod,
        path: apiPath,
        tag: operation.tags?.[0] ?? "System",
        summary: operation.summary ?? "",
        description: operation.description ?? "",
        ...classification,
        pathParameters,
        queryParameters,
        requiredParameters,
        hasRequestBody: Boolean(operation.requestBody),
        requestBodyRequired: Boolean(
          typeof operation.requestBody === "object" &&
            operation.requestBody !== null &&
            "required" in operation.requestBody &&
            operation.requestBody.required,
        ),
        responseCodes: Object.keys(operation.responses ?? {}),
      });
    }
  }

  cachedCatalog = catalog;
  cachedByOperationId = new Map(catalog.map((operation) => [operation.operationId, operation]));
  return catalog;
}

export function getOperation(operationId: string): OperationCatalogEntry | undefined {
  if (!cachedByOperationId) {
    getOperationCatalog();
  }
  return cachedByOperationId?.get(operationId);
}

export function findOperations(criteria: OperationSearchCriteria = {}): OperationCatalogEntry[] {
  const query = criteria.query?.trim().toLowerCase();
  const tags = new Set(criteria.tags?.map((tag) => tag.toLowerCase()) ?? []);
  const methods = new Set(criteria.methods ?? []);
  const safetyCategories = new Set(criteria.safetyCategories ?? []);
  const actionTypes = new Set(criteria.actionTypes ?? []);
  const risks = new Set(criteria.risks ?? []);
  const pathIncludes = criteria.pathIncludes?.toLowerCase();
  const limit = Math.min(Math.max(criteria.limit ?? 50, 1), 200);

  const matches = getOperationCatalog()
    .filter((operation) => {
      if (tags.size > 0 && !tags.has(operation.tag.toLowerCase())) return false;
      if (methods.size > 0 && !methods.has(operation.method)) return false;
      if (safetyCategories.size > 0 && !safetyCategories.has(operation.safetyCategory)) {
        return false;
      }
      if (actionTypes.size > 0 && !actionTypes.has(operation.actionType)) return false;
      if (risks.size > 0 && !risks.has(operation.risk)) return false;
      if (criteria.mutates !== undefined && operation.mutates !== criteria.mutates) return false;
      if (criteria.destructive !== undefined && operation.destructive !== criteria.destructive) {
        return false;
      }
      if (pathIncludes && !operation.path.toLowerCase().includes(pathIncludes)) return false;

      if (!query) return true;

      const haystack = [
        operation.operationId,
        operation.method,
        operation.path,
        operation.tag,
        operation.summary,
        operation.description,
        operation.safetyCategory,
        operation.actionType,
        operation.risk,
        operation.guidance,
        operation.pathParameters.join(" "),
        operation.queryParameters.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return query
        .split(/\s+/)
        .filter(Boolean)
        .every((term) => haystack.includes(term));
    })
    .slice(0, limit);

  return matches;
}

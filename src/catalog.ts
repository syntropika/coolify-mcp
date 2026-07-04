import { classifyOperationTarget } from "./operation-policy.js";
import type {
  HttpMethod,
  OpenApiOperation,
  OpenApiSpec,
  OperationCatalogEntry,
} from "./types.js";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

export function buildOperationCatalog(spec: OpenApiSpec): OperationCatalogEntry[] {
  const catalog: OperationCatalogEntry[] = [];

  for (const [apiPath, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const operation = pathItem[method] as OpenApiOperation | undefined;
      if (!operation) continue;

      const operationId = operation.operationId ?? `${method}-${apiPath}`;
      const httpMethod = method.toUpperCase() as HttpMethod;
      const parameters = operation.parameters ?? [];

      catalog.push({
        operationId,
        method: httpMethod,
        path: apiPath,
        tag: operation.tags?.[0] ?? "System",
        summary: operation.summary ?? "",
        description: operation.description ?? "",
        ...classifyOperationTarget(httpMethod, apiPath, operationId),
        pathParameters: parameters
          .filter((parameter) => parameter.in === "path")
          .map((parameter) => parameter.name),
        queryParameters: parameters
          .filter((parameter) => parameter.in === "query")
          .map((parameter) => parameter.name),
        requiredParameters: parameters
          .filter((parameter) => parameter.required)
          .map((parameter) => parameter.name),
        hasRequestBody: Boolean(operation.requestBody),
        requestBodyRequired: isRequiredRequestBody(operation.requestBody),
        responseCodes: Object.keys(operation.responses ?? {}),
      });
    }
  }

  return catalog;
}

function isRequiredRequestBody(requestBody: unknown): boolean {
  return (
    typeof requestBody === "object" &&
    requestBody !== null &&
    "required" in requestBody &&
    requestBody.required === true
  );
}

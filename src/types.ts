export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type OpenApiSpec = {
  openapi: string;
  info?: {
    title?: string;
    version?: string;
    [key: string]: unknown;
  };
  servers?: Array<{
    url?: string;
    description?: string;
    [key: string]: unknown;
  }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: Record<string, unknown>;
  [key: string]: unknown;
};

export type OpenApiOperation = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  security?: unknown;
  [key: string]: unknown;
};

export type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  deprecated?: boolean;
  description?: string;
  schema?: unknown;
  [key: string]: unknown;
};

export type OperationCatalogEntry = {
  operationId: string;
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  description: string;
  pathParameters: string[];
  queryParameters: string[];
  requiredParameters: string[];
  hasRequestBody: boolean;
  requestBodyRequired: boolean;
  responseCodes: string[];
};

export type OperationSearchCriteria = {
  query?: string;
  tags?: string[];
  methods?: HttpMethod[];
  pathIncludes?: string;
  limit?: number;
};

export type CoolifyRequestInput = {
  operationId?: string;
  method?: HttpMethod;
  path?: string;
  pathParams?: Record<string, string | number | boolean>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  throwOnError?: boolean;
};

export type CoolifyResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
};

export type DryRunRequest = {
  dryRun: true;
  method: HttpMethod;
  url: string;
  operationId?: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
};

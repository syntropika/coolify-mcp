import vm from "node:vm";
import { compactRows, formatAsTsv, getGuide, redactSecrets } from "./guidance.js";
import type { CoolifyRequestInput, OperationSearchCriteria } from "./types.js";
import {
  findOperations,
  getOpenApiPath,
  getOperation,
  getOperationCatalog,
  loadOpenApiSpec,
} from "./openapi.js";

export type CodeModeRuntimeOptions = {
  timeoutMs: number;
  request?: (input: CoolifyRequestInput) => Promise<unknown>;
  includeRequest: boolean;
};

type ConsoleEntry = {
  level: "log" | "warn" | "error";
  values: unknown[];
};

export async function runCodeMode(code: string, options: CodeModeRuntimeOptions): Promise<{
  result: unknown;
  logs: ConsoleEntry[];
}> {
  const logs: ConsoleEntry[] = [];
  const codemode = createCodeModeApi(options);
  const wrappedCode = wrapCode(code);

  const context = vm.createContext(
    {
      codemode,
      console: {
        log: (...values: unknown[]) => logs.push({ level: "log", values }),
        warn: (...values: unknown[]) => logs.push({ level: "warn", values }),
        error: (...values: unknown[]) => logs.push({ level: "error", values }),
      },
      URL,
      URLSearchParams,
    },
    {
      name: "coolify-code-mode",
      codeGeneration: {
        strings: false,
        wasm: false,
      },
    },
  );

  const script = new vm.Script(wrappedCode, {
    filename: "coolify-codemode.vm.js",
  });

  const value = script.runInContext(context, {
    timeout: options.timeoutMs,
    displayErrors: true,
  });

  const result = await withTimeout(Promise.resolve(value), options.timeoutMs);
  return { result, logs };
}

function createCodeModeApi(options: CodeModeRuntimeOptions) {
  const baseApi = {
    spec: async () => loadOpenApiSpec(),
    specPath: () => getOpenApiPath(),
    operations: async () => getOperationCatalog(),
    operation: async (operationId: string) => {
      const operation = getOperation(operationId);
      if (!operation) {
        throw new Error(`Unknown Coolify operationId: ${operationId}`);
      }
      return operation;
    },
    findOperations: async (criteria: OperationSearchCriteria = {}) => findOperations(criteria),
    classifyOperation: async (operationId: string) => {
      const operation = getOperation(operationId);
      if (!operation) {
        throw new Error(`Unknown Coolify operationId: ${operationId}`);
      }
      return {
        operationId: operation.operationId,
        method: operation.method,
        path: operation.path,
        safetyCategory: operation.safetyCategory,
        actionType: operation.actionType,
        risk: operation.risk,
        mutates: operation.mutates,
        destructive: operation.destructive,
        guidance: operation.guidance,
      };
    },
    describeOperation: async (operationId: string) => {
      const operation = getOperation(operationId);
      if (!operation) {
        throw new Error(`Unknown Coolify operationId: ${operationId}`);
      }
      const method = operation.method.toLowerCase();
      const rawOperation = loadOpenApiSpec().paths[operation.path]?.[method];
      return {
        ...operation,
        parameters: rawOperation?.parameters ?? [],
        requestBody: rawOperation?.requestBody,
        responses: rawOperation?.responses ?? {},
      };
    },
    guide: (topic?: string) => getGuide(topic),
    format: {
      tsv: formatAsTsv,
      compact: compactRows,
    },
    redactSecrets,
  };

  if (!options.includeRequest) {
    return baseApi;
  }

  if (!options.request) {
    throw new Error("Code Mode execute requires a request implementation.");
  }

  return {
    ...baseApi,
    request: options.request,
  };
}

function wrapCode(code: string): string {
  const trimmed = code.trim();

  if (!trimmed) {
    throw new Error("Code Mode input cannot be empty.");
  }

  if (
    trimmed.startsWith("async ") ||
    trimmed.startsWith("async(") ||
    trimmed.startsWith("async (") ||
    trimmed.startsWith("function ") ||
    trimmed.startsWith("()") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("(")
  ) {
    return `Promise.resolve((${trimmed})())`;
  }

  return `(async () => {\n${trimmed}\n})()`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Code Mode execution exceeded ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

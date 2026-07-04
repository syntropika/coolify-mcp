import type { HttpMethod, OperationClassification } from "./types.js";

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
    };
  }

  if (operationId.startsWith("deploy-") || path === "/deploy") {
    return {
      safetyCategory: "operational",
      actionType: "deploy",
      risk: "mutating",
      mutates: true,
      destructive: false,
    };
  }

  if (/(^|[-/])(start|stop|restart|cancel)([-/]|$)/.test(target)) {
    return {
      safetyCategory: "operational",
      actionType: "lifecycle",
      risk: "mutating",
      mutates: true,
      destructive: false,
    };
  }

  if (/(^|[-/])validate([-/]|$)/.test(target)) {
    return {
      safetyCategory: "operational",
      actionType: "validate",
      risk: "low",
      mutates: true,
      destructive: false,
    };
  }

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    return {
      safetyCategory: "configuration",
      actionType: operationId.startsWith("create-") ? "create" : "update",
      risk: "mutating",
      mutates: true,
      destructive: false,
    };
  }

  return {
    safetyCategory: "read",
    actionType: "read",
    risk: "read",
    mutates: false,
    destructive: false,
  };
}

export function getOperationGuidance(classification: OperationClassification): string {
  switch (classification.actionType) {
    case "delete":
      return "Destructive delete. Prefer dryRun first and require explicit user intent before allowDestructive.";
    case "system":
      return "Administrative system action. Confirm intent and return the exact endpoint/result.";
    case "deploy":
      return "Deployment action. Resolve the target UUID/tag first and return affected resources and deployment status.";
    case "lifecycle":
      return "Lifecycle action. Resolve the resource UUID first and include only requested options.";
    case "validate":
      return "Validation action. Usually low risk, but it may contact external providers or update validation state.";
    case "create":
    case "update":
      return "Configuration mutation. Use narrow inputs, throwOnError, and return changed fields/UUIDs.";
    case "read":
      return "Read-only operation. Keep returned fields focused and compact.";
  }
}

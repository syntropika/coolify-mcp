import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const openApi = JSON.parse(readFileSync(new URL("../openapi/coolify-openapi.json", import.meta.url), "utf8"));
const openApiModule = await import("../src/openapi.ts");
const clientModule = await import("../src/client.ts");

test("generated catalog covers every OpenAPI operation", () => {
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  let count = 0;
  for (const pathItem of Object.values(openApi.paths)) {
    for (const method of Object.keys(pathItem)) {
      if (methods.has(method)) count += 1;
    }
  }

  const catalog = openApiModule.getOperationCatalog();
  assert.equal(catalog.length, count);
  assert.equal(catalog.length, 136);
  assert.equal(new Set(catalog.map((operation) => operation.operationId)).size, catalog.length);
});

test("search can discover operation groups and deployment operations", () => {
  const deployments = openApiModule.findOperations({ query: "deploy", tags: ["Deployments"] });
  assert.ok(deployments.some((operation) => operation.operationId === "deploy-by-tag-or-uuid"));

  const groups = new Set(openApiModule.getOperationCatalog().map((operation) => operation.tag));
  for (const group of [
    "Applications",
    "Cloud Tokens",
    "Databases",
    "Deployments",
    "GitHub Apps",
    "Hetzner",
    "Private Keys",
    "Projects",
    "Resources",
    "Scheduled Tasks",
    "Servers",
    "Services",
    "System",
    "Teams",
  ]) {
    assert.ok(groups.has(group), `missing group ${group}`);
  }
});

test("catalog exposes safety categories", () => {
  assert.equal(openApiModule.getOperation("healthcheck").safetyCategory, "read");
  assert.equal(openApiModule.getOperation("healthcheck").mutates, false);
  assert.equal(openApiModule.getOperation("deploy-by-tag-or-uuid").safetyCategory, "operational");
  assert.equal(openApiModule.getOperation("deploy-by-tag-or-uuid").actionType, "deploy");
  assert.equal(openApiModule.getOperation("create-private-deploy-key-application").actionType, "create");
  assert.equal(openApiModule.getOperation("restart-application-by-uuid").safetyCategory, "operational");
  assert.equal(openApiModule.getOperation("restart-application-by-uuid").actionType, "lifecycle");
  assert.equal(openApiModule.getOperation("update-application-by-uuid").safetyCategory, "configuration");
  assert.equal(openApiModule.getOperation("update-application-by-uuid").risk, "mutating");
  assert.equal(openApiModule.getOperation("delete-service-by-uuid").safetyCategory, "destructive");
  assert.equal(openApiModule.getOperation("delete-service-by-uuid").destructive, true);
  assert.equal(openApiModule.getOperation("disable-api").actionType, "system");
  assert.equal(openApiModule.getOperation("disable-api").risk, "admin");

  const operational = openApiModule.findOperations({
    query: "restart",
    safetyCategories: ["operational"],
  });
  assert.ok(operational.length > 0);
  assert.ok(operational.every((operation) => operation.safetyCategory === "operational"));

  const lifecycle = openApiModule.findOperations({ actionTypes: ["lifecycle"], risks: ["mutating"] });
  assert.ok(lifecycle.some((operation) => operation.operationId === "start-application-by-uuid"));
  assert.ok(lifecycle.every((operation) => operation.mutates));

  const destructive = openApiModule.findOperations({ destructive: true, limit: 200 });
  assert.equal(destructive.length, openApiModule.getOperationCatalog().filter((operation) => operation.method === "DELETE").length);
  assert.ok(destructive.every((operation) => operation.method === "DELETE"));
});

test("request planner resolves operationId, path parameters, and base URL", () => {
  const plan = clientModule.buildRequestPlan(
    {
      operationId: "get-application-by-uuid",
      pathParams: { uuid: "abc 123" },
      query: { include: "logs", empty: undefined },
    },
    { baseUrl: "https://coolify.example.com" },
  );

  assert.equal(plan.method, "GET");
  assert.equal(plan.url.toString(), "https://coolify.example.com/api/v1/applications/abc%20123?include=logs");
});

test("request planner rejects ambiguous operation and raw method inputs", () => {
  assert.throws(
    () =>
      clientModule.buildRequestPlan(
        {
          operationId: "delete-service-by-uuid",
          method: "GET",
          pathParams: { uuid: "service-uuid" },
        },
        { baseUrl: "https://coolify.example.com" },
      ),
    /either operationId or method\/path/,
  );
});

test("request planner accepts base URL that already includes api root", () => {
  const url = clientModule.buildCoolifyUrl("https://coolify.example.com/api/v1", "/health");
  assert.equal(url.toString(), "https://coolify.example.com/api/v1/health");
});

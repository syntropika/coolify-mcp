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

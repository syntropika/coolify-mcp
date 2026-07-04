import assert from "node:assert/strict";
import test from "node:test";

const codemodeModule = await import("../src/codemode.ts");
const clientModule = await import("../src/client.ts");

test("search code can call findOperations", async () => {
  const output = await codemodeModule.runCodeMode(
    `async () => {
      return codemode.findOperations({ query: "application logs", tags: ["Applications"] });
    }`,
    {
      timeoutMs: 5000,
      includeRequest: false,
    },
  );

  assert.ok(
    output.result.some((operation) => operation.operationId === "get-application-logs-by-uuid"),
  );
});

test("execute code can perform multiple requests in one call", async () => {
  const calls = [];
  const output = await codemodeModule.runCodeMode(
    `async () => {
      const projects = await codemode.request({ operationId: "list-projects" });
      const environments = [];
      for (const project of projects.data) {
        environments.push(await codemode.request({
          operationId: "get-environments",
          pathParams: { uuid: project.uuid }
        }));
      }
      return { projectCount: projects.data.length, environmentCalls: environments.length };
    }`,
    {
      timeoutMs: 5000,
      includeRequest: true,
      request: async (input) => {
        calls.push(input);
        if (input.operationId === "list-projects") {
          return { data: [{ uuid: "p1" }, { uuid: "p2" }] };
        }
        return { data: [] };
      },
    },
  );

  assert.equal(output.result.projectCount, 2);
  assert.equal(output.result.environmentCalls, 2);
  assert.equal(calls.length, 3);
});

test("destructive requests are blocked unless explicitly allowed", async () => {
  const request = clientModule.createCoolifyRequest({
    baseUrl: "https://coolify.example.com",
    apiToken: "token",
    requestTimeoutMs: 1000,
    allowDestructive: false,
    dryRun: true,
  });

  await assert.rejects(
    () =>
      request({
        operationId: "delete-service-by-uuid",
        pathParams: { uuid: "service-uuid" },
      }),
    /Blocked destructive operation/,
  );
});

test("destructive raw requests are blocked after method normalization", async () => {
  const request = clientModule.createCoolifyRequest({
    baseUrl: "https://coolify.example.com",
    apiToken: "token",
    requestTimeoutMs: 1000,
    allowDestructive: false,
    dryRun: true,
  });

  await assert.rejects(
    () =>
      request({
        method: "delete",
        path: "/services/service-uuid",
      }),
    /Blocked destructive operation/,
  );
});

test("dry run returns request plan when destructive calls are allowed", async () => {
  const request = clientModule.createCoolifyRequest({
    baseUrl: "https://coolify.example.com",
    apiToken: "token",
    requestTimeoutMs: 1000,
    allowDestructive: true,
    dryRun: true,
  });

  const output = await request({
    operationId: "delete-service-by-uuid",
    pathParams: { uuid: "service-uuid" },
  });

  assert.equal(output.dryRun, true);
  assert.equal(output.method, "DELETE");
  assert.equal(output.url, "https://coolify.example.com/api/v1/services/service-uuid");
});

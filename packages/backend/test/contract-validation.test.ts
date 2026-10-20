import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectApiError } from "./helpers/api";
import { createClient, createTestApp, type TestClient } from "./helpers/app";
import { createUser } from "./helpers/fixtures";
import { ProbeModule } from "./helpers/probe";

describe("contract validation and errors", () => {
  let app: INestApplication;
  let client: TestClient;

  beforeAll(async () => {
    app = await createTestApp(ProbeModule);
    client = createClient(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("path params", () => {
    it("accepts a UUID", async () => {
      const id = randomUUID();
      const response = await client.get(`/api/probe/${id}`).expect(200);

      expect(response.body).toEqual({ id });
    });

    it("rejects a malformed UUID with the failing path", async () => {
      const response = await client.get("/api/probe/not-a-uuid").expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(response.body.details.issues).toEqual([
        { path: ["id"], message: expect.any(String) },
      ]);
    });
  });

  describe("query", () => {
    it("applies pagination defaults", async () => {
      const response = await client.get("/api/probe").expect(200);

      expect(response.body).toEqual({ page: 1, pageSize: 20 });
    });

    it("decodes numbers and booleans from strings", async () => {
      const response = await client
        .get("/api/probe?page=3&pageSize=100&archived=false")
        .expect(200);

      expect(response.body).toEqual({
        page: 3,
        pageSize: 100,
        archived: false,
      });
    });

    it.each([
      "pageSize=101",
      "pageSize=0",
      "page=abc",
      "page=-1",
      "page=1.5",
      "page=1&page=2",
      "archived=yes",
      "archived=",
    ])("rejects %s", async (query) => {
      const response = await client.get(`/api/probe?${query}`).expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });
  });

  describe("body", () => {
    it("accepts a valid JSON body", async () => {
      const response = await client
        .post("/api/probe")
        .send({ name: "Milk", amount: 250 })
        .expect(201);

      expect(response.body).toEqual({ name: "Milk", amount: 250 });
    });

    it("rejects a body that fails the schema", async () => {
      const response = await client
        .post("/api/probe")
        .send({ name: "", amount: 2.5 })
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      const paths = response.body.details.issues.map(
        (issue: { path: unknown }) => issue.path
      );
      expect(paths).toEqual([["name"], ["amount"]]);
    });

    it("rejects a missing body", async () => {
      const response = await client.post("/api/probe").expect(400);

      expectApiError(response, "VALIDATION_ERROR");
    });

    it("rejects malformed JSON", async () => {
      const response = await client
        .post("/api/probe")
        .set("Content-Type", "application/json")
        .send('{"name":')
        .expect(400);

      expectApiError(response, "VALIDATION_ERROR");
      expect(response.body.details.issues).toEqual([
        { path: [], message: expect.any(String) },
      ]);
    });

    it("rejects a body over the size limit", async () => {
      const response = await client
        .post("/api/probe")
        .send({ name: "x".repeat(200_000), amount: 1 })
        .expect(413);

      expectApiError(response, "PAYLOAD_TOO_LARGE");
    });

    it("rejects a charset the parser can't decode", async () => {
      const response = await client
        .post("/api/probe")
        .set("Content-Type", "application/json; charset=latin1")
        .send("{}")
        .expect(415);

      expectApiError(response, "UNSUPPORTED_MEDIA_TYPE");
    });
  });

  describe("errors", () => {
    it("answers 401 without a session", async () => {
      const response = await client.get("/api/probe-private").expect(401);

      expectApiError(response, "UNAUTHENTICATED");
    });

    it("lets a signed-in user through the guard", async () => {
      const alice = await createUser(app, "Alice");

      await alice.client.get("/api/probe-private").expect(200);
    });

    it.each([
      ["forbidden", 403, "FORBIDDEN"],
      ["conflict", 409, "CONFLICT"],
      ["rate-limited", 429, "RATE_LIMITED"],
    ])("keeps the status of a %s error", async (route, status, code) => {
      const response = await client.get(`/api/probe/${route}`).expect(status);

      expectApiError(response, code);
    });

    it("answers 404 for unknown routes", async () => {
      const response = await client.get("/api/no-such-route").expect(404);

      expectApiError(response, "NOT_FOUND");
    });

    it("maps database constraint violations to 409", async () => {
      const response = await client
        .post("/api/probe/duplicate-user")
        .expect(409);

      expectApiError(response, "CONFLICT");
    });

    it("hides unexpected errors", async () => {
      const response = await client.get("/api/probe/boom").expect(500);

      expect(response.body).toEqual({
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      });
      expect(response.text).not.toContain("secret");
    });
  });
});

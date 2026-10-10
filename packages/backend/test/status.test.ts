import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, createTestApp } from "./helpers/app";

describe("GET /", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("answers unauthenticated clients", async () => {
    const response = await createClient(app).get("/").expect(200);

    expect(response.body).toEqual({ status: "ok" });
  });
});

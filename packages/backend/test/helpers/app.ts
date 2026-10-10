import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request, { type Test } from "supertest";
import { AppModule } from "../../src/app.module";

/** Boots the app the way `main.ts` does, without listening on a port. */
export async function createTestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: false,
  });
  await app.init();
  return app;
}

export interface TestClient {
  delete: (path: string) => Test;
  get: (path: string) => Test;
  patch: (path: string) => Test;
  post: (path: string) => Test;
}

/**
 * HTTP client for the app. Without a cookie it acts as an unauthenticated
 * visitor. Better Auth checks the Origin header on cookie requests, so every
 * request sends the configured app origin.
 */
export function createClient(
  app: INestApplication,
  cookie?: string
): TestClient {
  const server = app.getHttpServer();
  const origin = process.env.BETTER_AUTH_URL ?? "";
  const prepare = (test: Test): Test => {
    test.set("Origin", origin);
    return cookie ? test.set("Cookie", cookie) : test;
  };

  return {
    delete: (path) => prepare(request(server).delete(path)),
    get: (path) => prepare(request(server).get(path)),
    patch: (path) => prepare(request(server).patch(path)),
    post: (path) => prepare(request(server).post(path)),
  };
}

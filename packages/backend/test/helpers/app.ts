import type { INestApplication, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request, { type Test } from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";

/**
 * Boots the app the way `main.ts` does, without listening on a port. Tests can
 * pass a module that imports `AppModule` and adds test-only controllers.
 */
export async function createTestApp(
  module: Type = AppModule
): Promise<INestApplication> {
  const app = await NestFactory.create(module, {
    bodyParser: false,
    logger: false,
  });
  configureApp(app);
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

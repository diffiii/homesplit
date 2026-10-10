import { endpoints } from "@homesplit/contracts";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./helpers/app";

const APP_ROUTE = /^\/api\//;
const AUTH_ROUTE = /^\/api\/auth(\/|$)/;

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Every `METHOD path` pair the Express router serves after Nest registers it. */
function registeredRoutes(app: INestApplication): string[] {
  const { router } = app.getHttpAdapter().getInstance() as {
    router: { stack: RouterLayer[] };
  };

  return router.stack.flatMap(({ route }) =>
    route
      ? Object.keys(route.methods).map(
          (method) => `${method.toUpperCase()} ${route.path}`
        )
      : []
  );
}

describe("registered routes", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("are read from the router", () => {
    expect(registeredRoutes(app)).toContain("GET /");
  });

  it("match an entry in the endpoint map", () => {
    const mapped = new Set(
      Object.values(endpoints).map(({ method, path }) => `${method} ${path}`)
    );
    const unmapped = registeredRoutes(app)
      .filter((route) => {
        const path = route.slice(route.indexOf(" ") + 1);
        return APP_ROUTE.test(path) && !AUTH_ROUTE.test(path);
      })
      .filter((route) => !mapped.has(route))
      .sort();

    expect(unmapped).toEqual([]);
  });
});

import {
  createServer,
  request as forward,
  type IncomingMessage,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { Controller, Get, type INestApplication, Module } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "@/app.module";
import { db } from "@/db";
import { session } from "@/db/schema";
import { createTestApp } from "./helpers/app";
import { TEST_PASSWORD } from "./helpers/fixtures";
import { verificationLink } from "./helpers/mail";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "";
const PREVIEW_ORIGIN = "https://homesplit-web-git-feature.vercel.app";
const VISITOR_IP = "203.0.113.7";
const SECURE_SESSION_COOKIE = /^__Secure-better-auth\.session_token=/u;
const DOMAIN_ATTRIBUTE = /domain=/iu;

/** A test-only route behind the session guard. */
@Controller("api/whoami")
class WhoamiController {
  @Get()
  get(@Session() current: UserSession): { userId: string } {
    return { userId: current.user.id };
  }
}

@Module({ controllers: [WhoamiController], imports: [AppModule] })
class RewriteTestModule {}

function portOf(server: Server): number {
  return (server.address() as AddressInfo).port;
}

/**
 * Stands in for the web app's `/api/*` rewrite on Vercel: forwards only `/api`
 * paths, and replaces `X-Forwarded-For` with the visitor's address.
 */
function startRewrite(apiPort: number): Promise<Server> {
  const frontend = new URL(FRONTEND_URL);
  const proxy = createServer((req: IncomingMessage, res) => {
    if (!req.url?.startsWith("/api/")) {
      res.writeHead(404).end();
      return;
    }

    const upstream = forward(
      {
        headers: {
          ...req.headers,
          host: `127.0.0.1:${apiPort}`,
          "x-forwarded-for": VISITOR_IP,
          "x-forwarded-host": frontend.host,
          "x-forwarded-proto": frontend.protocol.slice(0, -1),
        },
        host: "127.0.0.1",
        method: req.method,
        path: req.url,
        port: apiPort,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      }
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });

  return new Promise((resolve) => {
    proxy.listen(0, "127.0.0.1", () => resolve(proxy));
  });
}

describe("API behind the frontend rewrite", () => {
  let app: INestApplication;
  let proxy: Server;

  const call = (
    path: string,
    init: RequestInit & { origin?: string; cookie?: string } = {}
  ): Promise<Response> => {
    const { origin = FRONTEND_URL, cookie, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set("Origin", origin);
    if (rest.body) {
      headers.set("Content-Type", "application/json");
    }
    if (cookie) {
      headers.set("Cookie", cookie);
    }
    return fetch(`http://127.0.0.1:${portOf(proxy)}${path}`, {
      ...rest,
      headers,
    });
  };

  /** Signs up and opens the emailed link, because sign-in needs a verified email. */
  const register = async (): Promise<{ email: string; userId: string }> => {
    const email = `user-${crypto.randomUUID()}@test.local`;
    const signedUp = await call("/api/auth/sign-up/email", {
      body: JSON.stringify({ email, name: "Alice", password: TEST_PASSWORD }),
      method: "POST",
    });
    expect(signedUp.status).toBe(200);
    const { user } = await signedUp.json();

    const verified = await call(verificationLink(email).path);
    expect(verified.status).toBe(200);

    return { email, userId: user.id };
  };

  const signIn = (email: string): Promise<Response> =>
    call("/api/auth/sign-in/email", {
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
      method: "POST",
    });

  const signUp = async (): Promise<{ cookie: string; userId: string }> => {
    const { email, userId } = await register();

    const signedIn = await signIn(email);
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");

    return { cookie, userId };
  };

  beforeAll(async () => {
    app = await createTestApp(RewriteTestModule);
    await app.listen(0, "127.0.0.1");
    proxy = await startRewrite(portOf(app.getHttpServer()));
  });

  afterAll(async () => {
    await new Promise((resolve) => proxy?.close(resolve));
    await app?.close();
  });

  it("signs up, signs in, and calls an /api route", async () => {
    const { cookie, userId } = await signUp();

    const whoami = await call("/api/whoami", { cookie });
    expect(whoami.status).toBe(200);
    expect(await whoami.json()).toEqual({ userId });
  });

  it("sets first-party session cookies for the frontend origin", async () => {
    const { email } = await register();

    const response = await signIn(email);

    const sessionCookie = response.headers
      .getSetCookie()
      .find((value) => value.includes("better-auth.session_token="));
    const attributes = sessionCookie?.split(";").map((part) => part.trim());

    expect(attributes?.[0]).toMatch(SECURE_SESSION_COOKIE);
    expect(attributes).toEqual(
      expect.arrayContaining(["Secure", "HttpOnly", "SameSite=Lax", "Path=/"])
    );
    expect(sessionCookie).not.toMatch(DOMAIN_ATTRIBUTE);
  });

  it("records the visitor's address, not the proxy's", async () => {
    const { userId } = await signUp();

    const rows = await db
      .select({ ipAddress: session.ipAddress })
      .from(session)
      .where(eq(session.userId, userId));
    // The verification link and the sign-in each open a session.
    expect(rows).toEqual([
      { ipAddress: VISITOR_IP },
      { ipAddress: VISITOR_IP },
    ]);
  });

  it("trusts preview origins and rejects other origins", async () => {
    const { cookie } = await signUp();

    const foreign = await call("/api/auth/sign-out", {
      cookie,
      method: "POST",
      origin: "https://evil.example",
    });
    expect(foreign.status).toBe(403);

    const preview = await call("/api/auth/sign-out", {
      cookie,
      method: "POST",
      origin: PREVIEW_ORIGIN,
    });
    expect(preview.status).toBe(200);
  });

  it("doesn't answer with CORS headers", async () => {
    const preflight = await call("/api/auth/sign-in/email", {
      headers: { "Access-Control-Request-Method": "POST" },
      method: "OPTIONS",
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();

    const anonymous = await call("/api/auth/get-session");
    expect(anonymous.headers.get("access-control-allow-origin")).toBeNull();
  });
});

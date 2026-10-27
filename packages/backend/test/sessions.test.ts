import type { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { session } from "@/db/schema";
import { createClient, createTestApp, type TestClient } from "./helpers/app";
import { createUser, TEST_PASSWORD, type TestUser } from "./helpers/fixtures";

const PHONE_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PHONE_IP = "203.0.113.7";
const DAY_MS = 86_400_000;

interface ListedSession {
  createdAt: string;
  id: string;
  ipAddress: string | null;
  token: string;
  updatedAt: string;
  userAgent: string | null;
  userId: string;
}

describe("signed-in devices", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Sign `user` in again, the way another device would. */
  async function signInElsewhere(user: TestUser): Promise<TestClient> {
    const response = await createClient(app)
      .post("/api/auth/sign-in/email")
      .set("User-Agent", PHONE_AGENT)
      .set("X-Forwarded-For", PHONE_IP)
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);
    const setCookie = response.headers["set-cookie"] as unknown as string[];
    const cookie = setCookie.map((value) => value.split(";")[0]).join("; ");
    return createClient(app, cookie);
  }

  async function listSessions(client: TestClient): Promise<ListedSession[]> {
    const response = await client.get("/api/auth/list-sessions").expect(200);
    return response.body;
  }

  it("lists every device with its user agent and address", async () => {
    const alice = await createUser(app, "Alice");
    await signInElsewhere(alice);

    const sessions = await listSessions(alice.client);

    expect(sessions).toHaveLength(2);
    expect(sessions.every(({ userId }) => userId === alice.id)).toBe(true);
    expect(sessions).toContainEqual(
      expect.objectContaining({ userAgent: PHONE_AGENT, ipAddress: PHONE_IP })
    );
  });

  it("lists devices for a session signed in more than a day ago", async () => {
    const alice = await createUser(app, "Alice");
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(session.userId, alice.id));

    expect(await listSessions(alice.client)).toHaveLength(1);
  });

  it("signs out one other device", async () => {
    const alice = await createUser(app, "Alice");
    const phone = await signInElsewhere(alice);
    const own = await alice.client.get("/api/auth/get-session").expect(200);
    const phoneSession = (await listSessions(alice.client)).find(
      ({ id }) => id !== own.body.session.id
    );

    await alice.client
      .post("/api/auth/revoke-session")
      .send({ token: phoneSession?.token })
      .expect(200);

    const phoneCheck = await phone.get("/api/auth/get-session").expect(200);
    expect(phoneCheck.body).toBeNull();
    expect(await listSessions(alice.client)).toHaveLength(1);
  });

  it("ignores another user's session", async () => {
    const alice = await createUser(app, "Alice");
    const bob = await createUser(app, "Bob");
    const [bobSession] = await listSessions(bob.client);

    await alice.client
      .post("/api/auth/revoke-session")
      .send({ token: bobSession?.token })
      .expect(200);

    expect(await listSessions(bob.client)).toHaveLength(1);
  });

  it("signs out every other device and keeps this one", async () => {
    const alice = await createUser(app, "Alice");
    const phone = await signInElsewhere(alice);
    await signInElsewhere(alice);

    await alice.client.post("/api/auth/revoke-other-sessions").expect(200);

    expect(await listSessions(alice.client)).toHaveLength(1);
    const phoneCheck = await phone.get("/api/auth/get-session").expect(200);
    expect(phoneCheck.body).toBeNull();
  });
});

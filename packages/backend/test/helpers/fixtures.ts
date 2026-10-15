import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { HouseholdRole } from "@/features/households/access/roles";
import { createClient, type TestClient } from "./app";

export const TEST_PASSWORD = "correct-horse-battery-staple";

export interface TestUser {
  client: TestClient;
  email: string;
  id: string;
  name: string;
}

export interface TestHousehold {
  id: string;
  name: string;
}

export async function createUser(
  app: INestApplication,
  name = "Test User"
): Promise<TestUser> {
  const email = `user-${randomUUID()}@test.local`;
  const response = await createClient(app)
    .post("/api/auth/sign-up/email")
    .send({ email, name, password: TEST_PASSWORD })
    .expect(200);

  const setCookie = response.headers["set-cookie"] as unknown as
    | string[]
    | undefined;
  if (!setCookie?.length) {
    throw new Error("Sign-up returned no session cookie");
  }
  const cookie = setCookie.map((value) => value.split(";")[0]).join("; ");

  return {
    client: createClient(app, cookie),
    email,
    id: response.body.user.id,
    name,
  };
}

export async function createHousehold(
  owner: TestUser,
  name = "Test Household"
): Promise<TestHousehold> {
  const response = await owner.client
    .post("/api/auth/organization/create")
    .send({ name, slug: randomUUID() })
    .expect(200);

  return { id: response.body.id, name };
}

/** Invites `invitee` and accepts as them, the way a real join happens. */
export async function inviteAndAccept(
  inviter: TestUser,
  household: TestHousehold,
  invitee: TestUser,
  role: HouseholdRole = "member"
): Promise<void> {
  const invitation = await inviter.client
    .post("/api/auth/organization/invite-member")
    .send({ email: invitee.email, organizationId: household.id, role })
    .expect(200);

  await invitee.client
    .post("/api/auth/organization/accept-invitation")
    .send({ invitationId: invitation.body.id })
    .expect(200);
}

export async function removeMember(
  remover: TestUser,
  household: TestHousehold,
  removed: TestUser
): Promise<void> {
  await remover.client
    .post("/api/auth/organization/remove-member")
    .send({ memberIdOrEmail: removed.email, organizationId: household.id })
    .expect(200);
}

export async function leaveHousehold(
  user: TestUser,
  household: TestHousehold
): Promise<void> {
  await user.client
    .post("/api/auth/organization/leave")
    .send({ organizationId: household.id })
    .expect(200);
}

export async function createTwoHouseholds(app: INestApplication): Promise<{
  alice: TestUser & { household: TestHousehold };
  bob: TestUser & { household: TestHousehold };
}> {
  const alice = await createUser(app, "Alice");
  const bob = await createUser(app, "Bob");

  return {
    alice: { ...alice, household: await createHousehold(alice, "Alice's") },
    bob: { ...bob, household: await createHousehold(bob, "Bob's") },
  };
}

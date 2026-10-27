import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createAuth } from "@/lib/api/auth-client";
import { createApiClient } from "@/lib/api/client";
import { MOCK_PASSWORD } from "./factories";
import { setupMockServer } from "./node";
import { createApiHandlers } from "./routes";
import { SCENARIOS } from "./scenarios";

const BASE_URL = "http://localhost:3000";
const OTHER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const { db, server } = setupMockServer();
const onUnauthenticated = vi.fn();
const api = createApiClient({
  fetch: (input, init) => fetch(new URL(String(input), BASE_URL), init),
  onUnauthenticated,
});
// Better Auth keeps the `fetch` it's created with, which MSW hasn't patched yet.
const { account, households, getSession } = createAuth({
  baseURL: BASE_URL,
  fetch: (...args) => fetch(...args),
});

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => db.replace(SCENARIOS.households.build()));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function signInAs(name: string) {
  const user = db.state.users.find((candidate) =>
    candidate.name.startsWith(name)
  );
  if (!user) {
    throw new Error(`No user ${name}`);
  }
  db.state.sessionUserId = user.id;
  return user;
}

function householdId(name: string) {
  const household = db.state.households.find((h) => h.name === name);
  if (!household) {
    throw new Error(`No household ${name}`);
  }
  return household.id;
}

const flat = () => ({ params: { householdId: householdId("Flat on Piękna") } });
const cabin = () => ({ params: { householdId: householdId("Lake cabin") } });

const householdNames = async () =>
  ((await households.list()) ?? []).map(({ name }) => name);

/** The `ApiRequestError` a call rejects with. */
const failure = (call: Promise<unknown>) =>
  call.then(
    () => {
      throw new Error("Expected the call to fail");
    },
    (error: unknown) => error
  );

describe("scenarios", () => {
  it("cover two households, every role, a departed member, a disabled module, and several currencies", () => {
    const { state } = db;
    const roles = new Set(state.members.map(({ role }) => role));
    expect(roles).toEqual(new Set(["owner", "admin", "member"]));
    const departed = state.history.filter(
      (entry) => !db.member(entry.householdId, entry.userId)
    );
    expect(departed).toHaveLength(1);
    expect(
      state.households.filter(({ features }) => !features.chores)
    ).toHaveLength(1);
    expect(new Set(state.expenses.map(({ total }) => total.currency))).toEqual(
      new Set(["PLN", "EUR"])
    );
    expect(state.households.length).toBeGreaterThanOrEqual(2);
  });

  it("build the same IDs every time", () => {
    expect(SCENARIOS.households.build().users.map(({ id }) => id)).toEqual(
      db.state.users.map(({ id }) => id)
    );
  });
});

describe("application routes", () => {
  it("answer every read with a contract-valid response", async () => {
    // The client parses every success body with the endpoint's response schema.
    const [expenses, chores, items] = await Promise.all([
      api("listExpenses", flat()),
      api("listChores", { ...flat(), query: { includeCompleted: true } }),
      api("listShoppingItems", {
        ...flat(),
        query: { includePurchased: true },
      }),
    ]);
    const { householdId: id } = flat().params;
    await Promise.all([
      api("getHouseholdFeatures", flat()),
      api("listExpenseCategories", flat()),
      api("listSettlements", flat()),
      api("listBalances", flat()),
      api("listSettlementSuggestions", flat()),
      api("getExpense", {
        params: { householdId: id, expenseId: expenses.items[0]?.id ?? "" },
      }),
      api("getChore", {
        params: { householdId: id, choreId: chores.items[0]?.id ?? "" },
      }),
      api("getShoppingItem", {
        params: { householdId: id, itemId: items.items[0]?.id ?? "" },
      }),
      api("listMyBalances"),
      api("listFriendships"),
      api("listIncomingFriendRequests"),
      api("listSentFriendRequests"),
    ]);
  });

  it("validate requests with the contract schemas", async () => {
    await expect(
      failure(api("createChore", { ...flat(), body: { name: "" } }))
    ).resolves.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      details: { issues: [{ path: ["name"] }] },
    });
    const page = await fetch(
      `${BASE_URL}/api/households/${flat().params.householdId}/expenses?page=0`
    );
    expect(page.status).toBe(400);
    await expect(
      failure(api("listExpenses", { params: { householdId: "flat" } }))
    ).resolves.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(
      failure(api("updateHouseholdFeatures", { ...flat(), body: {} }))
    ).resolves.toMatchObject({ status: 400, code: "EMPTY_PATCH" });
  });

  it("fail loudly for a route without an implementation", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue();
    server.use(...createApiHandlers(db, {}));
    await expect(failure(api("listExpenses", flat()))).resolves.toMatchObject({
      status: 501,
      code: "NOT_IMPLEMENTED",
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("No mock for listExpenses")
    );
  });

  it("fail loudly for a response that breaks the contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue();
    server.use(
      ...createApiHandlers(db, {
        getHouseholdFeatures: {
          resolve: () => ({ expenses: true, chores: true }) as never,
        },
      })
    );
    await expect(
      failure(api("getHouseholdFeatures", flat()))
    ).resolves.toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
    expect(consoleError).toHaveBeenCalled();
  });

  it("answer 404 for routes outside the contracts", async () => {
    const response = await fetch(`${BASE_URL}/api/nothing-here`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("answer 401 without a session", async () => {
    db.state.sessionUserId = null;
    await expect(failure(api("listMyBalances"))).resolves.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(onUnauthenticated).toHaveBeenCalled();
  });

  it("answer 404 to non-members and departed members", async () => {
    signInAs("Dawid");
    await expect(failure(api("listExpenses", flat()))).resolves.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    signInAs("Celina");
    await expect(
      failure(api("getHouseholdFeatures", cabin()))
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      failure(
        api("getExpense", {
          params: { ...flat().params, expenseId: OTHER_ID },
        })
      )
    ).resolves.toMatchObject({ status: 404 });
  });

  it("answer MODULE_DISABLED to writes in a disabled module, and keep reads", async () => {
    const chores = await api("listChores", cabin());
    expect(chores.items).toHaveLength(1);
    await expect(
      failure(api("createChore", { ...cabin(), body: { name: "Sweep" } }))
    ).resolves.toMatchObject({
      status: 403,
      code: "MODULE_DISABLED",
      details: { module: "chores" },
    });
  });

  it("answer FORBIDDEN by role", async () => {
    signInAs("Celina");
    await expect(
      failure(
        api("updateHouseholdFeatures", { ...flat(), body: { chores: false } })
      )
    ).resolves.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(
      failure(
        api("createExpenseCategory", { ...flat(), body: { name: "Pets" } })
      )
    ).resolves.toMatchObject({ status: 403, code: "FORBIDDEN" });

    const { items } = await api("listExpenses", flat());
    const othersExpense = items.find(
      ({ author }) => author.name !== "Celina Wiśniewska"
    );
    await expect(
      failure(
        api("deleteExpense", {
          params: { ...flat().params, expenseId: othersExpense?.id ?? "" },
        })
      )
    ).resolves.toMatchObject({ status: 403, code: "FORBIDDEN" });

    signInAs("Bartek");
    await expect(
      api("updateHouseholdFeatures", { ...flat(), body: { shopping: false } })
    ).resolves.toEqual({ expenses: true, chores: true, shopping: false });
  });

  it("paginate and order lists like the backend", async () => {
    const first = await api("listExpenses", flat());
    expect(first).toMatchObject({ page: 1, pageSize: 20, totalItems: 26 });
    expect(first.items).toHaveLength(20);
    const dates = first.items.map(({ expenseDate }) => expenseDate);
    expect(dates).toEqual([...dates].sort().reverse());

    const second = await api("listExpenses", {
      ...flat(),
      query: { page: 2 },
    });
    expect(second.items).toHaveLength(6);
    const past = await api("listExpenses", {
      ...flat(),
      query: { page: 9, pageSize: 5 },
    });
    expect(past).toMatchObject({ items: [], page: 9, totalItems: 26 });

    const chores = await api("listChores", {
      ...flat(),
      query: { includeCompleted: true },
    });
    expect(chores.items.map(({ name }) => name)).toEqual([
      "Take out the bins",
      "Clean the bathroom",
      "Fix the wardrobe door",
      "Water the plants",
      "Defrost the freezer",
    ]);
  });

  it("filter expenses like the backend", async () => {
    const all = (
      await api("listExpenses", { ...flat(), query: { pageSize: 100 } })
    ).items;
    const list = async (query: object) =>
      (
        await api("listExpenses", {
          ...flat(),
          query: { pageSize: 100, ...query },
        })
      ).items;
    const [{ category, payers }] = all.filter((expense) => expense.category);
    const userId = payers[0].user.id;

    expect(await list({ categoryId: category?.id })).toEqual(
      all.filter((expense) => expense.category?.id === category?.id)
    );
    expect(await list({ categoryId: "none" })).toEqual(
      all.filter((expense) => expense.category === null)
    );
    expect(await list({ userId })).toEqual(
      all.filter((expense) =>
        [
          ...expense.payers.map(({ user }) => user.id),
          ...expense.allocation.participants.map((p) => p.userId),
        ].includes(userId)
      )
    );
    // Scenario dates are relative to today, so the bounds come from the list.
    const from = all[10].expenseDate;
    const to = all[3].expenseDate;
    const between = await list({ from, to });
    expect(between.length).toBeGreaterThanOrEqual(8);
    expect(between).toEqual(
      all.filter(({ expenseDate }) => expenseDate >= from && expenseDate <= to)
    );
    expect(await list({ userId: OTHER_ID })).toEqual([]);
    await expect(
      failure(
        api("listExpenses", {
          ...flat(),
          query: { from: "2026-02-01", to: "2026-01-31" },
        })
      )
    ).resolves.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("filter chores by assignee like the backend", async () => {
    const list = async (query: object) =>
      (await api("listChores", { ...flat(), query })).items.map(
        ({ name }) => name
      );
    const userId = (name: string) =>
      db.state.users.find((user) => user.name.startsWith(name))?.id;
    const [celina, dawid] = [userId("Celina"), userId("Dawid")];

    expect(await list({ assignedToId: celina })).toEqual([]);
    expect(
      await list({ assignedToId: celina, includeCompleted: true })
    ).toEqual(["Defrost the freezer"]);
    // Dawid has left, but his open chore can still be found and reassigned.
    expect(await list({ assignedToId: dawid })).toEqual([
      "Fix the wardrobe door",
    ]);
    expect(await list({ assignedToId: OTHER_ID })).toEqual([]);
  });

  it("repeat idempotent actions without changing the result", async () => {
    const { householdId: id } = flat().params;
    const [chore] = (await api("listChores", flat())).items;
    const params = { householdId: id, choreId: chore?.id ?? "" };
    const completed = await api("completeChore", { params });
    signInAs("Bartek");
    await expect(api("completeChore", { params })).resolves.toEqual(completed);

    const [item] = (await api("listShoppingItems", flat())).items;
    const itemParams = { householdId: id, itemId: item?.id ?? "" };
    const purchased = await api("purchaseShoppingItem", { params: itemParams });
    await expect(
      api("purchaseShoppingItem", { params: itemParams })
    ).resolves.toEqual(purchased);
    await expect(api("clearPurchasedShoppingItems", flat())).resolves.toEqual({
      deletedCount: 3,
    });
    await expect(api("clearPurchasedShoppingItems", flat())).resolves.toEqual({
      deletedCount: 0,
    });

    signInAs("Alice");
    const pending = (await api("listSettlements", flat())).items.find(
      ({ status }) => status === "pending"
    );
    const settlementParams = {
      householdId: id,
      settlementId: pending?.id ?? "",
    };
    const confirmed = await api("confirmSettlement", {
      params: settlementParams,
    });
    expect(confirmed.confirmedBy.name).toBe("Alice Nowak");
    await expect(
      api("confirmSettlement", { params: settlementParams })
    ).resolves.toEqual(confirmed);
    await expect(
      failure(api("deleteSettlement", { params: settlementParams }))
    ).resolves.toMatchObject({ status: 409, code: "SETTLEMENT_CONFIRMED" });

    const [request] = (await api("listIncomingFriendRequests")).items;
    const requestParams = { params: { requestId: request?.id ?? "" } };
    await api("acceptFriendRequest", requestParams);
    await expect(
      failure(api("acceptFriendRequest", requestParams))
    ).resolves.toMatchObject({ status: 404 });
  });

  it("record payments by the decision-record rules", async () => {
    const alice = signInAs("Alice");
    const celina = db.userByEmail("celina@example.com");
    const dawid = db.userByEmail("dawid@example.com");
    const payment = {
      amount: { amountCents: 1000, currency: "PLN" },
    };
    const byPayer = await api("processSettlement", {
      ...flat(),
      body: { ...payment, payerId: alice.id, payeeId: celina?.id ?? "" },
    });
    expect(byPayer.status).toBe("pending");
    // A departed member's debt is settled by the other party.
    const fromDeparted = await api("processSettlement", {
      ...flat(),
      body: { ...payment, payerId: dawid?.id ?? "", payeeId: alice.id },
    });
    expect(fromDeparted.status).toBe("confirmed");

    signInAs("Celina");
    await expect(
      failure(
        api("processSettlement", {
          ...flat(),
          body: { ...payment, payerId: alice.id, payeeId: dawid?.id ?? "" },
        })
      )
    ).resolves.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("keep balances in step with expenses and payments", async () => {
    const { items } = await api("listBalances", flat());
    expect(items.map(({ currency }) => currency)).toEqual(["EUR", "PLN"]);
    for (const { balances } of items) {
      expect(balances.reduce((sum, b) => sum + b.amountCents, 0)).toBe(0);
    }
    const pln = items.find(({ currency }) => currency === "PLN");
    expect(pln?.balances.map(({ user }) => user.name)).toContain(
      "Dawid Lewandowski"
    );

    const suggestions = await api("listSettlementSuggestions", flat());
    const recorded = await Promise.all(
      suggestions.items.flatMap(({ currency, suggestions: transfers }) =>
        transfers.map(({ payer, payee, amountCents }) =>
          api("processSettlement", {
            ...flat(),
            body: {
              payerId: payer.id,
              payeeId: payee.id,
              amount: { amountCents, currency },
            },
          })
        )
      )
    );
    // Alice recorded every payment, so any she paid waits for its payee.
    for (const { id, payee, status } of recorded) {
      if (status === "pending") {
        db.state.sessionUserId = payee.id;
        // biome-ignore lint/performance/noAwaitInLoops: each payee confirms while signed in
        await api("confirmSettlement", {
          params: { ...flat().params, settlementId: id },
        });
      }
    }
    signInAs("Alice");
    await expect(api("listBalances", flat())).resolves.toEqual({ items: [] });
  });

  it("check references like the backend", async () => {
    const alice = signInAs("Alice");
    const dawid = db.userByEmail("dawid@example.com");
    await expect(
      failure(
        api("createExpense", {
          ...flat(),
          body: {
            name: "Lunch",
            expenseDate: "2026-10-01",
            total: { amountCents: 2000, currency: "PLN" },
            payers: [{ userId: alice.id, amountCents: 2000 }],
            allocation: {
              method: "equal",
              participants: [{ userId: alice.id }, { userId: dawid?.id ?? "" }],
            },
          },
        })
      )
    ).resolves.toMatchObject({
      status: 400,
      code: "INVALID_REFERENCE",
      details: {
        issues: [{ path: ["allocation", "participants", 1, "userId"] }],
      },
    });
  });
});

describe("Better Auth routes", () => {
  it("sign in, read the session, and sign out", async () => {
    db.state.sessionUserId = null;
    await expect(
      failure(account.signIn({ email: "alice@example.com", password: "nope" }))
    ).resolves.toMatchObject({
      source: "auth",
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
    await account.signIn({
      email: "alice@example.com",
      password: MOCK_PASSWORD,
    });
    const session = await getSession();
    expect(session.data?.user).toMatchObject({ name: "Alice Nowak" });

    await account.signOut();
    expect((await getSession()).data).toBeNull();
    await expect(failure(api("listMyBalances"))).resolves.toMatchObject({
      status: 401,
    });
  });

  it("sign up a new user", async () => {
    db.replace(SCENARIOS["signed-out"].build());
    await expect(
      failure(
        account.signUp({
          name: "Alice",
          email: "ALICE@example.com",
          password: "long enough",
        })
      )
    ).resolves.toMatchObject({
      status: 422,
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    });
    await account.signUp({
      name: " Zoe ",
      email: "zoe@example.com",
      password: "long enough",
    });
    expect((await getSession()).data?.user.name).toBe("Zoe");
    await expect(households.list()).resolves.toEqual([]);
  });

  it("list, create, and rename households", async () => {
    await expect(householdNames()).resolves.toEqual([
      "Flat on Piękna",
      "Lake cabin",
    ]);
    const created = await households.create({ name: "Office" });
    const params = { params: { householdId: created?.id ?? "" } };
    await expect(api("getHouseholdFeatures", params)).resolves.toEqual({
      expenses: true,
      chores: true,
      shopping: true,
    });
    expect((await api("listExpenseCategories", params)).items).toHaveLength(7);
    await households.rename({ ...params.params, name: "Studio" });
    await expect(householdNames()).resolves.toContain("Studio");
  });

  it("manage members and invitations by role", async () => {
    const { householdId: id } = flat().params;
    const members =
      (await households.listMembers({ householdId: id }))?.members ?? [];
    expect(members.map(({ role }) => role).sort()).toEqual([
      "admin",
      "member",
      "owner",
    ]);
    const self = members.find(({ role }) => role === "owner");
    await expect(
      failure(
        households.removeMember({ householdId: id, memberId: self?.id ?? "" })
      )
    ).resolves.toMatchObject({ status: 403, code: "CANNOT_REMOVE_SELF" });
    await expect(
      failure(households.leave({ householdId: id }))
    ).resolves.toMatchObject({ status: 409, code: "UNSETTLED_BALANCE" });

    signInAs("Celina");
    await expect(
      failure(
        households.invite({
          householdId: id,
          email: "x@example.com",
          role: "member",
        })
      )
    ).resolves.toMatchObject({
      status: 403,
      code: "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION",
    });
  });

  it.each([0, 60_000])(
    "invite again when the previous invitation expired %i ms ago",
    async (elapsed) => {
      const time = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(time);
      const invitation = db.state.invitations.find(
        ({ email }) => email === "ewa@example.com"
      );
      if (!invitation) {
        throw new Error("Expected Ewa's seeded invitation");
      }
      const input = {
        householdId: invitation.householdId,
        email: invitation.email,
        role: "member" as const,
      };
      await expect(failure(households.invite(input))).resolves.toMatchObject({
        status: 400,
        code: "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
      });

      invitation.expiresAt = new Date(time - elapsed).toISOString();
      const replacement = await households.invite(input);
      expect(replacement).toMatchObject({
        email: input.email,
        organizationId: input.householdId,
        status: "pending",
      });
      expect(replacement?.id).not.toBe(invitation.id);
      expect(new Date(replacement?.expiresAt ?? "").getTime()).toBeGreaterThan(
        time
      );

      await expect(failure(households.invite(input))).resolves.toMatchObject({
        status: 400,
        code: "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
      });
    }
  );

  it("accept an invitation", async () => {
    const invitation = db.state.invitations.find(
      ({ email }) => email === "alice@example.com"
    );
    const invitationId = invitation?.id ?? "";
    await expect(
      households.getInvitation({ invitationId })
    ).resolves.toMatchObject({
      organizationName: "Book club",
    });
    await households.acceptInvitation({ invitationId });
    await expect(householdNames()).resolves.toContain("Book club");
    await expect(
      failure(households.acceptInvitation({ invitationId }))
    ).resolves.toMatchObject({ code: "INVITATION_NOT_FOUND" });
  });

  it("answer 404 to organization deletion", async () => {
    const response = await fetch(`${BASE_URL}/api/auth/organization/delete`, {
      method: "POST",
    });
    expect(response.status).toBe(404);
  });
});

describe("unmocked Better Auth paths", () => {
  it("answer 404 and log an error", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue();
    const response = await fetch(`${BASE_URL}/api/auth/update-user`, {
      method: "POST",
    });
    expect(response.status).toBe(404);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("has no mock")
    );
  });
});

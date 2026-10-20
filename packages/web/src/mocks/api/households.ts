import { conflict } from "../errors";
import type { MockRoutes } from "../routes";
import { hasUnsettledBalances } from "./ledger";
import { definedFields } from "./shared";

const unsettled = () =>
  conflict(
    "HOUSEHOLD_HAS_UNSETTLED_BALANCES",
    "Every balance in the household must be zero"
  );

export const householdRoutes: MockRoutes = {
  deleteHousehold: {
    minRole: "owner",
    resolve: ({ db, household }) => {
      if (hasUnsettledBalances(db, household.id)) {
        throw unsettled();
      }
      const { state } = db;
      const keep = <T extends { householdId: string }>(rows: T[]) =>
        rows.filter((row) => row.householdId !== household.id);
      state.households = state.households.filter(
        ({ id }) => id !== household.id
      );
      state.members = keep(state.members);
      state.history = keep(state.history);
      state.invitations = keep(state.invitations);
      state.categories = keep(state.categories);
      state.expenses = keep(state.expenses);
      state.settlements = keep(state.settlements);
      state.chores = keep(state.chores);
      state.shoppingItems = keep(state.shoppingItems);
    },
  },

  getHouseholdFeatures: {
    resolve: ({ household }) => household.features,
  },

  updateHouseholdFeatures: {
    minRole: "admin",
    resolve: ({ db, household, body }) => {
      if (
        body.expenses === false &&
        household.features.expenses &&
        hasUnsettledBalances(db, household.id)
      ) {
        throw unsettled();
      }
      household.features = { ...household.features, ...definedFields(body) };
      return household.features;
    },
  },
};

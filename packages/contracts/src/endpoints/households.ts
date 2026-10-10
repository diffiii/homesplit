import {
  HouseholdFeatures,
  HouseholdIdParams,
  UpdateHouseholdFeaturesRequest,
} from "../features/households";
import type { Endpoint } from "./endpoint";
import { HOUSEHOLD } from "./paths";

export const householdEndpoints = {
  deleteHousehold: {
    method: "DELETE",
    path: HOUSEHOLD,
    params: HouseholdIdParams,
    status: 204,
    response: null,
  },
  getHouseholdFeatures: {
    method: "GET",
    path: `${HOUSEHOLD}/features`,
    params: HouseholdIdParams,
    status: 200,
    response: HouseholdFeatures,
  },
  updateHouseholdFeatures: {
    method: "PATCH",
    path: `${HOUSEHOLD}/features`,
    params: HouseholdIdParams,
    body: UpdateHouseholdFeaturesRequest,
    status: 200,
    response: HouseholdFeatures,
  },
} as const satisfies Record<string, Endpoint>;

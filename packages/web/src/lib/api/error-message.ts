import { isApiRequestError, NO_STATUS } from "./api-error";

const GENERIC_MESSAGE = "Something went wrong. Try again.";

/**
 * A sentence to show the user for a failed request. `ApiRequestError.message`
 * is for developers, so this goes by status and code instead. Screens that
 * know better, such as a 409 with its own explanation, say so themselves.
 */
export function errorMessage(error: unknown): string {
  if (!isApiRequestError(error)) {
    return GENERIC_MESSAGE;
  }
  if (error.status === NO_STATUS) {
    return "Couldn't reach HomeSplit. Check your connection and try again.";
  }
  if (error.code === "MODULE_DISABLED") {
    return "This module is turned off for the household. An admin can turn it back on in settings.";
  }
  switch (error.status) {
    case 400:
      return "Some of the details aren't valid. Check them and try again.";
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return "This doesn't exist anymore, or you don't have access to it.";
    case 429:
      return "Too many requests. Wait a moment and try again.";
    default:
      return GENERIC_MESSAGE;
  }
}

const BOUGHT_OPEN_KEY = "homesplit:shopping-bought-open";

export function readBoughtOpen(): boolean {
  try {
    return localStorage.getItem(BOUGHT_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

export function rememberBoughtOpen(open: boolean): void {
  try {
    localStorage.setItem(BOUGHT_OPEN_KEY, String(open));
  } catch {
    // No storage, as in some private modes: the section just opens each time.
  }
}

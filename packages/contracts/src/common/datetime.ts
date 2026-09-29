import { z } from "zod";

/** ISO 8601 datetime string (UTC, e.g. `2020-01-01T06:15:00Z`). */
export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** ISO 8601 calendar date string (`YYYY-MM-DD`). */
export const IsoDate = z.iso.date();
export type IsoDate = z.infer<typeof IsoDate>;

import type { AppContext } from "./api-context";

/**
 * Locale evidence for read-only localization: an explicit `locale` query
 * parameter wins, then the first Accept-Language tag. `undefined` means the
 * request carries no evidence, so callers fall back to the shipped default.
 */
export const getRequestLocale = (context: AppContext) =>
  context.req.query("locale")?.trim()
  || context.req.header("Accept-Language")?.split(",")[0]?.trim()
  || undefined;

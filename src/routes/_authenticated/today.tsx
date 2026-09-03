import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy "/today" route — the Geral (home) experience lives on /dashboard.
 * Keep the route file so existing bookmarks/deep-links still resolve, but
 * always redirect. Hooks like useTodaysCare remain available for Geral.
 */
export const Route = createFileRoute("/_authenticated/today")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => null,
});

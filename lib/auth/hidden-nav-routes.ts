/** In `pages` table but not shown in sidebar/mobile nav until the feature ships. */
export const HIDDEN_NAV_ROUTES = ["/assistant"] as const;

export function isHiddenNavRoute(route: string): boolean {
  return (HIDDEN_NAV_ROUTES as readonly string[]).includes(route);
}

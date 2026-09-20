/**
 * Layout for console and account surfaces (supplier workspace, operations
 * consoles, auth, apply, notifications, status).
 *
 * These screens keep the standard centered container from the v1 shell, while
 * the marketplace surfaces (home, catalogue, product, cart, checkout, orders)
 * live outside this group and control their own width — denser grids, rails
 * and sticky action bars need it.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <div className="container">{children}</div>;
}

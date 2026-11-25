/**
 * Minimal hash router with the small slice of the TanStack Router API the app uses
 * (Link, Outlet, useNavigate, useRouterState). Views live in `location.hash` as plain
 * names (#calendar, #brand-<id>), which is what a hosted Artifact page supports.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from "react";

const listen = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const getHash = () => (typeof location === "undefined" ? "" : location.hash.replace(/^#/, ""));

/** "/studio/brands/$brandId" + params → hash name. */
export function toHash(to: string, params?: Record<string, string>) {
  let p = to.replace(/^\/studio\/?/, "").replace(/\/$/, "");
  if (params) for (const [k, v] of Object.entries(params)) p = p.replace(`$${k}`, v);
  if (p.startsWith("brands/")) return `brand-${p.slice(7)}`;
  if (p === "settings") return "options"; // "settings" is reserved by the host
  return p || "overview";
}
export function toPath(hash: string) {
  if (!hash || hash === "overview") return "/studio";
  if (hash.startsWith("brand-")) return `/studio/brands/${hash.slice(6)}`;
  if (hash === "options") return "/studio/settings";
  return `/studio/${hash}`;
}

export function useHash() {
  return useSyncExternalStore(listen, getHash, () => "");
}

export function navigateTo(to: string, params?: Record<string, string>) {
  const h = toHash(to, params);
  if (getHash() !== h) location.hash = h;
  window.scrollTo(0, 0);
}

export function useNavigate() {
  return (opts: { to: string; params?: Record<string, string> }) => {
    navigateTo(opts.to, opts.params);
    return Promise.resolve();
  };
}

export function useRouterState<T>({ select }: { select: (s: { location: { pathname: string } }) => T }) {
  const hash = useHash();
  return select({ location: { pathname: toPath(hash) } });
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  params?: Record<string, string>;
  activeOptions?: { exact?: boolean };
  children?: ReactNode;
};
export function Link({ to, params, activeOptions, onClick, ...rest }: LinkProps) {
  const hash = useHash();
  const target = toHash(to, params);
  const cur = hash || "overview";
  const active = activeOptions?.exact ? cur === target : cur === target || (target === "brands" && cur.startsWith("brand-"));
  return (
    <a
      {...rest}
      href={`#${target}`}
      data-status={active ? "active" : undefined}
      onClick={(e) => {
        onClick?.(e);
        window.scrollTo(0, 0);
      }}
    />
  );
}

/** The route table is registered by src/routes.tsx. */
let routes: (path: string) => ReactNode = () => null;
export function registerRoutes(fn: (path: string) => ReactNode) {
  routes = fn;
}
export function Outlet() {
  const hash = useHash();
  return <>{routes(toPath(hash))}</>;
}

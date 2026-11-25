import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  emptyWorkspace,
  type Brand,
  type Campaign,
  type Experiment,
  type MetricSnapshot,
  type Post,
  type Trend,
  type Workspace,
} from "./types";

import { openBackend, type Backend } from "./persist";

/** Fills fields added after a workspace was first saved. */
export function migrate(raw: Partial<Workspace>): Workspace {
  const base = emptyWorkspace();
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    posts: (raw.posts ?? []).map((p) => ({
      ...p,
      tags: p.tags ?? [],
      edits: p.edits ?? [],
      sources: p.sources ?? [],
      metrics: p.metrics ?? [],
      hashtags: p.hashtags ?? [],
    })),
  } as Workspace;
}

/* ---------------- helpers ---------------- */

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
export const nowIso = () => new Date().toISOString();

export function blankPost(brandId: string, patch: Partial<Post> = {}): Post {
  const t = nowIso();
  return {
    id: uid(),
    brandId,
    date: "",
    platform: "instagram",
    format: "static",
    pillar: "",
    title: "",
    topic: "",
    hook: "",
    caption: "",
    cta: "",
    hashtags: [],
    brief: "",
    canvaUrl: "",
    postUrl: "",
    status: "idea",
    tags: [],
    notes: "",
    metrics: [],
    sources: [],
    edits: [],
    createdAt: t,
    updatedAt: t,
    ...patch,
  };
}

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

/* ---------------- context ---------------- */

type Updater = (ws: Workspace) => Workspace;

interface Store {
  ws: Workspace;
  ready: boolean;
  saveError: string | null;
  pending: number;
  backendKind: "cloud" | "local" | null;
  loadError: string | null;
  update: (fn: Updater) => void;
  // brands
  saveBrand: (b: Brand) => void;
  deleteBrand: (id: string) => void;
  // campaigns
  saveCampaign: (c: Campaign) => void;
  deleteCampaign: (id: string) => void;
  // posts
  savePost: (p: Post) => void;
  /** Applies a patch and logs every changed field (correction history). */
  editPost: (id: string, patch: Partial<Post>) => void;
  deletePost: (id: string) => void;
  addSnapshot: (postId: string, snap: MetricSnapshot) => void;
  // experiments / trends
  saveExperiment: (e: Experiment) => void;
  deleteExperiment: (id: string) => void;
  saveTrend: (t: Trend) => void;
  deleteTrend: (id: string) => void;
  revertImport: (importId: string) => void;
  replaceWorkspace: (ws: Workspace) => void;
}

const Ctx = createContext<Store | null>(null);

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [backendKind, setBackendKind] = useState<Backend["kind"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const backend = useRef<Backend | null>(null);
  const last = useRef<Workspace | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const be = await openBackend();
      be.onStatus((st) => {
        setPending(st.pending);
        setSaveError(st.error);
      });
      try {
        const w = migrate(await be.load());
        if (!alive) return;
        backend.current = be;
        last.current = w;
        setBackendKind(be.kind);
        setWs(w);
        setReady(true);
      } catch (e) {
        if (alive) setLoadError((e as { message?: string })?.message ?? "The workspace couldn't be loaded.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!backend.current || !last.current || last.current === ws) return;
    backend.current.sync(last.current, ws);
    last.current = ws;
  }, [ws]);

  const update = useCallback((fn: Updater) => setWs((w) => fn(w)), []);

  const store = useMemo<Store>(
    () => ({
      ws,
      ready,
      saveError,
      pending,
      backendKind,
      loadError,
      update,
      saveBrand: (b) => update((w) => ({ ...w, brands: upsert(w.brands, b) })),
      deleteBrand: (id) =>
        update((w) => ({
          ...w,
          brands: w.brands.filter((b) => b.id !== id),
          posts: w.posts.filter((p) => p.brandId !== id),
          campaigns: w.campaigns.filter((c) => c.brandId !== id),
          imports: w.imports.filter((i) => i.brandId !== id),
          experiments: w.experiments.filter((e) => e.brandId !== id),
          trends: w.trends.filter((t) => t.brandId !== id),
        })),
      saveCampaign: (c) => update((w) => ({ ...w, campaigns: upsert(w.campaigns, c) })),
      deleteCampaign: (id) =>
        update((w) => ({
          ...w,
          campaigns: w.campaigns.filter((c) => c.id !== id),
          posts: w.posts.map((p) => (p.campaignId === id ? { ...p, campaignId: undefined } : p)),
        })),
      savePost: (p) =>
        update((w) => ({ ...w, posts: upsert(w.posts, { ...p, updatedAt: nowIso() }) })),
      editPost: (id, patch) =>
        update((w) => ({
          ...w,
          posts: w.posts.map((p) => {
            if (p.id !== id) return p;
            const at = nowIso();
            const logs = Object.entries(patch)
              .filter(
                ([k, v]) => k !== "edits" && k !== "metrics" && show((p as never)[k]) !== show(v),
              )
              .map(([k, v]) => ({ at, field: k, from: show((p as never)[k]), to: show(v) }));
            return { ...p, ...patch, edits: [...p.edits, ...logs], updatedAt: at };
          }),
        })),
      deletePost: (id) =>
        update((w) => ({
          ...w,
          posts: w.posts.filter((p) => p.id !== id),
          experiments: w.experiments.map((e) => ({
            ...e,
            a: { ...e.a, postIds: e.a.postIds.filter((x) => x !== id) },
            b: { ...e.b, postIds: e.b.postIds.filter((x) => x !== id) },
          })),
        })),
      addSnapshot: (postId, snap) =>
        update((w) => ({
          ...w,
          posts: w.posts.map((p) =>
            p.id === postId ? { ...p, metrics: [...p.metrics, snap], updatedAt: nowIso() } : p,
          ),
        })),
      saveExperiment: (e) => update((w) => ({ ...w, experiments: upsert(w.experiments, e) })),
      deleteExperiment: (id) =>
        update((w) => ({ ...w, experiments: w.experiments.filter((e) => e.id !== id) })),
      saveTrend: (t) => update((w) => ({ ...w, trends: upsert(w.trends, t) })),
      deleteTrend: (id) => update((w) => ({ ...w, trends: w.trends.filter((t) => t.id !== id) })),
      revertImport: (importId) =>
        update((w) => ({
          ...w,
          // Posts that only exist because of this import are removed; others lose its snapshots/source refs.
          posts: w.posts
            .filter((p) => p.createdByImport !== importId)
            .map((p) => ({
              ...p,
              metrics: p.metrics.filter((m) => m.importId !== importId),
              sources: p.sources.filter((s) => s.importId !== importId),
            })),
          imports: w.imports.map((i) => (i.id === importId ? { ...i, status: "reverted" } : i)),
        })),
      replaceWorkspace: (next) => setWs(migrate(next)),
    }),
    [ws, ready, saveError, pending, backendKind, loadError, update],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/* ---------------- view state: brand switcher + global filters ---------------- */

export interface Filters {
  platform: string; // "all" | Platform
  format: string;
  pillar: string;
  campaign: string;
  month: string; // "all" | yyyy-mm
  from: string; // yyyy-mm-dd
  to: string;
}
export const defaultFilters: Filters = {
  platform: "all",
  format: "all",
  pillar: "all",
  campaign: "all",
  month: "all",
  from: "",
  to: "",
};

interface View {
  brandId: string; // "all" | id
  setBrandId: (id: string) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
}
const ViewCtx = createContext<View | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [brandId, setBrandIdState] = useState("all");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  useEffect(() => {
    try {
      const v = localStorage.getItem("dmcc:brand");
      if (v) setBrandIdState(v);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setBrandId = (id: string) => {
    setBrandIdState(id);
    setFilters((f) => ({ ...f, pillar: "all", campaign: "all" }));
    try {
      localStorage.setItem("dmcc:brand", id);
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <ViewCtx.Provider value={{ brandId, setBrandId, filters, setFilters }}>
      {children}
    </ViewCtx.Provider>
  );
}

export function useView() {
  const v = useContext(ViewCtx);
  if (!v) throw new Error("useView outside ViewProvider");
  return v;
}

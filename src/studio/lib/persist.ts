/**
 * Persistence. In the hosted page the workspace lives in the page's own database (`db`
 * capability): one document per brand, post, campaign, import, experiment and trend, plus
 * `meta/settings`. Access rules restrict reading and writing to the owner and editors.
 * Outside the viewer (or when the database is unavailable) it falls back to this browser's
 * IndexedDB, and the UI says so.
 *
 * Writes are diffed by object identity: the app updates state immutably, so only entities
 * whose object changed are written, and removed ones are deleted.
 */
import { useCapability } from "./platform";
import { emptyWorkspace, type Workspace } from "./types";

type Snap = { id: string; data(): Record<string, unknown> | undefined };
type QuerySnap = { docs: Snap[] };
interface Query {
  where(f: string, op: string, v: unknown): Query;
  orderBy(f: string, dir?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
}
interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface DB {
  doc(path: string): DocRef;
  collection(path: string): Query & { doc(id: string): DocRef };
}

export const COLLECTIONS = ["brands", "campaigns", "posts", "imports", "experiments", "trends"] as const;
type Coll = (typeof COLLECTIONS)[number];

export interface Backend {
  kind: "cloud" | "local";
  load(): Promise<Workspace>;
  sync(prev: Workspace, next: Workspace): void;
  onStatus(fn: (s: SyncStatus) => void): void;
}
export interface SyncStatus {
  pending: number;
  error: string | null;
}

/* ---------------- cloud ---------------- */

function cloud(db: DB): Backend {
  let statusFn: (s: SyncStatus) => void = () => {};
  let pending = 0;
  let error: string | null = null;
  const chains = new Map<string, Promise<void>>(); // one write at a time per document
  let active = 0;
  const waiting: (() => void)[] = [];
  const emit = () => statusFn({ pending, error });

  const slot = async () => {
    if (active >= 6) await new Promise<void>((r) => waiting.push(r));
    active++;
  };
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  async function attempt(fn: () => Promise<void>) {
    for (let i = 0; ; i++) {
      try {
        await fn();
        return;
      } catch (e) {
        const code = (e as { code?: string })?.code ?? "unavailable";
        if ((code === "unavailable" || code === "resource_exhausted") && i < 5) {
          await new Promise((r) => setTimeout(r, 400 * 2 ** i + Math.random() * 300));
          continue;
        }
        throw e;
      }
    }
  }

  function enqueue(path: string, op: () => Promise<void>) {
    pending++;
    emit();
    const prev = chains.get(path) ?? Promise.resolve();
    const run = prev
      .then(async () => {
        await slot();
        try {
          await attempt(op);
        } finally {
          release();
        }
      })
      .catch((e) => {
        const code = (e as { code?: string })?.code;
        error =
          code === "quota_exceeded"
            ? "The workspace database is full. Delete old imports or brands you no longer need."
            : code === "invalid_argument"
              ? "One item was too large to save (over 256 KB). Remove some imported source columns and try again."
              : `Couldn't save a change (${code ?? "unknown error"}). Export a backup from Settings.`;
      })
      .finally(() => {
        pending--;
        if (chains.get(path) === run) chains.delete(path);
        emit();
      });
    chains.set(path, run);
  }

  const clean = (o: unknown) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

  return {
    kind: "cloud",
    onStatus: (fn) => {
      statusFn = fn;
    },
    async load() {
      const ws = emptyWorkspace();
      for (const c of COLLECTIONS) {
        const items: Record<string, unknown>[] = [];
        let last: string | null = null;
        for (;;) {
          let q = db.collection(c).orderBy("id").limit(1000);
          if (last) q = q.where("id", ">", last);
          const snap = await attempt2(() => q.get());
          for (const d of snap.docs) {
            const v = d.data();
            if (v) items.push(v);
          }
          if (snap.docs.length < 1000) break;
          last = snap.docs[snap.docs.length - 1]!.id;
        }
        (ws as unknown as Record<string, unknown[]>)[c] = items;
      }
      const s = await attempt2(() => db.doc("meta/settings").get());
      if (s.exists) ws.settings = { ...ws.settings, ...(s.data() as object) };
      return ws;
    },
    sync(prev, next) {
      for (const c of COLLECTIONS as readonly Coll[]) {
        const a = prev[c] as { id: string }[];
        const b = next[c] as { id: string }[];
        if (a === b) continue;
        const before = new Map(a.map((x) => [x.id, x]));
        const after = new Set<string>();
        for (const item of b) {
          after.add(item.id);
          if (before.get(item.id) !== item) {
            const body = clean(item);
            enqueue(`${c}/${item.id}`, () => db.collection(c).doc(item.id).set(body));
          }
        }
        for (const id of before.keys()) if (!after.has(id)) enqueue(`${c}/${id}`, () => db.collection(c).doc(id).delete());
      }
      if (prev.settings !== next.settings) {
        const body = clean(next.settings);
        enqueue("meta/settings", () => db.doc("meta/settings").set(body));
      }
    },
  };
}

async function attempt2<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if ((code === "unavailable" || code === "resource_exhausted") && i < 4) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** i));
        continue;
      }
      throw e;
    }
  }
}

/* ---------------- local fallback (IndexedDB in this browser) ---------------- */

function local(): Backend {
  const NAME = "social-command-center";
  let statusFn: (s: SyncStatus) => void = () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("ws");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return {
    kind: "local",
    onStatus: (fn) => {
      statusFn = fn;
    },
    async load() {
      try {
        const db = await open();
        const v = await new Promise<Workspace | undefined>((resolve, reject) => {
          const r = db.transaction("ws").objectStore("ws").get("main");
          r.onsuccess = () => resolve(r.result as Workspace | undefined);
          r.onerror = () => reject(r.error);
        });
        return v ?? emptyWorkspace();
      } catch {
        return emptyWorkspace();
      }
    },
    sync(_prev, next) {
      if (timer) clearTimeout(timer);
      statusFn({ pending: 1, error: null });
      timer = setTimeout(async () => {
        try {
          const db = await open();
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("ws", "readwrite");
            tx.objectStore("ws").put(next, "main");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          statusFn({ pending: 0, error: null });
        } catch (e) {
          statusFn({ pending: 0, error: `Couldn't save in this browser: ${(e as Error).message}` });
        }
      }, 300);
    },
  };
}

export async function openBackend(): Promise<Backend> {
  const db = await useCapability<DB>("db");
  return db ? cloud(db) : local();
}

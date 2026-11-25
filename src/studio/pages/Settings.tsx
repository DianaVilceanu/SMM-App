import { ask, notify, saveFile } from "../lib/platform";
import { useRef } from "react";
import { demoWorkspace, removeDemo } from "../lib/demo";
import { emptyWorkspace, type Settings as S, type Workspace } from "../lib/types";
import { useStore, useView } from "../lib/store";
import { Button, Card, Notice, PageHeader, Select } from "../components/ui";

export function Settings() {
  const { ws, update, replaceWorkspace, backendKind } = useStore();
  const { setBrandId } = useView();
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<S>) =>
    update((w) => ({ ...w, settings: { ...w.settings, ...patch } }));
  const hasDemo = ws.brands.some((b) => b.isDemo);
  const size = new Blob([JSON.stringify(ws)]).size;

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Analysis rules" subtitle="These apply to every screen.">
          <div className="grid gap-3">
            <Select
              label="Engagement rate denominator"
              value={ws.settings.erBasis}
              onChange={(e) => set({ erBasis: e.target.value as S["erBasis"] })}
            >
              <option value="reach">Reach (recommended)</option>
              <option value="views">Views</option>
              <option value="impressions">Impressions</option>
            </Select>
            <p className="-mt-1 text-xs text-muted-foreground">
              If a post is missing the chosen metric, the next available one is used (reach → views
              → impressions). Those values are marked with * in tables.
            </p>
            <Select
              label="Minimum posts before a pattern is reported"
              value={String(ws.settings.minSample)}
              onChange={(e) => set({ minSample: Number(e.target.value) })}
            >
              {[3, 5, 8, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n} posts{n === 5 ? " (default)" : n === 3 ? " (exploratory)" : ""}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">Light and dark mode follow your claude.ai theme.</p>
          </div>
        </Card>

        <Card
          title="Your data"
          subtitle={`${ws.brands.length} brands · ${ws.posts.length} content items · ${ws.imports.length} imports · ${(size / 1024).toFixed(0)} KB`}
        >
          <Notice tone={backendKind === "cloud" ? "info" : "warn"} className="mb-4">
            {backendKind === "cloud" ? (
              <>
                Saved to this page's <strong>private workspace</strong>: only you, and anyone you invite as an Editor,
                can read or change it. It's kept across sessions and devices. Export a backup now and then anyway.
              </>
            ) : (
              <>
                Not connected to your private workspace, so data is kept <strong>only in this browser</strong>. Open the
                page in claude.ai while signed in to save it to your account.
              </>
            )}
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                void saveFile(`command-center-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ws, null, 2), "application/json").then(
                  (r) => r === "failed" && notify("This view can't save files. Open the page in claude.ai in a browser to export."),
                )
              }
            >
              Export backup (.json)
            </Button>
            <Button variant="outline" onClick={() => file.current?.click()}>
              Restore from backup
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const data = JSON.parse(await f.text()) as Workspace;
                  if (!Array.isArray(data.brands) || !Array.isArray(data.posts))
                    throw new Error("Not a Command Center backup");
                  const ok = await ask(
                    `Replace the current workspace (${ws.brands.length} brands, ${ws.posts.length} items) with the backup (${data.brands.length} brands, ${data.posts.length} items)?`,
                    { confirmLabel: "Replace workspace" },
                  );
                  if (ok) {
                    replaceWorkspace(data);
                    setBrandId("all");
                  }
                } catch (err) {
                  void notify(`Couldn't read that file: ${(err as Error).message}`);
                }
                e.target.value = "";
              }}
            />
          </div>
        </Card>

        <Card
          title="Demo sandbox"
          subtitle="Synthetic data for exploring the interface. Never mixed into real data without a warning."
        >
          <p className="mb-3 text-sm text-muted-foreground">
            Adds a brand called “Demo Studio (synthetic)” with made-up posts and metrics so you can
            try every screen. A banner stays visible while it's loaded. Remove it before you use
            consolidated numbers.
          </p>
          {hasDemo ? (
            <Button
              variant="danger"
              onClick={() => {
                update(removeDemo);
                setBrandId("all");
              }}
            >
              Remove demo data
            </Button>
          ) : (
            <Button variant="outline" onClick={() => update(demoWorkspace)}>
              Load demo data
            </Button>
          )}
        </Card>

        <Card title="Reset">
          <p className="mb-3 text-sm text-muted-foreground">
            Deletes every brand, post, import and experiment in this workspace.
          </p>
          <Button
            variant="danger"
            onClick={async () => {
              if (!(await ask("Delete EVERYTHING in this workspace? Export a backup first. This can't be undone.", { confirmLabel: "Continue" }))) return;
              if (!(await ask("Last check: delete all brands, posts, imports and experiments?", { confirmLabel: "Delete all data" }))) return;
              replaceWorkspace(emptyWorkspace());
              setBrandId("all");
            }}
          >
            Delete all data
          </Button>
        </Card>
      </div>
    </>
  );
}

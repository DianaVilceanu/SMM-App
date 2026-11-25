/**
 * Bridges to the claude.ai page runtime. Every capability may be absent (a plain browser,
 * a preview, a signed-out viewer); each helper falls back to plain browser behaviour.
 */
type Use = <T = unknown>(name: string) => Promise<T | null>;
declare global {
  interface Window {
    claude?: { use?: Use };
  }
}

export async function useCapability<T>(name: string, timeoutMs = 10000): Promise<T | null> {
  const use = typeof window !== "undefined" ? window.claude?.use : undefined;
  if (!use) {
    // The runtime may attach `claude` after our first script run: wait briefly for it.
    const start = Date.now();
    while (Date.now() - start < 1500) {
      await new Promise((r) => setTimeout(r, 100));
      if (window.claude?.use) return useCapability<T>(name, timeoutMs);
    }
    return null;
  }
  try {
    return await Promise.race([use<T>(name), new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
  } catch {
    return null;
  }
}

type Downloads = { save: (req: { filename: string; data: string | Blob }) => Promise<unknown> };

/** Offers a generated file to the viewer. Resolves to a short status for the UI. */
export async function saveFile(filename: string, data: string, type: string): Promise<"saved" | "declined" | "failed"> {
  const dl = await useCapability<Downloads>("downloads", 3000);
  if (dl) {
    try {
      await dl.save({ filename, data: new Blob([data], { type }) });
      return "saved";
    } catch (e) {
      return (e as { code?: string })?.code === "declined" ? "declined" : "failed";
    }
  }
  if (window.claude?.use) return "failed"; // inside the viewer without downloads: plain links are blocked
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return "saved";
}

/* ---------------- in-page confirm / notice (native dialogs are blocked in the viewer) ---------------- */

export interface DialogRequest {
  id: number;
  message: string;
  confirmLabel: string;
  danger: boolean;
  alertOnly: boolean;
  resolve: (ok: boolean) => void;
}
let listeners: ((d: DialogRequest | null) => void)[] = [];
let seq = 0;
export function onDialog(fn: (d: DialogRequest | null) => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
function open(message: string, confirmLabel: string, danger: boolean, alertOnly: boolean) {
  return new Promise<boolean>((resolve) => {
    const req: DialogRequest = {
      id: ++seq,
      message,
      confirmLabel,
      danger,
      alertOnly,
      resolve: (ok) => {
        listeners.forEach((l) => l(null));
        resolve(ok);
      },
    };
    listeners.forEach((l) => l(req));
  });
}
export const ask = (message: string, opts: { confirmLabel?: string; danger?: boolean } = {}) =>
  open(message, opts.confirmLabel ?? "Confirm", opts.danger ?? true, false);
export const notify = (message: string) => open(message, "OK", false, true).then(() => undefined);

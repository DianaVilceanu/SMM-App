import { useEffect, useState } from "react";
import { onDialog, type DialogRequest } from "../lib/platform";
import { Button } from "./ui";

/** Renders the in-page confirmations requested through `ask()` / `notify()`. */
export function ConfirmHost() {
  const [req, setReq] = useState<DialogRequest | null>(null);
  useEffect(() => onDialog(setReq), []);
  if (!req) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e) => e.key === "Escape" && req.resolve(false)}
    >
      <div role="alertdialog" aria-modal="true" aria-label={req.alertOnly ? "Notice" : "Confirm"} className="w-full max-w-md rounded-[var(--radius)] border bg-card p-5 shadow-xl">
        <p className="text-sm leading-relaxed whitespace-pre-line">{req.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          {!req.alertOnly && (
            <Button variant="outline" onClick={() => req.resolve(false)}>
              Cancel
            </Button>
          )}
          <Button autoFocus variant={req.danger ? "danger" : "default"} onClick={() => req.resolve(true)}>
            {req.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

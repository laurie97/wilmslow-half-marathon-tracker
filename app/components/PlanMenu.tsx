"use client";

import { useRef, useState } from "react";
import type { PlanSummary } from "@/lib/progress";

interface Notice {
  kind: "ok" | "warning" | "error";
  text: string;
  details?: string[];
}

/** Local date and time for "plan last updated". */
function formatUpdated(iso: string): string {
  const text = new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return text;
}

/** Plan menu: download, upload and when the plan was last updated. */
export default function PlanMenu({
  plan,
  onUploaded,
}: {
  plan: PlanSummary | null;
  onUploaded: () => void;
}) {
  const [open, setOpen] = useState(!plan);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Downloads the plan JSON with progress filled in. */
  async function download() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/plan", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "Download failed.");
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "plan.json";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setNotice({
        kind: "error",
        text: e instanceof Error ? e.message : "Download failed.",
      });
    }
    setBusy(false);
  }

  /** Uploads the chosen JSON file as the new plan. */
  async function upload(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      const text = await file.text();
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice({
          kind: "error",
          text: body.message ?? "Upload failed.",
          details: body.errors,
        });
      } else {
        setNotice(
          body.warning
            ? { kind: "warning", text: `Plan uploaded. ${body.warning}` }
            : { kind: "ok", text: "Plan uploaded. Your progress has been kept." },
        );
        onUploaded();
      }
    } catch {
      setNotice({ kind: "error", text: "Upload failed. Check your connection." });
    }
    if (fileInput.current) fileInput.current.value = "";
    setBusy(false);
  }

  const menu = (
    <div className="plan-menu">
      <button
        type="button"
        className="button-quiet"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Plan {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="plan-panel card">
          {plan && (
            <button
              type="button"
              className="menu-item"
              onClick={download}
              disabled={busy}
            >
              Download plan JSON
              <span className="muted small">with your progress filled in</span>
            </button>
          )}
          <label className={`menu-item${busy ? " disabled" : ""}`}>
            Upload plan JSON
            <span className="muted small">
              {plan ? "replaces the plan; progress is kept" : "choose your plan file"}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
          </label>
          {plan && (
            <p className="muted small updated">
              Plan last updated {formatUpdated(plan.updatedAt)}
            </p>
          )}
          {notice && (
            <div className={`notice notice-${notice.kind}`} role="status">
              <p>{notice.text}</p>
              {notice.details && notice.details.length > 0 && (
                <ul>
                  {notice.details.slice(0, 8).map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                  {notice.details.length > 8 && (
                    <li>…and {notice.details.length - 8} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
  return menu;
}

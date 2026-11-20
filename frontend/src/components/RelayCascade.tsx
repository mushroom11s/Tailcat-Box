import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { derpStatus, parseDerpEvent, relayLabel, type DerpCandidate, type DerpStatus } from "../lib/derpScan";
import { regionOptions } from "../lib/miao";
import { onTailcatEvent } from "../lib/wails";

type Props = {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string, label?: string) => void;
};

type Branch = "auto" | "official" | "scan";

const LATENCY_OK_MS = 120;

function branchOf(value: string): Branch {
  if (value.startsWith("scan:")) {
    return "scan";
  }
  if (value.startsWith("region:")) {
    return "official";
  }
  return "auto";
}

function Chevron() {
  return (
    <svg className="relay-cascade-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RelayCascade({ id, value, disabled, onChange }: Props) {
  const { t, locale } = useI18n();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState<Branch>("official");
  const [status, setStatus] = useState<DerpStatus | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    derpStatus()
      .then((next) => {
        if (alive) {
          setStatus(next);
        }
      })
      .catch(() => undefined);
    const off = onTailcatEvent((ev) => {
      const next = parseDerpEvent(ev);
      if (!next) {
        return;
      }
      if (next.type === "status" || next.type === "shared") {
        setStatus(next.status);
        return;
      }
      if (next.type === "switched") {
        void derpStatus()
          .then(setStatus)
          .catch(() => undefined);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  function place() {
    const el = trigger.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 360);
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    const below = window.innerHeight - rect.bottom;
    const above = below < 240 && rect.top > below;
    setBox({ top: above ? rect.top - 6 : rect.bottom + 6, left: Math.max(12, left), width, above });
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    place();
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target) || panel.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const regions = regionOptions(locale);
  const scanned = status?.candidates ?? [];

  function currentLabel(): string {
    if (value.startsWith("region:")) {
      const code = value.slice("region:".length);
      return regions.find((item) => item.code === code)?.label ?? code;
    }
    if (value.startsWith("scan:")) {
      const idNum = Number(value.slice("scan:".length));
      const hit = scanned.find((item) => item.regionId === idNum);
      if (!hit) {
        return t("remoteRelayScanned");
      }
      const wait = hit.latencyMs > 0 ? ` · ${t("derpLatency").replace("{ms}", String(hit.latencyMs))}` : "";
      return `${relayLabel(hit)}${wait}`;
    }
    return t("regionAuto");
  }

  function labelFor(next: string): string {
    if (next.startsWith("region:")) {
      const code = next.slice("region:".length);
      return regions.find((item) => item.code === code)?.label ?? code;
    }
    if (next.startsWith("scan:")) {
      const idNum = Number(next.slice("scan:".length));
      const hit = scanned.find((item) => item.regionId === idNum);
      return hit ? relayLabel(hit) : "";
    }
    return "";
  }

  function pick(next: string) {
    onChange(next, labelFor(next));
    setOpen(false);
  }

  const menu = open
    ? createPortal(
        <div
          ref={panel}
          id={panelId}
          className={`relay-cascade-panel${box?.above ? " is-above" : ""}`}
          role="listbox"
          aria-label={t("remoteRelay")}
          style={
            box
              ? { top: box.top, left: box.left, width: box.width }
              : { top: 0, left: 0, visibility: "hidden" }
          }
        >
          <div className="relay-cascade-col">
            <button
              type="button"
              className={`relay-cascade-item${branch === "auto" ? " is-active" : ""}${value === "" ? " is-selected" : ""}`}
              onMouseEnter={() => setBranch("auto")}
              onClick={() => pick("")}
            >
              <span>{t("regionAuto")}</span>
            </button>
            <button
              type="button"
              className={`relay-cascade-item${branch === "official" ? " is-active" : ""}`}
              onMouseEnter={() => setBranch("official")}
              onClick={() => setBranch("official")}
            >
              <span>{t("remoteRelayOfficial")}</span>
              <Chevron />
            </button>
            <button
              type="button"
              className={`relay-cascade-item${branch === "scan" ? " is-active" : ""}`}
              onMouseEnter={() => setBranch("scan")}
              onClick={() => setBranch("scan")}
            >
              <span>{t("remoteRelayScanned")}</span>
              <Chevron />
            </button>
          </div>
          <div className="relay-cascade-col">
            {branch === "auto" ? <p className="relay-cascade-hint">{t("remoteRelayFollow")}</p> : null}
            {branch === "official"
              ? regions.map((item) => {
                  const token = `region:${item.code}`;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      role="option"
                      aria-selected={value === token}
                      className={`relay-cascade-item${value === token ? " is-selected" : ""}`}
                      onClick={() => pick(token)}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })
              : null}
            {branch === "scan" && scanned.length === 0 ? <p className="relay-cascade-hint">{t("remoteRelayNone")}</p> : null}
            {branch === "scan"
              ? scanned.map((item) => (
                  <ScanOption key={item.regionId} item={item} selected={value === `scan:${item.regionId}`} onPick={() => pick(`scan:${item.regionId}`)} />
                ))
              : null}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`relay-cascade${open ? " is-open" : ""}`} ref={root}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="relay-cascade-trigger"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t("remoteRelay")}
        disabled={disabled}
        onClick={() => {
          setBranch(branchOf(value));
          setOpen((prev) => !prev);
        }}
      >
        <span className="relay-cascade-value">{currentLabel()}</span>
      </button>
      {menu}
    </div>
  );
}

function ScanOption({ item, selected, onPick }: { item: DerpCandidate; selected: boolean; onPick: () => void }) {
  const { t } = useI18n();
  const dot = item.latencyMs > 0 && item.latencyMs <= LATENCY_OK_MS ? "status-dot" : "status-dot bad";
  return (
    <button type="button" role="option" aria-selected={selected} className={`relay-cascade-item${selected ? " is-selected" : ""}`} onClick={onPick}>
      <span className="relay-cascade-name">{relayLabel(item)}</span>
      {item.latencyMs > 0 ? (
        <span className="relay-cascade-ms">
          <span className={dot} aria-hidden="true" />
          {t("derpLatency").replace("{ms}", String(item.latencyMs))}
        </span>
      ) : null}
    </button>
  );
}

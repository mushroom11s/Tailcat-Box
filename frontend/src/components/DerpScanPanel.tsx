import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import {
  DERP_ENGINES,
  addDerpKey,
  derpStatus,
  exportRelayShare,
  importRelayShare,
  parseDerpEvent,
  refreshDerpQuotas,
  removeDerpKey,
  relayLabel,
  scanDerp,
  sendRelayShare,
  setDerpAuto,
  switchDerpRegion,
  type DerpKeySlot,
  type DerpStatus,
} from "../lib/derpScan";
import { abbreviateAddress } from "../lib/roomLabel";
import { listShareDevices } from "../lib/remoteDevices";
import { onTailcatEvent } from "../lib/wails";
import HelpTip, { HeadingHelp } from "./HelpTip";
import LoadingCat from "./LoadingCat";
import { useToasts } from "./toasts";

type SharePeer = { address: string; label: string };

function shareError(err: unknown, t: (key: MessageKey) => string): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (raw.includes("not in an open chat")) {
    return t("derpShareOffline");
  }
  if (raw.includes("no relays")) {
    return t("derpShareNoNodes");
  }
  if (raw.includes("not a relay share") || raw.includes("relay share is empty") || raw.includes("too large")) {
    return t("derpShareBad");
  }
  if (raw.includes("running window") || raw.includes("file picker") || raw.includes("save dialog")) {
    return t("derpShareNeedsApp");
  }
  return raw;
}

function savedDevices(): SharePeer[] {
  return listShareDevices();
}

function shareOptionLabel(item: SharePeer): string {
  const name = item.label.trim();
  if (name && name !== item.address) {
    return name;
  }
  return abbreviateAddress(item.address);
}

const OPEN_KEY = "tailcat-derp-scan-open";
/** Rows per page in the scanned relay list. */
const RELAY_PAGE_SIZE = 5;
/** Keys plus the add field share pages of this size, so two saved keys already turn a page. */
const KEY_PAGE_SIZE = 2;
/** Round-trips above this get a red status dot; otherwise green. */
const LATENCY_OK_MS = 120;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}

function latencyDotClass(ms: number): string {
  return ms > 0 && ms <= LATENCY_OK_MS ? "status-dot" : "status-dot bad";
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // ignore
  }
}

function ChevronIcon({ up = false }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={up ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DerpScanPanel({ customMap }: { customMap: boolean }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(readOpen);
  const [st, setSt] = useState<DerpStatus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [err, setErr] = useState("");
  const [relayPage, setRelayPage] = useState(0);
  const [keyPages, setKeyPages] = useState<Record<string, number>>({});
  const [peers, setPeers] = useState<SharePeer[]>([]);
  const [peer, setPeer] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const { note } = useToasts();

  useEffect(() => {
    let alive = true;
    derpStatus()
      .then((next) => {
        if (!alive) {
          return;
        }
        setSt(next);
        setAuto(next.auto);
        if (next.keys.length > 0) {
          void refreshDerpQuotas()
            .then((q) => {
              if (alive) {
                setSt(q);
              }
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
    const off = onTailcatEvent((ev) => {
      const next = parseDerpEvent(ev);
      if (next?.type === "status" || next?.type === "shared") {
        setSt(next.status);
        setAuto(next.status.auto);
        if (next.type === "shared") {
          note(t("derpShareReceived"));
        }
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, [note, t]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPeers(savedDevices());
  }, [open]);

  useEffect(() => {
    setRelayPage(0);
  }, [st?.scannedAt]);

  function setExpanded(next: boolean) {
    setOpen(next);
    writeOpen(next);
  }

  function explain(raw: string): string {
    return raw.includes("search key required") ? t("derpNeedKey") : raw;
  }

  async function act(run: () => Promise<DerpStatus>) {
    setBusy(true);
    setErr("");
    try {
      const next = await run();
      setSt(next);
      setAuto(next.auto);
      return next;
    } catch (e) {
      setErr(explain(errorText(e)));
      throw e;
    } finally {
      setBusy(false);
    }
  }

  function onAutoChange(checked: boolean) {
    setAuto(checked);
    void act(() => setDerpAuto(checked)).catch(() => undefined);
  }

  async function runShare(task: () => Promise<void>) {
    setShareBusy(true);
    setErr("");
    try {
      await task();
    } catch (e) {
      setErr(shareError(e, t));
    } finally {
      setShareBusy(false);
    }
  }

  function addKey(engineId: string, e?: FormEvent) {
    e?.preventDefault();
    const value = (drafts[engineId] ?? "").trim();
    if (!value) {
      return;
    }
    void act(async () => {
      const next = await addDerpKey(engineId, value);
      setDrafts((prev) => ({ ...prev, [engineId]: "" }));
      const count = next.keys.filter((slot) => slot.engine === engineId).length;
      const last = Math.max(0, Math.ceil((count + 1) / KEY_PAGE_SIZE) - 1);
      setKeyPages((prev) => ({ ...prev, [engineId]: last }));
      void refreshDerpQuotas()
        .then(setSt)
        .catch(() => undefined);
      return next;
    }).catch(() => undefined);
  }

  function scan() {
    void act(async () => {
      await setDerpAuto(auto);
      return scanDerp();
    }).catch(() => undefined);
  }

  function refreshQuota() {
    setQuotaBusy(true);
    setErr("");
    refreshDerpQuotas()
      .then(setSt)
      .catch((e) => setErr(explain(errorText(e))))
      .finally(() => setQuotaBusy(false));
  }

  const scanning = busy || Boolean(st?.scanning);
  const country = !st?.country ? t("derpCountryUnknown") : st.country === "CN" ? t("derpCountryCN") : st.country;
  const usingShort =
    st?.mode === "custom"
      ? t("derpCustom")
      : st?.mode === "scan" && st.active
        ? relayLabel(st.active)
        : t("derpOfficial");
  const using =
    st?.mode === "scan" && st.active
      ? `${usingShort} · ${t("derpLatency").replace("{ms}", String(st.active.latencyMs))}`
      : usingShort;
  const official =
    st && st.officialMs < 0
      ? t("derpOfficialDown")
      : st && st.officialMs > 0
        ? t("derpOfficialLatency").replace("{ms}", String(st.officialMs))
        : "";
  const scannedAt = st?.scannedAt
    ? t("derpScannedAt").replace("{time}", new Date(st.scannedAt).toLocaleString(locale))
    : "";
  const shownErr = err || (st?.error && !scanning ? explain(st.error) : "");
  const slotsByEngine = (st?.keys ?? []).reduce<Record<string, DerpKeySlot[]>>((acc, slot) => {
    (acc[slot.engine] ??= []).push(slot);
    return acc;
  }, {});
  const keyCount = st?.keys.length ?? 0;
  const bestMs =
    st?.mode === "scan" && st.active
      ? st.active.latencyMs
      : st && st.officialMs > 0
        ? st.officialMs
        : 0;

  const candidates = st?.candidates ?? [];
  const relayPageCount = Math.max(1, Math.ceil(candidates.length / RELAY_PAGE_SIZE));
  const relayPageSafe = Math.min(relayPage, relayPageCount - 1);
  const relaySlice = candidates.slice(
    relayPageSafe * RELAY_PAGE_SIZE,
    relayPageSafe * RELAY_PAGE_SIZE + RELAY_PAGE_SIZE,
  );

  return (
    <div className={`derp-scan${open ? "" : " is-collapsed"}`}>
      <div
        className="derp-scan-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setExpanded(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!open);
          }
        }}
      >
        <div className="derp-scan-head-main">
          <HeadingHelp
            as="h3"
            className="kind"
            title={t("derpScanTitle")}
            help={
              <>
                <p>{t("derpScanLede")}</p>
                <p>{t("derpKeysHelp")}</p>
                <p>{t("derpScanPrivacy")}</p>
              </>
            }
          />
          {!open ? (
            <div className="derp-scan-summary">
              <span className="derp-summary-using" title={using}>
                {usingShort}
              </span>
              {bestMs > 0 ? (
                <span className="pill derp-ms">{t("derpLatency").replace("{ms}", String(bestMs))}</span>
              ) : null}
              {st?.officialMs != null && st.officialMs < 0 ? (
                <span className="pill bad">{t("derpOfficialDown")}</span>
              ) : null}
              <span className="derp-summary-meta">{country}</span>
              <span className="derp-summary-meta">
                {keyCount > 0
                  ? t("derpSummaryKeys").replace("{n}", String(keyCount))
                  : t("derpNeedKey")}
              </span>
              {scanning ? <span className="pill running">{t("derpScanning")}</span> : null}
              {shownErr && !scanning ? <span className="pill bad">{t("derpSummaryError")}</span> : null}
            </div>
          ) : null}
        </div>
        <button
          className="chat-identity-toggle"
          type="button"
          aria-expanded={open}
          aria-label={open ? t("derpCollapse") : t("derpExpand")}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!open);
          }}
        >
          <ChevronIcon up={open} />
        </button>
      </div>

      {open ? (
        <>
          <dl className="derp-facts">
            <div>
              <dt>{t("derpCountry")}</dt>
              <dd>{country}</dd>
            </div>
            <div>
              <dt>{t("derpUsing")}</dt>
              <dd>{using}</dd>
            </div>
            {official ? (
              <div>
                <dt>{t("derpOfficial")}</dt>
                <dd>{official}</dd>
              </div>
            ) : null}
          </dl>
          {customMap ? <p className="note">{t("derpCustomNote")}</p> : null}
          <div className="derp-engines">
            {DERP_ENGINES.map((engine) => {
              const slots = slotsByEngine[engine.id] ?? [];
              const keyPageCount = Math.max(1, Math.ceil((slots.length + 1) / KEY_PAGE_SIZE));
              const keyPage = Math.min(keyPages[engine.id] ?? 0, keyPageCount - 1);
              const keyStart = keyPage * KEY_PAGE_SIZE;
              const keyEnd = keyStart + KEY_PAGE_SIZE;
              const shownKeys = slots.slice(keyStart, Math.min(keyEnd, slots.length));
              const showAdd = keyEnd > slots.length && keyStart <= slots.length;
              const failed = st?.engineErrors?.[engine.name];
              return (
                <article className="derp-engine" key={engine.id} data-engine={engine.id}>
                  <header className="derp-engine-head">
                    <div className="label-with-help">
                      <label htmlFor={`derp-key-${engine.id}`}>{t(`derpEngine_${engine.id}`)}</label>
                      <HelpTip>{t(`derpEngineHelp_${engine.id}`)}</HelpTip>
                    </div>
                    {slots.length > 0 ? (
                      <span className="pill derp-engine-count">
                        {t("derpSummaryKeys").replace("{n}", String(slots.length))}
                      </span>
                    ) : null}
                  </header>
                  {shownKeys.length > 0 ? (
                    <ul className="derp-key-list">
                      {shownKeys.map((slot) => (
                        <li key={`${slot.engine}-${slot.index}`} className="derp-key-slot">
                          <span className="derp-key-hint">{slot.hint}</span>
                          <span className="derp-key-quota">
                            {slot.error ? slot.error : slot.quota || t("derpQuotaUnknown")}
                          </span>
                          <button
                            className="btn btn-ghost btn-small"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void act(() => removeDerpKey(slot.engine, slot.index)).catch(() => undefined)
                            }
                          >
                            {t("derpClearKey")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {showAdd ? (
                    <form className="derp-key-row" onSubmit={(e) => addKey(engine.id, e)}>
                      <input
                        id={`derp-key-${engine.id}`}
                        type="password"
                        value={drafts[engine.id] ?? ""}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [engine.id]: e.target.value }))}
                        placeholder={t("derpKeyPlaceholder")}
                        autoComplete="off"
                      />
                      <button className="btn btn-ghost btn-small" type="submit" disabled={busy}>
                        {t("derpAddKey")}
                      </button>
                    </form>
                  ) : null}
                  {slots.length >= KEY_PAGE_SIZE ? (
                    <div className="derp-list-pager">
                      <button
                        className="btn btn-ghost btn-small"
                        type="button"
                        aria-label={`${t(`derpEngine_${engine.id}`)} ${t("derpListPrev")}`}
                        disabled={keyPage <= 0}
                        onClick={() => setKeyPages((prev) => ({ ...prev, [engine.id]: Math.max(0, keyPage - 1) }))}
                      >
                        {t("derpListPrev")}
                      </button>
                      <span className="derp-list-page">
                        {t("derpListPage")
                          .replace("{page}", String(keyPage + 1))
                          .replace("{pages}", String(keyPageCount))
                          .replace("{total}", String(slots.length))}
                      </span>
                      <button
                        className="btn btn-ghost btn-small"
                        type="button"
                        aria-label={`${t(`derpEngine_${engine.id}`)} ${t("derpListNext")}`}
                        disabled={keyPage >= keyPageCount - 1}
                        onClick={() => setKeyPages((prev) => ({ ...prev, [engine.id]: Math.min(keyPageCount - 1, keyPage + 1) }))}
                      >
                        {t("derpListNext")}
                      </button>
                    </div>
                  ) : null}
                  {failed && !scanning ? (
                    <p className="err">{t("derpEngineFailed").replace("{msg}", failed)}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="label-with-help">
            <label className="check">
              <input type="checkbox" checked={auto} onChange={(e) => onAutoChange(e.target.checked)} />
              {t("derpAuto")}
            </label>
            <HelpTip>{t("derpAutoHelp")}</HelpTip>
          </div>
          <div className="row">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy || quotaBusy || !st?.hasKey}
              onClick={refreshQuota}
            >
              {quotaBusy ? t("derpQuotaRefreshing") : t("derpRefreshQuota")}
            </button>
            <button className="btn" type="button" disabled={scanning || customMap} onClick={scan}>
              {t("derpScanNow")}
            </button>
            {st?.mode === "scan" ? (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => void act(() => switchDerpRegion(0)).catch(() => undefined)}
              >
                {t("derpBackOfficial")}
              </button>
            ) : null}
          </div>
          {scanning ? <LoadingCat size="sm" label={t("derpScanning")} /> : null}
          {scannedAt && !scanning ? <p className="setting-help">{scannedAt}</p> : null}
          {st && st.scannedAt && st.candidates.length === 0 && !scanning ? (
            <p className="empty">{t("derpNoCandidates")}</p>
          ) : null}
          {candidates.length > 0 && st ? (
            <div className="derp-list-wrap">
              <ul className="derp-list">
                {relaySlice.map((c) => {
                  const active = st.mode === "scan" && st.active?.regionId === c.regionId;
                  return (
                    <li key={c.regionId} className={active ? "derp-row active" : "derp-row"}>
                      <span className="derp-name">{relayLabel(c)}</span>
                      <span className="derp-host">
                        {c.host}:{c.port}
                      </span>
                      <span className="derp-latency">
                        <span className={latencyDotClass(c.latencyMs)} aria-hidden="true" />
                        <span className="pill derp-ms">
                          {t("derpLatency").replace("{ms}", String(c.latencyMs))}
                        </span>
                      </span>
                      {active ? (
                        <span className="pill running derp-action">{t("derpInUse")}</span>
                      ) : (
                        <button
                          className="btn btn-ghost btn-small derp-action"
                          type="button"
                          disabled={busy || customMap}
                          onClick={() =>
                            void act(() => switchDerpRegion(c.regionId)).catch(() => undefined)
                          }
                        >
                          {t("derpUse")}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {relayPageCount > 1 ? (
                <div className="derp-list-pager">
                  <button
                    className="btn btn-ghost btn-small"
                    type="button"
                    disabled={relayPageSafe <= 0}
                    onClick={() => setRelayPage(Math.max(0, relayPageSafe - 1))}
                  >
                    {t("derpListPrev")}
                  </button>
                  <span className="derp-list-page">
                    {t("derpListPage")
                      .replace("{page}", String(relayPageSafe + 1))
                      .replace("{pages}", String(relayPageCount))
                      .replace("{total}", String(candidates.length))}
                  </span>
                  <button
                    className="btn btn-ghost btn-small"
                    type="button"
                    disabled={relayPageSafe >= relayPageCount - 1}
                    onClick={() => setRelayPage(Math.min(relayPageCount - 1, relayPageSafe + 1))}
                  >
                    {t("derpListNext")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <section className="derp-share" aria-label={t("derpShareTitle")}>
            <div className="label-with-help">
              <h4>{t("derpShareTitle")}</h4>
              <HelpTip>{t("derpShareHelp")}</HelpTip>
            </div>
            <div className="derp-share-row">
              <select
                className="glass-select"
                value={peer}
                onChange={(event) => setPeer(event.target.value)}
                aria-label={t("derpSharePick")}
                disabled={peers.length === 0 || shareBusy}
              >
                <option value="">{peers.length === 0 ? t("derpShareNone") : t("derpSharePick")}</option>
                {peers.map((item) => (
                  <option key={item.address} value={item.address} title={item.address}>
                    {shareOptionLabel(item)}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={shareBusy || !peer || candidates.length === 0}
                onClick={() =>
                  void runShare(async () => {
                    await sendRelayShare(peer);
                    const label = peers.find((item) => item.address === peer)?.label ?? peer;
                    note(t("derpShareSent").replace("{name}", label));
                  })
                }
              >
                {t("derpShareSend")}
              </button>
            </div>
            <div className="row">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={shareBusy || candidates.length === 0}
                onClick={() =>
                  void runShare(async () => {
                    const path = await exportRelayShare();
                    if (path) {
                      note(t("derpShareExported"));
                    }
                  })
                }
              >
                {t("derpShareExport")}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={shareBusy}
                onClick={() =>
                  void runShare(async () => {
                    const next = await importRelayShare();
                    if (next) {
                      setSt(next);
                      setAuto(next.auto);
                      note(t("derpShareImported"));
                    }
                  })
                }
              >
                {t("derpShareImport")}
              </button>
            </div>
          </section>
          {shownErr ? <p className="err">{shownErr}</p> : null}
        </>
      ) : null}
    </div>
  );
}

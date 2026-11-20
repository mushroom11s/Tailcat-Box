import { useEffect, useState } from "react";
import { OnFileDrop, OnFileDropOff } from "../../wailsjs/runtime/runtime";
import { HeadingHelp } from "../components/HelpTip";
import { useToasts } from "../components/toasts";
import { useI18n, type MessageKey } from "../i18n";
import { EXPORT_SECTIONS, exportConfig, importConfig, importConfigFile, reloadWindow, type ExportSection } from "../lib/configMigrate";

const KNOWN_ERRORS: Record<string, MessageKey> = {
  "This is not a Tailcat Box config file.": "exportNotFile",
  "That config file is too large.": "exportTooLarge",
  "That config file is not valid.": "exportNotFile",
  "save dialog requires a running window": "exportNeedsApp",
  "file picker requires a running window": "exportNeedsApp",
};

const SECTION_LABEL: Record<ExportSection, MessageKey> = {
  network: "exportItemNetwork",
  startup: "exportItemStartup",
  ssh: "exportItemSSH",
  remote: "exportItemRemote",
  profile: "exportItemProfile",
  tunnel: "exportItemTunnel",
  appearance: "exportItemAppearance",
};

const SECTION_HELP: Record<ExportSection, MessageKey> = {
  network: "exportHelpNetwork",
  startup: "exportHelpStartup",
  ssh: "exportHelpSSH",
  remote: "exportHelpRemote",
  profile: "exportHelpProfile",
  tunnel: "exportHelpTunnel",
  appearance: "exportHelpAppearance",
};

function messageOf(err: unknown, fallback: (key: MessageKey) => string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const key = KNOWN_ERRORS[raw.trim()];
  return key ? fallback(key) : raw.trim();
}

export default function ExportPage() {
  const { t, locale } = useI18n();
  const { push, note } = useToasts();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [dropped, setDropped] = useState("");
  const [picked, setPicked] = useState<ExportSection[]>(() => [...EXPORT_SECTIONS]);

  useEffect(() => {
    const host = window as unknown as { runtime?: { OnFileDrop?: typeof OnFileDrop } };
    if (!host.runtime?.OnFileDrop) {
      return;
    }
    OnFileDrop((_x, _y, paths) => {
      const file = (paths ?? []).find((path) => path.toLowerCase().endsWith(".json"));
      if (!file) {
        return;
      }
      setDropped(file);
      setAsk(true);
    }, true);
    return () => OnFileDropOff();
  }, []);

  function toggle(section: ExportSection): void {
    setPicked((current) => (current.includes(section) ? current.filter((item) => item !== section) : [...current, section]));
  }

  async function onExport(): Promise<void> {
    if (picked.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const path = await exportConfig(picked);
      if (path) {
        note(t("exportSaved"));
      }
    } catch (err) {
      push(messageOf(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function onImport(): Promise<void> {
    const path = dropped;
    setAsk(false);
    setDropped("");
    setBusy(true);
    try {
      const local = path ? await importConfigFile(path) : await importConfig();
      if (local === null) {
        return;
      }
      reloadWindow();
    } catch (err) {
      push(messageOf(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <HeadingHelp
        as="h2"
        title={t("navExport")}
        help={
          <>
            <p>{t("exportLede")}</p>
            <ul className="remote-points">
              {EXPORT_SECTIONS.map((section) => (
                <li key={section}>
                  {`${t(SECTION_LABEL[section])}${locale === "zh-CN" ? "：" : ": "}${t(SECTION_HELP[section])}`}
                </li>
              ))}
            </ul>
          </>
        }
      />
      <div className="export-split">
        <section className="glass export-card" aria-label={t("exportCardOut")}>
          <h3>{t("exportCardOut")}</h3>
          <div className="export-checks">
            {EXPORT_SECTIONS.map((section) => (
              <label key={section} className="check">
                <input
                  type="checkbox"
                  checked={picked.includes(section)}
                  onChange={() => toggle(section)}
                />
                {t(SECTION_LABEL[section])}
              </label>
            ))}
          </div>
          <div className="row">
            <button className="btn" type="button" disabled={busy || picked.length === 0} onClick={() => void onExport()}>
              {t("exportSave")}
            </button>
          </div>
        </section>
        <section className="glass export-card" aria-label={t("exportCardIn")}>
          <h3>{t("exportCardIn")}</h3>
          <button
            className="export-drop"
            type="button"
            aria-label={t("exportLoad")}
            disabled={busy}
            onClick={() => {
              setDropped("");
              setAsk(true);
            }}
          >
            <strong>{t("exportDrop")}</strong>
            <span className="chat-quiet">{t("exportDropHint")}</span>
          </button>
        </section>
      </div>
      {ask ? (
        <div className="modal-backdrop" role="presentation" onClick={() => { setAsk(false); setDropped(""); }}>
          <div
            className="glass modal modal-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-import-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="export-import-title">{t("exportConfirmTitle")}</h3>
            <p>{t("exportConfirm")}</p>
            <div className="row">
              <button className="btn btn-ghost" type="button" onClick={() => { setAsk(false); setDropped(""); }}>
                {t("exportCancel")}
              </button>
              <button className="btn" type="button" onClick={() => void onImport()}>
                {t("exportConfirmGo")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

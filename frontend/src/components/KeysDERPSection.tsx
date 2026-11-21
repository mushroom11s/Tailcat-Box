import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { defaultKeyName, resolveKeyName } from "../lib/defaultKeyName";
import { regionOptions } from "../lib/miao";
import type { KeyInfo } from "../lib/wails";
import DerpScanPanel from "./DerpScanPanel";
import { HeadingHelp } from "./HelpTip";
import RegionSelect from "./RegionSelect";
import RelayCascade from "./RelayCascade";

type Props = {
  keys: KeyInfo[];
  busy: boolean;
  error: string;
  region: string;
  derpMapURL: string;
  onCreate: (name: string, client: boolean, region: string) => void | Promise<void>;
  onDelete: (name: string) => void | Promise<void>;
  onRename: (oldName: string, newName: string) => void | Promise<void>;
  onSaveNetwork: (region: string, derpMapURL: string) => void | Promise<void>;
};

export default function KeysDERPSection({
  keys,
  busy,
  error,
  region,
  derpMapURL,
  onCreate,
  onDelete,
  onRename,
  onSaveNetwork,
}: Props) {
  const { t, locale } = useI18n();
  const [renaming, setRenaming] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [name, setName] = useState(() => defaultKeyName());
  const [client, setClient] = useState(false);
  const [keyRelay, setKeyRelay] = useState("");
  const [keyRelayLabel, setKeyRelayLabel] = useState("");
  const [netRegion, setNetRegion] = useState(region);
  const [netDERP, setNetDERP] = useState(derpMapURL);

  useEffect(() => {
    setNetRegion(region);
    setNetDERP(derpMapURL);
  }, [region, derpMapURL]);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const code = !client && keyRelay.startsWith("region:") ? keyRelay.slice("region:".length) : "";
    const next = resolveKeyName(name, client ? "" : keyRelayLabel);
    await onCreate(next, client, code);
    setName(defaultKeyName());
    setKeyRelay("");
    setKeyRelayLabel("");
  }

  return (
    <div className="keys-derp">
      <header className="keys-derp-head">
        <h2>{t("keysDERPTitle")}</h2>
      </header>

      <section className="glass settings-panel" aria-label={t("derpRegion")}>
        <HeadingHelp as="h3" className="kind" title={t("derpRegion")} help={t("derpLede")} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSaveNetwork(netRegion.trim(), netDERP.trim());
          }}
        >
          <div className="field">
            <label htmlFor="net-region">{t("regionLabel")}</label>
            <RegionSelect id="net-region" value={netRegion} onChange={setNetRegion} />
          </div>
          <div className="field">
            <label htmlFor="net-derp">{t("derpMapURL")}</label>
            <input
              id="net-derp"
              value={netDERP}
              onChange={(e) => setNetDERP(e.target.value)}
              placeholder="https://tailcat.dev/derpmap.json"
              autoComplete="off"
            />
          </div>
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>
              {t("saveNetwork")}
            </button>
          </div>
        </form>
      </section>

      <section className="glass settings-panel derp-scan-card" aria-label={t("derpScanTitle")}>
        <DerpScanPanel customMap={derpMapURL.trim() !== ""} />
      </section>

      <section className="glass settings-panel" aria-label={t("keysTitle")}>
        <HeadingHelp as="h3" className="kind" title={t("keysTitle")} help={t("keysLede")} />
        <form onSubmit={(e) => void submitCreate(e)}>
          <div className="field">
            <label htmlFor="key-name">{t("name")}</label>
            <input id="key-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="key-region">{t("regionHint")}</label>
            <RelayCascade
              id="key-region"
              value={client ? "" : keyRelay}
              disabled={client || busy}
              onChange={(value, label) => {
                setKeyRelay(value);
                setKeyRelayLabel(label ?? "");
              }}
            />
          </div>
          <label className="check">
            <input type="checkbox" checked={client} onChange={(e) => setClient(e.target.checked)} />
            {t("clientIdentityKey")}
          </label>
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>
              {t("createKey")}
            </button>
          </div>
        </form>

        <div className="keys stack">
          {keys.length === 0 ? <p className="empty">{t("emptyKeys")}</p> : null}
          {keys.map((key) => {
            const savedRegion = key.Region?.trim() ?? "";
            const regionLabel = savedRegion
              ? (regionOptions(locale).find((item) => item.code === savedRegion)?.label ?? savedRegion)
              : t("regionAuto");
            const editing = renaming === key.Name;
            return (
            <article key={key.Name + key.Source} className="glass key-row">
              <div className="key-meta">
                {editing ? (
                  <form
                    className="key-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const next = renameDraft.trim();
                      if (!next || next === key.Name) {
                        setRenaming("");
                        return;
                      }
                      void Promise.resolve(onRename(key.Name, next)).then(() => setRenaming(""));
                    }}
                  >
                    <input
                      value={renameDraft}
                      aria-label={t("keyRename")}
                      autoComplete="off"
                      onChange={(event) => setRenameDraft(event.target.value)}
                    />
                    <button className="btn btn-small" type="submit" disabled={busy}>
                      {t("keyRenameSave")}
                    </button>
                    <button className="btn btn-ghost btn-small" type="button" onClick={() => setRenaming("")}>
                      {t("cancel")}
                    </button>
                  </form>
                ) : (
                  <h3>
                    {key.Name} {key.Client ? t("keyClient") : t("keyServer")}{" "}
                    <span className="pill">{key.Source || "app"}</span>
                  </h3>
                )}
                <p className="key-region">{t("keyRegionSaved").replace("{region}", regionLabel)}</p>
                <p className="address">{key.Address || t("noAddress")}</p>
              </div>
              <div className="card-actions">
                {key.Source !== "cli" && !editing ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRenaming(key.Name);
                      setRenameDraft(key.Name);
                    }}
                  >
                    {t("keyRename")}
                  </button>
                ) : null}
                {key.Source !== "cli" ? (
                  <button className="btn btn-danger" type="button" disabled={busy} onClick={() => onDelete(key.Name)}>
                    {t("delete")}
                  </button>
                ) : null}
              </div>
            </article>
            );
          })}
        </div>
        {error ? <p className="err">{error}</p> : null}
      </section>
    </div>
  );
}

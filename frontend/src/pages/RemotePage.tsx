import { useState } from "react";
import { useI18n, type MessageKey } from "../i18n";
import { shareableAddress } from "../lib/qr";

export type RemoteMode = "desk" | "play" | "assist";

export type RemoteRecent = {
  address: string;
  mode: RemoteMode;
  at: number;
};

const RECENT_KEY = "tailcat-remote-recent";
const RECENT_LIMIT = 8;

const MODES: RemoteMode[] = ["desk", "play", "assist"];

const MODE_LABEL: Record<RemoteMode, MessageKey> = {
  desk: "remoteDesk",
  play: "remotePlay",
  assist: "remoteAssist",
};

const MODE_BODY: Record<RemoteMode, MessageKey> = {
  desk: "remoteDeskBody",
  play: "remotePlayBody",
  assist: "remoteAssistBody",
};

const MODE_POINTS: Record<RemoteMode, [MessageKey, MessageKey, MessageKey]> = {
  desk: ["remotePointDesk1", "remotePointDesk2", "remotePointDesk3"],
  play: ["remotePointPlay1", "remotePointPlay2", "remotePointPlay3"],
  assist: ["remotePointAssist1", "remotePointAssist2", "remotePointAssist3"],
};

export function rememberRemote(list: RemoteRecent[], address: string, mode: RemoteMode, at = Date.now()): RemoteRecent[] {
  const clean = address.trim();
  return [{ address: clean, mode, at }, ...list.filter((item) => item.address !== clean)].slice(0, RECENT_LIMIT);
}

export function forgetRemote(list: RemoteRecent[], address: string): RemoteRecent[] {
  return list.filter((item) => item.address !== address);
}

function readRecent(): RemoteRecent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const row = item as Partial<RemoteRecent>;
      if (row.mode !== "desk" && row.mode !== "play" && row.mode !== "assist") {
        return [];
      }
      const address = typeof row.address === "string" ? row.address.trim() : "";
      if (!shareableAddress(address)) {
        return [];
      }
      return [{ address, mode: row.mode, at: typeof row.at === "number" ? row.at : 0 }];
    });
  } catch {
    return [];
  }
}

function writeRecent(list: RemoteRecent[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export default function RemotePage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<RemoteMode>("desk");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<RemoteRecent[]>(readRecent);

  function keep(nextAddress: string, nextMode: RemoteMode): void {
    const clean = shareableAddress(nextAddress);
    if (!clean) {
      setError(t("remoteBadAddress"));
      return;
    }
    setError("");
    setAddress(clean);
    setMode(nextMode);
    const next = rememberRemote(recent, clean, nextMode);
    setRecent(next);
    writeRecent(next);
  }

  function drop(target: string): void {
    const next = forgetRemote(recent, target);
    setRecent(next);
    writeRecent(next);
  }

  return (
    <div className="remote-page">
      <header className="chat-lobby-head">
        <h2>{t("remoteTitle")}</h2>
        <p className="lede">{t("remoteLede")}</p>
      </header>
      <div className="remote-menu" role="tablist" aria-label={t("remoteMenuLabel")}>
        {MODES.map((item) => (
          <button
            key={item}
            type="button"
            className={`remote-mode${mode === item ? " active" : ""}`}
            role="tab"
            aria-selected={mode === item}
            onClick={() => setMode(item)}
          >
            <strong>{t(MODE_LABEL[item])}</strong>
            <span>{t(MODE_BODY[item])}</span>
          </button>
        ))}
      </div>
      <section className="glass remote-panel" aria-label={t(MODE_LABEL[mode])}>
        <ul className="remote-points">
          {MODE_POINTS[mode].map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <form
          className="remote-form"
          onSubmit={(event) => {
            event.preventDefault();
            keep(address, mode);
          }}
        >
          <label className="field" htmlFor="remote-address">
            {t("remoteAddress")}
            <input
              id="remote-address"
              value={address}
              placeholder={t("remoteAddressPlaceholder")}
              autoComplete="off"
              onChange={(event) => {
                setAddress(event.target.value);
                setError("");
              }}
            />
          </label>
          {error ? (
            <p className="err" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row">
            <button className="btn" type="submit">
              {t("remoteRemember")}
            </button>
          </div>
        </form>
        <div className="remote-recent">
          <h3>{t("remoteRecent")}</h3>
          {recent.length === 0 ? <p className="chat-quiet">{t("remoteRecentEmpty")}</p> : null}
          {recent.map((item) => (
            <div key={item.address} className="remote-recent-row">
              <button type="button" className="remote-recent-main" onClick={() => keep(item.address, item.mode)}>
                <span className="remote-recent-addr">{item.address}</span>
                <span className="remote-recent-mode">{t(MODE_LABEL[item.mode])}</span>
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => drop(item.address)}>
                {t("remoteForget")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

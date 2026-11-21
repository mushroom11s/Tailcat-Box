import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { dismissDerpSuggestion, parseDerpEvent, relayLabel, switchDerpRegion, type DerpCandidate } from "../lib/derpScan";
import { onTailcatEvent } from "../lib/wails";
import { useToasts } from "./toasts";

type Offer = { candidate: DerpCandidate; baselineMs: number };

export default function DerpSuggest() {
  const { t } = useI18n();
  const { push, note } = useToasts();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onTailcatEvent((ev) => {
      const next = parseDerpEvent(ev);
      if (next?.type === "suggest") {
        setOffer({ candidate: next.candidate, baselineMs: next.baselineMs });
        return;
      }
      if (next?.type !== "switched" || next.reason === "user") {
        return;
      }
      setOffer(null);
      const name = next.candidate ? relayLabel(next.candidate) : "";
      if (next.reason === "official-down" && name) {
        note(t("derpSwitchedOfficialDown").replace("{name}", name));
      } else if (name) {
        note(t("derpSwitchedDown").replace("{name}", name));
      } else {
        note(t("derpSwitchedOfficial"));
      }
    });
  }, [note, t]);

  if (!offer) {
    return null;
  }
  const name = relayLabel(offer.candidate);
  const ms = String(offer.candidate.latencyMs);
  const body =
    offer.baselineMs < 0
      ? t("derpSuggestBodyDown").replace("{name}", name).replace("{ms}", ms)
      : t("derpSuggestBody").replace("{name}", name).replace("{ms}", ms).replace("{base}", String(offer.baselineMs));

  async function accept(current: Offer) {
    setBusy(true);
    try {
      await switchDerpRegion(current.candidate.regionId);
      note(t("derpSwitchedTo").replace("{name}", relayLabel(current.candidate)));
      setOffer(null);
    } catch (e) {
      push(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function later(current: Offer) {
    void dismissDerpSuggestion(current.candidate.regionId);
    setOffer(null);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="glass modal modal-compact" role="dialog" aria-modal="true" aria-labelledby="derp-suggest-title">
        <h3 id="derp-suggest-title">{t("derpSuggestTitle")}</h3>
        <p>{body}</p>
        <p className="setting-help">
          {offer.candidate.host}:{offer.candidate.port}
        </p>
        <div className="row">
          <button className="btn" type="button" disabled={busy} onClick={() => void accept(offer)}>
            {t("derpSuggestSwitch")}
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => later(offer)}>
            {t("derpSuggestLater")}
          </button>
        </div>
      </div>
    </div>
  );
}

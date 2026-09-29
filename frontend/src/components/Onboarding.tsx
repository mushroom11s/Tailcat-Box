import { useEffect, useLayoutEffect, useState } from "react";
import { useI18n, type MessageKey } from "../i18n";

const STEPS: Array<{ title: MessageKey; body: MessageKey; target: string }> = [
  { title: "onboardingStep1Title", body: "onboardingStep1Body", target: "chat" },
  { title: "onboardingStep2Title", body: "onboardingStep2Body", target: "new-room" },
  { title: "onboardingStep3Title", body: "onboardingStep3Body", target: "miao-drop" },
];

type Props = {
  open: boolean;
  onSkip: () => void;
  onDismiss: () => void;
  onStep: (step: number) => void;
};

type Box = { top: number; left: number; width: number; height: number };

const GAP = 14;
const CARD_W = 340;

function measure(target: string): Box | null {
  const el = document.querySelector(`[data-guide="${target}"]`);
  if (!el) {
    return null;
  }
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) {
    return null;
  }
  const pad = 8;
  return {
    top: Math.max(8, rect.top - pad),
    left: Math.max(8, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

function placeCard(spot: Box | null): { top: number; left: number } {
  const vw = window.innerWidth || 800;
  const vh = window.innerHeight || 600;
  if (!spot) {
    return { top: Math.max(16, (vh - 220) / 2), left: Math.max(16, (vw - CARD_W) / 2) };
  }
  let left = spot.left + spot.width + GAP;
  let top = spot.top;
  if (left + CARD_W > vw - 12) {
    left = spot.left;
    top = spot.top + spot.height + GAP;
  }
  const maxTop = Math.max(12, vh - 240);
  top = Math.min(Math.max(12, top), maxTop);
  left = Math.min(Math.max(12, left), Math.max(12, vw - CARD_W - 12));
  return { top, left };
}

export default function Onboarding({ open, onSkip, onDismiss, onStep }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);

  useEffect(() => {
    if (open) {
      setStep(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    onStep(step);
  }, [open, step, onStep]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const target = STEPS[step]?.target ?? STEPS[0].target;
    const update = () => setSpot(measure(target));
    update();
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(ev: KeyboardEvent): void {
      if (ev.key === "Escape") {
        onSkip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onSkip]);

  if (!open) {
    return null;
  }

  const current = STEPS[step] ?? STEPS[0];
  const last = step >= STEPS.length - 1;
  const progress = t("onboardingProgress").replace("{n}", String(step + 1)).replace("{total}", String(STEPS.length));
  const card = placeCard(spot);

  return (
    <div className="guide">
      <div className="guide-shade" onClick={onSkip} />
      {spot ? <div className="guide-spot" style={spot} /> : null}
      <div
        className="glass guide-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        style={{ top: card.top, left: card.left }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <p className="chat-quiet onboarding-progress">{progress}</p>
        <h3 id="onboarding-title">{t(current.title)}</h3>
        <p>{t(current.body)}</p>
        <div className="row">
          {step > 0 ? (
            <button className="btn btn-ghost" type="button" onClick={() => setStep((n) => Math.max(0, n - 1))}>
              {t("onboardingBack")}
            </button>
          ) : null}
          {last ? (
            <button className="btn" type="button" onClick={onDismiss}>
              {t("onboardingDone")}
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => setStep((n) => Math.min(STEPS.length - 1, n + 1))}>
              {t("onboardingNext")}
            </button>
          )}
          <button className="btn btn-ghost" type="button" onClick={onSkip}>
            {t("onboardingSkip")}
          </button>
          <button className="btn-link" type="button" onClick={onDismiss}>
            {t("onboardingDismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}

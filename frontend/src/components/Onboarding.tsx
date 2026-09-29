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
const PAD = 8;
/** Keep polling briefly after a page switch until the target mounts. */
const TARGET_WAIT_MS = 1200;

export function measureGuideTarget(target: string): Box | null {
  const el = document.querySelector(`[data-guide="${target}"]`);
  if (!el) {
    return null;
  }
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch {
    /* happy-dom / older engines */
  }
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) {
    return null;
  }
  // getBoundingClientRect is viewport CSS pixels — matches position:fixed.
  // visualViewport offset covers pinch-zoom / some embedded webviews.
  const vv = window.visualViewport;
  const ox = vv?.offsetLeft ?? 0;
  const oy = vv?.offsetTop ?? 0;
  return {
    top: Math.max(8, rect.top + oy - PAD),
    left: Math.max(8, rect.left + ox - PAD),
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
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

function boxesEqual(a: Box | null, b: Box | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
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

  // Switch chat/miao in layout so the next paint (and our rAF remasure) sees the target.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    onStep(step);
  }, [open, step, onStep]);

  useLayoutEffect(() => {
    if (!open) {
      setSpot(null);
      return;
    }
    const target = STEPS[step]?.target ?? STEPS[0].target;
    let cancelled = false;
    let observed: Element | null = null;
    let raf1 = 0;
    let raf2 = 0;
    let pollId = 0;
    let waitTimer = 0;
    let ro: ResizeObserver | null = null;

    const apply = () => {
      if (cancelled) {
        return;
      }
      const next = measureGuideTarget(target);
      setSpot((prev) => (boxesEqual(prev, next) ? prev : next));

      const el = document.querySelector(`[data-guide="${target}"]`);
      if (el && el !== observed && typeof ResizeObserver !== "undefined") {
        ro?.disconnect();
        observed = el;
        ro = new ResizeObserver(() => {
          apply();
        });
        ro.observe(el);
      }
      if (el && pollId) {
        window.clearInterval(pollId);
        pollId = 0;
      }
    };

    // Immediate + double rAF so we catch layout after page switch / CSS settle.
    apply();
    raf1 = window.requestAnimationFrame(() => {
      apply();
      raf2 = window.requestAnimationFrame(apply);
    });

    // Target may mount only after parent re-renders from onStep (miao-drop).
    pollId = window.setInterval(apply, 32);
    waitTimer = window.setTimeout(() => {
      if (pollId) {
        window.clearInterval(pollId);
        pollId = 0;
      }
    }, TARGET_WAIT_MS);

    const main = document.querySelector(".main");
    window.addEventListener("resize", apply);
    main?.addEventListener("scroll", apply, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (pollId) {
        window.clearInterval(pollId);
      }
      if (waitTimer) {
        window.clearTimeout(waitTimer);
      }
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      main?.removeEventListener("scroll", apply);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
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
      {spot ? <div className="guide-spot" data-testid="guide-spot" style={spot} /> : null}
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
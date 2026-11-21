import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";

type Props = {
  children: ReactNode;
  /** Accessible name; defaults to the shared Help label. */
  label?: string;
};

type Place = { top: number; left: number; caret: number; above: boolean };

const GAP = 10;
const EDGE = 12;
const HOVER_OPEN_MS = 160;
const HOVER_CLOSE_MS = 140;

/** Only one help popover is shown at a time. */
let closeCurrent: (() => void) | null = null;

function HelpGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6.35 6.3a1.7 1.7 0 0 1 3.3.55c0 1.15-1.65 1.4-1.65 2.45"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="11.35" r="0.72" fill="currentColor" />
    </svg>
  );
}

/** Quiet help glyph; explanatory copy lives in a popover instead of the layout. */
export default function HelpTip({ children, label }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const panelId = useId();
  const name = label || t("helpTip");

  const clearTimer = () => window.clearTimeout(timer.current);

  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPinned(false);
  }, []);

  const measure = useCallback(() => {
    const b = btn.current;
    const p = panel.current;
    if (!b || !p) {
      return;
    }
    const r = b.getBoundingClientRect();
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center - w / 2, EDGE), Math.max(EDGE, vw - w - EDGE));
    const above = r.bottom + GAP + h > vh - EDGE && r.top - GAP - h >= EDGE;
    const top = above ? r.top - GAP - h : r.bottom + GAP;
    const caret = Math.min(Math.max(center - left, 14), w - 14);
    setPlace({ top, left, caret, above });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    if (closeCurrent && closeCurrent !== close) {
      closeCurrent();
    }
    closeCurrent = close;
    measure();
    return () => {
      if (closeCurrent === close) {
        closeCurrent = null;
      }
    };
  }, [open, measure, close]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDoc(ev: MouseEvent) {
      const target = ev.target as Node;
      if (btn.current?.contains(target) || panel.current?.contains(target)) {
        return;
      }
      close();
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        close();
        btn.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, close, measure]);

  useEffect(() => clearTimer, []);

  function hoverIn() {
    if (pinned) {
      return;
    }
    clearTimer();
    timer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  }

  function hoverOut() {
    if (pinned) {
      return;
    }
    clearTimer();
    timer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }

  const popover = open
    ? createPortal(
        <div
          ref={panel}
          id={panelId}
          role="note"
          className={`help-tip-panel${place ? " is-placed" : ""}${place?.above ? " is-above" : ""}`}
          style={
            place
              ? { top: place.top, left: place.left, ["--caret-x" as string]: `${place.caret}px` }
              : { top: 0, left: 0, visibility: "hidden" }
          }
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          <div className="help-tip-body">{children}</div>
        </div>,
        document.body,
      )
    : null;

  return (
    <span className={`help-tip${open ? " is-open" : ""}`}>
      <button
        ref={btn}
        type="button"
        className="help-tip-btn"
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearTimer();
          if (open && pinned) {
            close();
            return;
          }
          setOpen(true);
          setPinned(true);
        }}
      >
        <HelpGlyph />
      </button>
      {popover}
    </span>
  );
}

/** Title row with an optional help glyph trailing the heading. */
export function HeadingHelp({
  as: Tag = "h3",
  className,
  title,
  help,
}: {
  as?: "h2" | "h3";
  className?: string;
  title: ReactNode;
  help?: ReactNode;
}) {
  return (
    <div className={`heading-help heading-help-${Tag}`}>
      <Tag className={className}>{title}</Tag>
      {help ? <HelpTip>{help}</HelpTip> : null}
    </div>
  );
}

import type { MessageKey } from "../i18n";

type AccessRecord = {
  op?: string;
  peer?: string;
  proto?: string;
  port?: number;
  via?: string;
  dur?: string;
};

type Translate = (key: MessageKey) => string;

export function formatAccessLine(raw: string, t: Translate): string {
  let rec: AccessRecord;
  try {
    rec = JSON.parse(raw) as AccessRecord;
  } catch {
    return raw;
  }
  if (!rec || typeof rec !== "object") {
    return raw;
  }
  const peer = rec.peer || t("accessPeerUnknown");
  const proto = rec.proto || "tcp";
  const port = String(rec.port ?? "");
  switch (rec.op) {
    case "allow":
      return t("accessAllow").replace("{peer}", peer);
    case "refuse":
      return t("accessRefuse").replace("{peer}", peer);
    case "refuse-port":
      return t("accessRefusePort").replace("{port}", port);
    case "open":
      return t("accessOpen")
        .replace("{proto}", proto)
        .replace("{port}", port)
        .replace("{peer}", peer)
        .replace("{via}", formatVia(rec.via, t));
    case "close":
      return t("accessClose")
        .replace("{proto}", proto)
        .replace("{port}", port)
        .replace("{peer}", peer)
        .replace("{duration}", rec.dur || t("accessDurationUnknown"));
    default:
      return raw;
  }
}

function formatVia(via: string | undefined, t: Translate): string {
  if (!via) {
    return t("accessViaUnknown");
  }
  if (via.startsWith("direct:")) {
    const addr = via.slice("direct:".length);
    return addr ? `${t("miaoPathDirect")} ${addr}` : t("miaoPathDirect");
  }
  if (via.startsWith("derp:")) {
    const relay = via.slice("derp:".length);
    return relay ? `${t("miaoPathDERP")} ${relay}` : t("miaoPathDERP");
  }
  return via;
}

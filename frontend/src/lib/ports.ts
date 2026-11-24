export type PortMapping = {
  LocalPort: number;
  RemoteHost: string;
  RemotePort: number;
  /** Unix-domain socket path. Empty means a TCP host:port target. */
  Socket?: string;
  /** Ask the port serve to record allow/refuse and TCP open/close. */
  AccessLog?: boolean;
};

// forwardPortMappings parses a forward spec.
// With openBrowser, a bare port (no colon) is the remote port and the local
// listener is ephemeral, matching CLI `forward --open-browser 0:80`.
export function forwardPortMappings(spec: string, openBrowser: boolean): PortMapping[] {
  const mappings = parsePortMappings(spec);
  if (mappings.some((mapping) => mapping.Socket)) {
    throw new Error("socket-serve-only");
  }
  if (!openBrowser) {
    return mappings;
  }
  return mappings.map((mapping) => {
    if (mapping.RemoteHost === "" && mapping.RemotePort === 0) {
      return { LocalPort: 0, RemoteHost: "", RemotePort: mapping.LocalPort };
    }
    return mapping;
  });
}

export function parsePortMappings(spec: string): PortMapping[] {
  const parts = spec
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error("enter at least one port or mapping");
  }
  return parts.map(parseOne);
}

function parseOne(raw: string): PortMapping {
  const whole = socketPath(raw);
  if (whole) {
    return { LocalPort: 0, RemoteHost: "", RemotePort: 0, Socket: whole };
  }
  const cut = raw.indexOf(":");
  if (cut < 0) {
    return { LocalPort: parsePort(raw), RemoteHost: "", RemotePort: 0 };
  }
  const local = parsePort(raw.slice(0, cut), true);
  const target = raw.slice(cut + 1);
  const sock = socketPath(target);
  if (sock) {
    if (local === 0) {
      throw new Error("invalid port 0");
    }
    return { LocalPort: local, RemoteHost: "", RemotePort: 0, Socket: sock };
  }
  if (/^\d+$/.test(target)) {
    return { LocalPort: local, RemoteHost: "", RemotePort: parsePort(target) };
  }
  const host = splitHostPort(target);
  return { LocalPort: local, RemoteHost: host.host, RemotePort: host.port };
}

// socketPath reports the filesystem path when raw names a Unix-domain
// socket the way `tailcat serve` does: a leading "/" or a "unix:" prefix.
function socketPath(raw: string): string | null {
  if (raw.startsWith("unix:")) {
    const path = raw.slice("unix:".length);
    if (!path) {
      throw new Error("invalid mapping " + raw);
    }
    return path;
  }
  if (raw.startsWith("/")) {
    return raw;
  }
  return null;
}

function splitHostPort(target: string): { host: string; port: number } {
  if (target.startsWith("[")) {
    const end = target.indexOf("]");
    if (end > 1 && target[end + 1] === ":") {
      return { host: target.slice(1, end), port: parsePort(target.slice(end + 2)) };
    }
  }
  const idx = target.lastIndexOf(":");
  if (idx > 0) {
    return { host: target.slice(0, idx), port: parsePort(target.slice(idx + 1)) };
  }
  throw new Error("invalid mapping " + target);
}

function parsePort(s: string, allowZero = false): number {
  if (!/^\d+$/.test(s)) {
    throw new Error("invalid port " + s);
  }
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error("invalid port " + s);
  }
  if (n === 0 && !allowZero) {
    throw new Error("invalid port " + s);
  }
  return n;
}

/** QR links contain connection details only, never pairing secrets. */
export interface QrConnection {
  host: string;
  port: number;
  fingerprint: string;
}

export function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const n = parts.map(Number);
  if (n.some((part) => part > 255)) return false;
  return n[0] === 10 || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
    (n[0] === 192 && n[1] === 168);
}

export function qrConnectionUrl(connection: QrConnection): string {
  if (!isPrivateIpv4(connection.host) || !Number.isInteger(connection.port) ||
      connection.port < 1024 || connection.port > 65535 || !/^[a-f0-9]{16}$/.test(connection.fingerprint)) {
    throw new Error("Invalid QR connection details");
  }
  const params = new URLSearchParams({
    version: "1", host: connection.host, port: String(connection.port),
    fingerprint: connection.fingerprint,
  });
  return `obsidian://obsync-connect?${params.toString()}`;
}

export function parseQrConnection(params: Record<string, string>): QrConnection | null {
  const host = params.host;
  const port = Number(params.port);
  const fingerprint = params.fingerprint;
  if (params.version !== "1" || !host || !isPrivateIpv4(host) ||
      !params.port || !/^\d+$/.test(params.port) ||
      !Number.isInteger(port) || port < 1024 || port > 65535 ||
      !fingerprint || !/^[a-f0-9]{16}$/.test(fingerprint)) return null;
  return { host, port, fingerprint };
}

import { describe, expect, it } from "vitest";
import { isPrivateIpv4, parseQrConnection, qrConnectionUrl } from "../src/core/qr-pairing";

const valid = { host: "192.168.1.42", port: 42043, fingerprint: "abcdef0123456789" };

describe("QR connection links", () => {
  it("encodes a camera-compatible Obsidian URI", () => {
    const uri = qrConnectionUrl(valid);
    expect(uri.startsWith("obsidian://obsync-connect?")).toBe(true);
    const parsed = new URL(uri);
    expect(parseQrConnection(Object.fromEntries(parsed.searchParams))).toEqual(valid);
  });

  it("only accepts private IPv4 LAN addresses", () => {
    for (const host of ["10.1.2.3", "172.16.1.1", "172.31.255.254", "192.168.0.10"]) {
      expect(isPrivateIpv4(host)).toBe(true);
    }
    for (const host of ["localhost", "127.0.0.1", "8.8.8.8", "172.32.0.1", "192.169.1.1", "192.168.1.999", "192.168.1.1.evil.test"]) {
      expect(isPrivateIpv4(host)).toBe(false);
    }
  });

  it("rejects invalid URI input before contacting any server", () => {
    const params = { version: "1", host: valid.host, port: String(valid.port), fingerprint: valid.fingerprint };
    expect(parseQrConnection({ ...params, version: "2" })).toBeNull();
    expect(parseQrConnection({ ...params, port: "0" })).toBeNull();
    expect(parseQrConnection({ ...params, port: "42043evil" })).toBeNull();
    expect(parseQrConnection({ ...params, host: "example.com" })).toBeNull();
    expect(parseQrConnection({ ...params, fingerprint: "not-a-fingerprint" })).toBeNull();
    expect(() => qrConnectionUrl({ ...valid, port: 65536 })).toThrow();
  });
});

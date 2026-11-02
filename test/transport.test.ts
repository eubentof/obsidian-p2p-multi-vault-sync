import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HttpClientTransport,
  startRpcServer,
  pingMessage,
  disconnectMessage,
  HttpServerHandle,
  encodeMessage,
  decodeMessage,
  RPC_PATH,
  normalizeServerUrl,
  startRawRpcServer,
  startServerWithPortFallback,
} from "../src/core/transport";
import { ProtocolMessage, newMessage } from "../src/core/protocol";

let server: HttpServerHandle | null = null;
let url = "";

beforeAll(async () => {
  const echoHandler = async (msg: ProtocolMessage) => {
    if (msg.message_type === "ping") {
      return newMessage("hello_ack", msg.request_id, {
        approved: true,
        server_device_id: "server-test",
        server_device_name: "Test Server",
        server_public_key: "deadbeef",
      });
    }
    if (msg.message_type === "disconnect") {
      return newMessage("operation_ack", msg.request_id, { ok: true });
    }
    // echo back with a marker so we can assert the payload round-trips
    return newMessage("operation_ack", msg.request_id, { ok: true, echoed: msg.payload });
  };
  server = await startRpcServer(echoHandler, 0);
  url = `http://127.0.0.1:${server.port}${RPC_PATH}`;
});

afterAll(async () => {
  await server?.close();
});

describe("transport", () => {
  it("server binds and reports its port", () => {
    expect(server!.port).toBeGreaterThan(0);
  });

  it("client exchanges a ping for a hello_ack", async () => {
    const client = HttpClientTransport.forNode(url);
    const reply = await client.exchange(pingMessage());
    expect(reply.message_type).toBe("hello_ack");
    expect((reply.payload as { approved: boolean }).approved).toBe(true);
  });

  it("payload round-trips through JSON framing", async () => {
    const client = HttpClientTransport.forNode(url);
    const msg = newMessage("file_request", 42, {
      relative_path: "notes/a.md",
      content_hash: "ab" + "00".repeat(31),
      offset: 0,
    });
    const reply = await client.exchange(msg);
    const echoed = (reply.payload as { echoed: unknown }).echoed as {
      relative_path: string;
      offset: number;
    };
    expect(echoed.relative_path).toBe("notes/a.md");
    expect(echoed.offset).toBe(0);
  });

  it("rejects a wrong protocol version", () => {
    const bad = { version: 99, message_type: "ping", request_id: 0, payload: {} };
    const text = encodeMessage(bad as ProtocolMessage);
    expect(() => decodeMessage(text)).toThrow(/version/);
  });

  it("disconnect returns ack", async () => {
    const client = HttpClientTransport.forNode(url);
    const reply = await client.exchange(disconnectMessage());
    expect(reply.message_type).toBe("operation_ack");
  });
});

describe("normalizeServerUrl", () => {
  it("adds http:// when the scheme is missing", () => {
    expect(normalizeServerUrl("10.174.223.140:42042")).toBe("http://10.174.223.140:42042");
  });

  it("keeps an explicit scheme", () => {
    expect(normalizeServerUrl("http://10.174.223.140:42042")).toBe("http://10.174.223.140:42042");
    expect(normalizeServerUrl("https://vault.example.com:8443")).toBe("https://vault.example.com:8443");
  });

  it("strips a trailing slash", () => {
    expect(normalizeServerUrl("10.174.223.140:42042/")).toBe("http://10.174.223.140:42042");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeServerUrl("  10.174.223.140:42042  ")).toBe("http://10.174.223.140:42042");
  });

  it("returns empty input unchanged", () => {
    expect(normalizeServerUrl("")).toBe("");
    expect(normalizeServerUrl("   ")).toBe("");
  });
});

describe("per-vault server ports", () => {
  const echo = async (body: string) => body;

  it("runs two independent listeners on consecutive ports when the preferred port is occupied", async () => {
    const first = await startRawRpcServer(echo, 0);
    let second: HttpServerHandle | null = null;
    try {
      // An ephemeral port at 65535 cannot have a next port.
      if (first.port === 65535) return;
      second = await startServerWithPortFallback(echo, first.port);
      expect(second.port).toBe(first.port + 1);
    } finally {
      await second?.close();
      await first.close();
    }
  });

  it("only advances on EADDRINUSE and preserves unexpected errors", async () => {
    const attempted: number[] = [];
    const start = async (_handler: typeof echo, port: number): Promise<HttpServerHandle> => {
      attempted.push(port);
      if (port < 42044) throw Object.assign(new Error("occupied"), { code: "EADDRINUSE" });
      return { port, close: async () => {} };
    };
    const result = await startServerWithPortFallback(echo, 42042, start);
    expect(result.port).toBe(42044);
    expect(attempted).toEqual([42042, 42043, 42044]);

    const failure = Object.assign(new Error("denied"), { code: "EACCES" });
    await expect(startServerWithPortFallback(echo, 42042, async () => { throw failure; })).rejects.toBe(failure);
  });

  it("rejects invalid ports and exhaustion", async () => {
    await expect(startServerWithPortFallback(echo, 0)).rejects.toThrow(/between 1024 and 65535/);
    await expect(startServerWithPortFallback(echo, 65536)).rejects.toThrow(/between 1024 and 65535/);
    await expect(startServerWithPortFallback(echo, 65535, async () => {
      throw Object.assign(new Error("occupied"), { code: "EADDRINUSE" });
    })).rejects.toThrow(/No available server port/);
  });
});

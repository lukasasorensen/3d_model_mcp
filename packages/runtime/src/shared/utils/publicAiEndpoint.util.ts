import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import { AiConnectionError } from "@theoryfoundry/contracts";

export function isPublicAiAddress(address: string): boolean {
  const family = isIP(address);
  const blocked = new BlockList();
  if (family === 4) {
    for (const [network, bits] of [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.88.99.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ] as const)
      blocked.addSubnet(network, bits, "ipv4");
    return !blocked.check(address, "ipv4");
  }
  if (family !== 6 || !/^[23]/i.test(address)) return false;
  for (const [network, bits] of [
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
  ] as const)
    blocked.addSubnet(network, bits, "ipv6");
  return !blocked.check(address, "ipv6");
}
export async function resolvePublicAiEndpoint(
  raw: string,
  resolve = lookup,
): Promise<{ url: URL; addresses: { address: string; family: number }[] }> {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      throw new Error();
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await resolve(host, { all: true });
    if (
      !addresses.length ||
      !addresses.every(({ address }) => isPublicAiAddress(address))
    )
      throw new Error();
    return { url, addresses };
  } catch {
    throw new AiConnectionError("AI_CONFIGURATION");
  }
}

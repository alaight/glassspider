/**
 * Block obviously unsafe targets for SSRF-hardering in the Explore fetch endpoint.
 */

function ipv4Parts(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return null;
  }
  return host.split(".").map((segment) => Number(segment));
}

function isForbiddenIpv4(parts: number[]) {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255) return true;
  return false;
}

export function validatePublicFetchUrl(candidate: string): URL {
  const trimmed = candidate.trim();
  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata.goog"
  ) {
    throw new Error("This host is blocked.");
  }

  const ip = ipv4Parts(hostname);

  if (ip && ip.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    throw new Error("Invalid IPv4 literal.");
  }

  if (ip && isForbiddenIpv4(ip)) {
    throw new Error("Private or loopback IPs are blocked.");
  }

  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    throw new Error("Bracketed IPv6 literals are blocked.");
  }

  return url;
}

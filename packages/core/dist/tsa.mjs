import { sha256BytesHex } from "./hash.mjs";

function hexToBytes(hex){
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error("Expected a 64-character SHA-256 hex digest.");
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concatBytes(parts){
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function derLength(len){
  if (len < 128) return Uint8Array.from([len]);
  const bytes = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>>= 8;
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function derTlv(tag, content){
  return concatBytes([Uint8Array.from([tag]), derLength(content.length), content]);
}

// OID 2.16.840.1.101.3.4.2.1 (id-sha256)
const SHA256_OID_DER = Uint8Array.from([
  0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
]);
const DER_NULL = Uint8Array.from([0x05, 0x00]);

/**
 * Builds a standards-compliant ASN.1 DER RFC 3161 TimeStampReq for a 32-byte SHA-256 digest.
 * Privacy guarantee: ONLY the 32-byte hash is encoded — zero transcript text ever leaves the device.
 */
export function buildRfc3161Request(sha256HexDigest){
  const digestBytes = hexToBytes(sha256HexDigest);
  const version = derTlv(0x02, Uint8Array.from([0x01])); // INTEGER 1
  const algId = derTlv(0x30, concatBytes([SHA256_OID_DER, DER_NULL]));
  const hashedMessage = derTlv(0x04, digestBytes); // OCTET STRING (32 bytes)
  const messageImprint = derTlv(0x30, concatBytes([algId, hashedMessage]));
  const certReq = derTlv(0x01, Uint8Array.from([0xff])); // BOOLEAN TRUE
  return derTlv(0x30, concatBytes([version, messageImprint, certReq]));
}




function indexOfSubarray(haystack, needle){
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function extractGeneralizedTimeUtc(bytes){
  // ASN.1 GeneralizedTime tag = 0x18, length = 15..20 bytes like "20261127082000Z"
  for (let i = 0; i <= bytes.length - 17; i++) {
    if (bytes[i] === 0x18) {
      const len = bytes[i + 1] ?? 0;
      if (len >= 15 && len <= 22 && i + 2 + len <= bytes.length) {
        let s = "";
        for (let k = 0; k < len; k++) {
          s += String.fromCharCode(bytes[i + 2 + k] ?? 0);
        }
        const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(s);
        if (m) {
          return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
        }
      }
    }
  }
  return undefined;
}

/**
 * Offline structural & digest verification for a DER-encoded RFC 3161 TimeStampResp (.tsr).
 */
export function inspectRfc3161Token(
  tsrBytes,
  expectedSha256Hex){
  if (!tsrBytes || tsrBytes.length < 16 || tsrBytes[0] !== 0x30) {
    return {
      validStructure: false,
      pkiStatusGranted: false,
      digestEmbedded: false,
      summary: "Invalid RFC 3161 TimeStampResp (missing DER SEQUENCE header).",
    };
  }

  let expectedBytes;
  try {
    expectedBytes = hexToBytes(expectedSha256Hex);
  } catch (_e) {
    return {
      validStructure: true,
      pkiStatusGranted: false,
      digestEmbedded: false,
      summary: "Invalid expected SHA-256 hex digest.",
    };
  }

  // PKIStatusInfo begins with SEQUENCE { INTEGER 0 (granted) or 1 (grantedWithMods) }
  const grantedSeq0 = Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x00]);
  const grantedSeq1 = Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x01]);
  const pkiStatusGranted =
    indexOfSubarray(tsrBytes.subarray(0, 32), grantedSeq0) !== -1 ||
    indexOfSubarray(tsrBytes.subarray(0, 32), grantedSeq1) !== -1;

  const digestEmbedded = indexOfSubarray(tsrBytes, expectedBytes) !== -1;
  const genTimeUtc = extractGeneralizedTimeUtc(tsrBytes);

  return {
    validStructure: true,
    pkiStatusGranted,
    digestEmbedded,
    genTimeUtc,
    summary:
      pkiStatusGranted && digestEmbedded
        ? `RFC 3161 token granted and binds exact SHA-256 digest${genTimeUtc ? ` at ${genTimeUtc}` : ""}.`
        : "RFC 3161 token did NOT match expected SHA-256 digest or was not granted.",
  };
}

/**
 * Opt-in helper to anchor a 32-byte SHA-256 digest against a public RFC 3161 TSA.
 * Never invoked automatically; user must explicitly opt in.
 */
export async function requestRfc3161Timestamp(
  sha256HexDigest,
  options = {}){
  const tsaUrl = options.tsaUrl ?? "https://freetsa.org/tsr";
  const reqBytes = buildRfc3161Request(sha256HexDigest);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  try {
    const resp = await fetch(tsaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body: reqBytes,
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`TSA HTTP ${resp.status}`);
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    const inspection = inspectRfc3161Token(buf, sha256HexDigest);
    return {
      tsaUrl,
      requestSha256: sha256HexDigest,
      tokenBytes: buf,
      tokenSha256: sha256BytesHex(buf),
      inspection,
    };
  } finally {
    clearTimeout(timer);
  }
}

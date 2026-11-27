const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CARD_REGEX = /\b(?:\d[ .-]*?){13,19}\b/g;
const US_SSN_REGEX = /\b(?!000|666|9\d\d)\d{3}[\s.-](?!00)\d{2}[\s.-](?!0000)\d{4}\b/g;
const MY_IC_REGEX = /\b\d{6}-\d{2}-\d{4}\b/g;
const BANK_ACCOUNT_REGEX = /\b(?:account|acct|routing)\s*(?:number|no\.?|#|:)?\s*[:#]?\s*\d{6,17}\b/gi;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}\b/g;
const OTP_REGEX = /\b(?:otp|one-time\s+code|verification\s*code|2fa\s*code|验证码|kod\s*pengesahan)\s*[:：#]?\s*\d{4,8}\b/gi;
const TOKEN_URL_REGEX = /(https?:\/\/[^\s?#]+[?#][^\s]*(?:token|auth|key|session|sig|password|secret|jwt)=[^\s]+)/gi;
const ZERO_WIDTH_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u00AD\u061C\u034F]/g;
const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const FULLWIDTH_DIGIT_REGEX = /[\uFF10-\uFF19]/g;

/**
 * Strips zero-width/BiDi controls, combining diacritics, and homoglyph/fullwidth obfuscations
 * strictly for pattern matching.
 */
const HOMOGLYPH_MAP = {
  "\u0410": "A", "\u0430": "a", "\u0391": "A",
  "\u0412": "B", "\u0392": "B",
  "\u0421": "C", "\u0441": "c",
  "\u0501": "d",
  "\u0415": "E", "\u0435": "e", "\u0395": "E",
  "\u041D": "H", "\u04BB": "h", "\u0397": "H",
  "\u0406": "I", "\u0456": "i", "\u0399": "I",
  "\u0408": "J", "\u0458": "j",
  "\u041A": "K", "\u043A": "k", "\u039A": "K",
  "\u041C": "M", "\u039C": "M",
  "\u039D": "N",
  "\u041E": "O", "\u043E": "o", "\u039F": "O", "\u03BF": "o",
  "\u0420": "P", "\u0440": "p", "\u03A1": "P",
  "\u0405": "S", "\u0455": "s",
  "\u0422": "T", "\u03A4": "T",
  "\u0425": "X", "\u0445": "x", "\u03A7": "X",
  "\u0423": "Y", "\u0443": "y", "\u03A5": "Y",
  "\u0396": "Z",
};
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPH_MAP).join("")}]`, "g");

export function normalizeForDetection(input){
  if (!input) return "";
  return input
    .normalize("NFKC")
    .normalize("NFD")
    .replace(COMBINING_MARKS_REGEX, "")
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(HOMOGLYPH_RE, (ch) => HOMOGLYPH_MAP[ch] ?? ch)
    .replace(/(?<![a-zA-Z])A\s*[.·•-]\s*I\.?(?![a-zA-Z])/gi, "AI")
    .replace(/(?<![a-zA-Z])A\s+I(?=\s*(?:assistant|agent|bot|chatbot|客服|助手|助理))/gi, "AI")
    .replace(/\bb0t\b/gi, "bot")
    .replace(/(?<![a-zA-Z0-9])41(?=\s+(?:assistant|agent|bot|chatbot|support))/gi, "AI");
}

export function redactPII(input){
  if (!input) {
    return "";
  }
  const preCleaned = input
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(FULLWIDTH_DIGIT_REGEX, (ch) => String(ch.charCodeAt(0) - 0xff10));

  return preCleaned
    .replace(TOKEN_URL_REGEX, "[REDACTED_AUTH_URL]")
    .replace(EMAIL_REGEX, "[REDACTED_EMAIL]")
    .replace(OTP_REGEX, "[REDACTED_OTP]")
    .replace(US_SSN_REGEX, "[REDACTED_SSN]")
    .replace(MY_IC_REGEX, "[REDACTED_ID]")
    .replace(BANK_ACCOUNT_REGEX, "[REDACTED_ACCOUNT]")
    .replace(CARD_REGEX, "[REDACTED_CARD]")
    .replace(PHONE_REGEX, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length < 9) {
        return match;
      }
      return "[REDACTED_PHONE]";
    });
}

export function createRedactedExcerpt(input, maxLength = 140){
  const cleaned = redactPII(input).replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

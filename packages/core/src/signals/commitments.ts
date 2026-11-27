import type {
  CommitmentCategory,
  CommitmentFlag,
  CommitmentQualifier,
  ConversationSession,
  VerdictLabel,
} from "../types.js";
import { createRedactedExcerpt, normalizeForDetection } from "../sanitizer.js";

interface CommitmentRule {
  category: CommitmentCategory;
  pattern: RegExp;
  riskNote: string;
}

const COMMITMENT_RULES: CommitmentRule[] = [
  {
    category: "refund_guarantee",
    pattern:
      /\b(?:full\s+refund|100%\s+refund|guaranteed\s+refund|cash\s+refund\s+to\s+your\s+original|refund\s+(?:approved|guaranteed|within\s+\d+)|reimburse\s+(?:the\s+)?full\s+amount|credit\s+back\s+100%|100%\s+(?:money\s+back|reimbursement)|(?:revers(?:ed|ing|e)|credit(?:ed|ing)?)\s+(?:that|the|your)\s+(?:charge|card|account|balance|payment)|credit\s+your\s+(?:card|account|statement)\s+back|approved\s+your\s+refund|(?:issue|offer|provide|give|grant)(?:d|ing)?\s+(?:you\s+)?(?:a\s+)?(?:\$?\d[\d,]*(?:\.\d{1,2})?\s+)?(?:store|future\s+travel|travel|flight|merchandise|account\s+balance)\s+credit)|(?:全额退款|保证退款|无条件退款|全額退款)|\b(?:bayaran\s+balik\s+penuh|jaminan\s+pulangan\s+wang|refund\s+penuh)\b/gi,
    riskNote:
      "Refund or account-credit commitment detected (relevant to Visa 13.6 / Amex C02 / Mastercard 4853 — Credit Not Processed). Request an official ticket ID and written email confirmation.",
  },
  {
    category: "pricing_quote",
    pattern:
      /(?:\b(?:RM|MYR|USD|SGD|EUR|GBP|\$|€|£)\s?\d[\d,]*(?:\.\d{1,2})?\b|\b\d+(?:\.\d{1,2})?\s?(?:RM|MYR|USD|SGD|元|块|令吉)\b).{0,40}(?:\b(?:final\s+price|quote|total|discount|per\s+month|inclusive|only|no\s+hidden\s+fees)\b|(?:报价|总价|优惠价|全包|包运费|包邮|每月)|\b(?:harga\s+muktamad|sebut\s+harga|jumlah|diskaun)\b)|(?:\b(?:quote|final\s+price|special\s+offer|discount\s+of)\b|(?:最终报价|优惠价|折扣|只要|只需|仅需)).{0,40}(?:RM|MYR|USD|SGD|\$|€|£|\d+%|\d+\s?(?:元|块|令吉))|\b\d{1,2}%\s*(?:off|discount)\b/gi,
    riskNote:
      "Pricing or discount quote detected (relevant to Visa 13.5 / Amex C31 — Misrepresentation). Save a Chargeback Evidence Pack and confirm the final invoice before paying.",
  },
  {
    category: "cancellation_terms",
    pattern:
      /\b(?:free\s+cancellation|cancel\s+anytime|no\s+cancellation\s+fee|(?:waiv(?:ed|e|ing)|remov(?:ed|e|ing)|drop(?:ped)?)\s+(?:the\s+)?(?:cancellation|restocking|return\s+shipping|late|overdraft|monthly)\s+fee|waive\s+(?:the\s+)?fee|no\s+restocking\s+fee|(?:cancel(?:led|ed)?|stop(?:ped)?|turn(?:ed)?\s+off)\s+(?:your\s+)?(?:auto-?renewal|recurring\s+(?:billing|charge|charges|subscription|payment))|won't\s+be\s+charged\s+again)\b|(?:免费取消|免收手续费|随时取消|免违约金)|\b(?:pembatalan\s+percuma|tiada\s+caj\s+pembatalan)\b/gi,
    riskNote:
      "Cancellation, auto-renewal stop, or fee-waiver promise detected (relevant to Visa 13.2 / Mastercard 4841 / Amex C28 — Canceled Recurring). Save confirmation in case recurring billing continues.",
  },
  {
    category: "policy_exception",
    pattern:
      /\b(?:make\s+an\s+exception|special\s+exception|override\s+policy|extended\s+warranty|one-time\s+courtesy\s+credit)\b|(?:特殊豁免|破例处理|延长保修)|\b(?:pengecualian\s+khas|waranti\s+lanjutan|waranti\s+tambahan)\b/gi,
    riskNote:
      "Policy exception or courtesy credit commitment detected. Automated assistants frequently hallucinate exceptions; confirm with a human specialist in writing.",
  },
  {
    category: "deadline_promise",
    pattern:
      /\b(?:guaranteed\s+delivery|arrive\s+by|processed\s+within\s+\d+\s+(?:hours|business\s+days))\b|(?:保证在.{0,8}内送达|承诺.{0,8}内处理完成)|\b(?:dijamin\s+sampai|diproses\s+dalam\s+tempoh\s+\d+)\b/gi,
    riskNote:
      "Delivery or processing SLA promise detected. Keep this timestamped receipt if the deadline is missed.",
  },
];

const STORE_CREDIT_TRAP_RE =
  /\b(?:store\s+credit\s+only|(?:as|via|to\s+your)\s+(?:a\s+)?(?:future\s+)?(?:store\s+credit|travel\s+credit|flight\s+credit|merchandise\s+credit|account\s+balance\s+credit|voucher|gift\s+card)|(?:issue|offer|provide|give|grant)(?:d|ing)?\s+(?:you\s+)?(?:a\s+)?(?:\$?\d[\d,]*(?:\.\d{1,2})?\s+)?(?:store|future\s+travel|travel|flight|merchandise|account\s+balance)\s+credit|loyalty\s+points\s+only|travel\s+voucher\s+only|non-cash\s+credit|instead\s+of\s+(?:cash|original\s+payment))\b/i;

const CONDITIONAL_TRAP_RE =
  /\b(?:(?:subject\s+to|pending)\s+(?:warehouse\s+)?(?:inspection|approval|verification|review|a\s+\d+%|restocking\s+fee)|provided\s+that|minus\s+(?:a\s+)?(?:\$?\d[\d.,]*\s+)?(?:return\s+)?shipping(?:\s+fee)?|less\s+a\s+\d+%\s+restocking\s+fee|(?:eligible\s+for\s+)?partial\s+refund\s+only|if\s+returned\s+unopened)\b/i;

const NEGATION_PREFIX_RE =
  /(?:\b(?:no|not|never|cannot|can't|won't|wouldn't|don't|doesn't|do\s+not|does\s+not|unable\s+to|ineligible\s+for|not\s+eligible\s+for|non-refundable|refuse\s+to|decline\s+to)\b|(?:不支持|不能|无法|不提供|不可|恕不|不予|无权|不接受|没有)|\b(?:tidak|tiada|bukan|tidak\s+boleh|tidak\s+layak|tidak\s+menyediakan)\b)/i;

const POST_NEGATION_RE =
  /^\s*(?:is|are|will\s+be|would\s+be|was|were)?\s*(?:not|no\s+longer|never)\s+(?:available|included|eligible|offered|guaranteed|applicable|possible|permitted|allowed|provided)\b/i;

const STRONG_CLAUSE_BREAK_RE =
  /[.!?;。！？；\n]|\b(?:however|but|although|yet)\b|(?:但是|不过|然而)|\b(?:tetapi|namun)\b/gi;

function isNegatedInSameClause(text: string, matchIndex: number, matchLength: number): boolean {
  const windowStart = Math.max(0, matchIndex - 96);
  let prefix = text.slice(windowStart, matchIndex);

  let lastBreakEnd = 0;
  STRONG_CLAUSE_BREAK_RE.lastIndex = 0;
  let m = STRONG_CLAUSE_BREAK_RE.exec(prefix);
  while (m) {
    lastBreakEnd = m.index + m[0].length;
    m = STRONG_CLAUSE_BREAK_RE.exec(prefix);
  }
  prefix = prefix.slice(lastBreakEnd).trim();
  if (prefix && NEGATION_PREFIX_RE.test(prefix)) {
    return true;
  }

  const suffixEnd = Math.min(text.length, matchIndex + matchLength + 44);
  let suffix = text.slice(matchIndex + matchLength, suffixEnd);
  STRONG_CLAUSE_BREAK_RE.lastIndex = 0;
  const sm = STRONG_CLAUSE_BREAK_RE.exec(suffix);
  if (sm) {
    suffix = suffix.slice(0, sm.index);
  }
  if (suffix && POST_NEGATION_RE.test(suffix)) {
    return true;
  }

  return false;
}

interface QualifierResult {
  qualifier: CommitmentQualifier;
  qualifierNote?: string;
}

function classifyQualifier(normText: string): QualifierResult {
  if (STORE_CREDIT_TRAP_RE.test(normText)) {
    return {
      qualifier: "store_credit_only",
      qualifierNote:
        "Store-credit / travel-voucher trap detected — this is NOT a cash refund back to your original payment card.",
    };
  }
  if (CONDITIONAL_TRAP_RE.test(normText)) {
    return {
      qualifier: "conditional",
      qualifierNote:
        "Conditional promise detected (e.g., subject to inspection, approval, or fee deductions). Verify exact eligibility before relying on it.",
    };
  }
  return { qualifier: "unconditional" };
}

export function detectCommitmentFlags(
  session: ConversationSession,
  turnSpeakerStates: Map<string, VerdictLabel>
): CommitmentFlag[] {
  const flags: CommitmentFlag[] = [];
  let seq = 1;

  for (const turn of session.turns) {
    if (turn.role === "visitor" || turn.role === "system") {
      continue;
    }
    const observedAt = turn.timestamp ?? session.startedAt;
    const speakerStateAtTurn = turnSpeakerStates.get(turn.id) ?? "INCONCLUSIVE";
    const normText = normalizeForDetection(turn.text);

    for (const rule of COMMITMENT_RULES) {
      rule.pattern.lastIndex = 0;
      let matched = false;
      let match = rule.pattern.exec(normText);
      while (match) {
        if (!isNegatedInSameClause(normText, match.index, match[0].length)) {
          matched = true;
          break;
        }
        match = rule.pattern.exec(normText);
      }
      if (!matched) {
        continue;
      }

      const { qualifier, qualifierNote } = classifyQualifier(normText);
      flags.push({
        id: `cm-${seq++}`,
        turnId: turn.id,
        observedAt,
        category: rule.category,
        qualifier,
        qualifierNote,
        excerptRedacted: createRedactedExcerpt(turn.text, 160),
        speakerStateAtTurn,
        riskNote: qualifierNote ? `${qualifierNote} ${rule.riskNote}` : rule.riskNote,
      });
    }
  }

  return flags;
}

import type {
  CommitmentFlag,
  DefensePrompt,
  HandoffFrictionReport,
  TransparencyAudit,
  VerdictLabel,
} from "../types.js";

/**
 * Generates read-only, copy-ready US-English (plus optional ZH/MS) consumer verification prompts
 * tailored to the observed session state, handoff friction, and flagged commitments.
 */
export function buildDefensePrompts(
  verdict: VerdictLabel,
  transparency: TransparencyAudit,
  commitments: CommitmentFlag[],
  handoffFriction?: HandoffFrictionReport
): DefensePrompt[] {
  const prompts: DefensePrompt[] = [];

  if (handoffFriction && handoffFriction.detected) {
    prompts.push({
      id: "def-escalate-loop",
      purpose: "escalate_loop",
      title: "Break Human-Escalation Loop & Request Case ID",
      en: "I have requested a live human representative multiple times without being transferred. Please provide a direct support email, phone number, or official case/ticket number so a human supervisor can review this issue.",
      zh: "我已多次请求转接人工客服但均未接入。请直接提供官方人工投诉邮箱、客服电话或正式工单编号，以便人工主管跟进处理。",
      ms: "Saya telah beberapa kali meminta pegawai manusia tetapi tidak disambungkan. Sila berikan alamat e-mel sokongan rasmi, nombor telefon, atau nombor tiket supaya penyelia manusia boleh menyemak kes ini.",
    });
  }

  if (commitments.length > 0) {
    const categories = [...new Set(commitments.map((c) => c.category))];
    const hasRefund = categories.includes("refund_guarantee");
    const hasCancel = categories.includes("cancellation_terms");
    const hasPricing = categories.includes("pricing_quote");
    const topicEn = hasRefund
      ? "refund commitment"
      : hasCancel
      ? "cancellation and recurring-billing stop"
      : hasPricing
      ? "quoted price"
      : "policy exception";

    prompts.push({
      id: "def-verify-commitment",
      purpose: "verify_commitment",
      title: `Lock In Written Proof (${topicEn})`,
      en: `Before I proceed, please confirm this ${topicEn} in writing with an official case/reference ID and email confirmation to my account, and confirm whether a human agent has approved it.`,
      zh: `在我付款或操作前，能否请您提供正式工单号，并将刚才的承诺通过官方邮件书面确认给我？同时请确认该承诺是否已由人工客服核准。`,
      ms: `Sebelum saya meneruskan, bolehkah anda mengesahkan komitmen ini secara bertulis bersama nombor tiket rasmi dan pengesahan e-mel, serta sahkan sama ada ia diluluskan oleh pegawai khidmat pelanggan?`,
    });
  }

  if (
    verdict === "AI_DISCLOSED" ||
    verdict === "AUTOMATION_LIKELY" ||
    verdict === "AI_ASSISTED_POSSIBLE"
  ) {
    prompts.push({
      id: "def-request-human",
      purpose: "request_human",
      title: "Request Live Human Agent Handoff",
      en: "Please transfer me to a live human customer support representative who can review my account and provide a written reference number.",
      zh: "请帮我转接人工客服专员处理此事，并麻烦在接入后提供工单编号以便留底，谢谢。",
      ms: "Bolehkah anda menyambungkan perbualan ini kepada pegawai khidmat pelanggan manusia yang boleh menyemak kes saya dan memberi nombor rujukan rasmi?",
    });
  }

  if (
    transparency.status === "disclosed_late" ||
    transparency.status === "not_disclosed" ||
    verdict === "AI_ASSISTED_POSSIBLE"
  ) {
    prompts.push({
      id: "def-confirm-disclosure",
      purpose: "confirm_disclosure",
      title: "Ask Direct AI Disclosure Question (CA / UT / ME)",
      en: "For my records, am I currently chatting with an AI/automated system or a live human representative? Please clarify directly before we finalize any terms.",
      zh: "为了方便留存记录，请问目前回复我的是 AI 智能助手还是真人客服？在确认最终条款前烦请先说明。",
      ms: "Untuk rekod saya, adakah saya sedang berbual dengan pembantu AI automatik atau wakil khidmat pelanggan manusia? Sila jelaskan sebelum kita memuktamadkan sebarang terma.",
    });
  }

  return prompts;
}

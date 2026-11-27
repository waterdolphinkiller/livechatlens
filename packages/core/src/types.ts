export type SpeakerRole =
  | "visitor"
  | "support_agent"
  | "assistant"
  | "system"
  | "unknown";

export interface ConversationTurn {
  id: string;
  role: SpeakerRole;
  text: string;
  timestamp?: number;
  visibleLabel?: string;
  sourceElement?: string;
  metadata?: Record<string, string | number | boolean>;
}

export type ConversationEventType =
  | "widget_opened"
  | "ai_disclosure_banner"
  | "handoff_started"
  | "agent_joined"
  | "agent_left"
  | "menu_rendered"
  | "unknown";

export interface ConversationEvent {
  id: string;
  type: ConversationEventType;
  observedAt: number;
  label?: string;
  turnId?: string;
  details?: string;
  metadata?: Record<string, string | number | boolean>;
}

export type CoverageStatus =
  | "full"
  | "partial"
  | "blocked_cross_origin_iframe"
  | "blocked_closed_shadow_dom"
  | "empty";

export interface ConversationCoverage {
  status: CoverageStatus;
  readableTurns: number;
  iframeDetected?: boolean;
  shadowDomDetected?: boolean;
  blockedIframeOrigins?: string[];
  notes?: string[];
}

export interface ConversationSession {
  sessionId: string;
  platformId: string;
  adapterId: string;
  pageUrl?: string;
  startedAt: number;
  turns: ConversationTurn[];
  observedEvents: ConversationEvent[];
  coverage: ConversationCoverage;
}

export type VerdictLabel =
  | "AI_DISCLOSED"
  | "AUTOMATION_LIKELY"
  | "AI_ASSISTED_POSSIBLE"
  | "HUMAN_HANDOFF_OBSERVED"
  | "HUMAN_AGENT_INDICATED"
  | "MIXED_OR_HYBRID"
  | "INCONCLUSIVE";

export type EvidenceLevel = "direct" | "strong" | "moderate" | "weak" | "insufficient";

export type EvidenceStrength = "direct" | "strong" | "weak";

export type EvidenceDirection =
  | "ai_disclosure"
  | "automation"
  | "human_handoff"
  | "human_identity"
  | "ai_language"
  | "contradiction";

export type EvidenceSource =
  | "visible_ui"
  | "platform_adapter"
  | "conversation_pattern"
  | "local_model";

export interface EvidenceItem {
  id: string;
  code: string;
  direction: EvidenceDirection;
  strength: EvidenceStrength;
  observedAt: number;
  turnIds: string[];
  excerptRedacted?: string;
  explanation: string;
  alternativeExplanation?: string;
  source: EvidenceSource;
  modelVersion?: string;
}

export interface TimelineEntry {
  observedAt: number;
  kind: "event" | "evidence" | "commitment" | "dark_pattern";
  title: string;
  detail: string;
  turnIds: string[];
  strength?: EvidenceStrength;
}

export type TransparencyStatus =
  | "disclosed_first_turn"
  | "disclosed_late"
  | "not_disclosed"
  | "not_applicable";

export interface TransparencyAudit {
  status: TransparencyStatus;
  firstResponderTurnId?: string;
  disclosureTurnId?: string;
  firstResponderIndex?: number;
  disclosureIndex?: number;
  machineReadableMarkers: string[];
  notes: string[];
}

export type DarkPatternCode =
  | "LOW_VISIBILITY_DISCLOSURE"
  | "ANTHROPOMORPHIC_MASKING"
  | "HANDOFF_LOOP_FRICTION"
  | "BURIED_TOS_DISCLOSURE"
  | "FAKE_HUMAN_HANDOFF";

export interface DarkPatternFlag {
  id: string;
  code: DarkPatternCode;
  observedAt: number;
  turnIds: string[];
  explanation: string;
}

export interface HandoffFrictionReport {
  detected: boolean;
  requestCount: number;
  requestTurnIds: string[];
  escalated: boolean;
  summary: string;
}

export type CommitmentCategory =
  | "pricing_quote"
  | "refund_guarantee"
  | "cancellation_terms"
  | "policy_exception"
  | "deadline_promise";

export type CommitmentQualifier = "unconditional" | "conditional" | "store_credit_only";

export interface CommitmentFlag {
  id: string;
  turnId: string;
  observedAt: number;
  category: CommitmentCategory;
  qualifier: CommitmentQualifier;
  qualifierNote?: string;
  excerptRedacted: string;
  speakerStateAtTurn: VerdictLabel;
  riskNote: string;
}

export interface DefensePrompt {
  id: string;
  purpose: "verify_commitment" | "request_human" | "confirm_disclosure" | "escalate_loop";
  title: string;
  en: string;
  zh: string;
  ms: string;
}

export interface EvidenceReceipt {
  receiptVersion: string;
  generatedAt: number;
  sessionId: string;
  platformId: string;
  pageUrlRedacted?: string;
  verdict: VerdictLabel;
  evidenceLevel: EvidenceLevel;
  transparencyStatus: TransparencyStatus;
  redactedTurnCount: number;
  evidenceCount: number;
  commitmentCount: number;
  darkPatternCount: number;
  sha256: string;
  screenshotSha256?: string;
  combinedSha256?: string;
}

export interface AnalyzeOptions {
  generatedAt?: number;
  minTurnsForNonDirectVerdict?: number;
  screenshotSha256?: string;
}

export interface AnalysisResult {
  label: VerdictLabel;
  evidenceLevel: EvidenceLevel;
  summary: string;
  evidence: EvidenceItem[];
  timeline: TimelineEntry[];
  transparencyAudit: TransparencyAudit;
  handoffFriction: HandoffFrictionReport;
  darkPatterns: DarkPatternFlag[];
  commitments: CommitmentFlag[];
  defensePrompts: DefensePrompt[];
  limitations: string[];
  coverage: ConversationCoverage;
  abstentionReason?: string;
  receipt: EvidenceReceipt;
}

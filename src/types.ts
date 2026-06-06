export type PresetKey =
  | "cold_ceo_regret"
  | "reborn_stop_simping"
  | "abandoned_real_heir"
  | "bad_husband_redemption"
  | "ceo_family_child"
  | "overpowered_villain";

export type StageStatus = "not_started" | "draft" | "approved" | "needs_repair";
export type PartStatus = "empty" | "draft" | "checked" | "approved" | "needs_repair";
export type ScriptWriterProvider = "anthropic" | "vertex_gemini";
export type StageKey = "00_idea" | "01_foundation" | "02_macro" | "03_scenes";

export interface NichePreset {
  key: PresetKey;
  label: string;
  promise: string;
  requiredBeats: string[];
  avoid: string[];
}

export interface StageConfig {
  id: number;
  key: StageKey;
  code: string;
  name: string;
  model: string;
  description: string;
  optional?: boolean;
}

export interface StageData {
  output: string;
  handoff: string;
  status: StageStatus;
  feedback: string;
}

export interface ScriptPart {
  number: number;
  title: string;
  output: string;
  memory: string;
  feedback: string;
  status: PartStatus;
  checks: CheckIssue[];
}

export interface CheckIssue {
  severity: "ok" | "warning" | "error";
  message: string;
}

export interface ForgeState {
  rawIdea: string;
  preset: PresetKey;
  outputLanguage: "English" | "Russian";
  competitorScripts: string;
  styleBlueprint: string;
  referenceGuard: string;
  activeStageIdx: number;
  stages: Record<StageKey, StageData>;
  scriptWriterProvider: ScriptWriterProvider;
  selectedPart: number;
  parts: ScriptPart[];
  avatarEnabled: boolean;
  notes: string;
  warnings: string[];
}

export const STAGES_CONFIG: StageConfig[] = [
  {
    id: 0,
    key: "00_idea",
    code: "00",
    name: "Idea Setup",
    model: "gemini-2.5-flash",
    description: "Develop the title, hook, raw idea, originality guard, and producer handoff."
  },
  {
    id: 1,
    key: "01_foundation",
    code: "01",
    name: "Foundation DNA",
    model: "gemini-2.5-flash",
    description: "Lock character functions, proof system, regret ladder, hidden cards, and payoff logic."
  },
  {
    id: 2,
    key: "02_macro",
    code: "02",
    name: "Macro Outline",
    model: "gemini-2.5-pro",
    description: "Optional nine-part master plan with length, payoff, avatar, and scene requirements.",
    optional: true
  },
  {
    id: 3,
    key: "03_scenes",
    code: "03",
    name: "Scene Cards",
    model: "gemini-2.5-pro",
    description: "Detailed scene matrix for all parts. This is the source of truth for the writer."
  }
];

export const PARTS: Omit<ScriptPart, "output" | "memory" | "feedback" | "status" | "checks">[] = [
  { number: 1, title: "PART ONE" },
  { number: 2, title: "PART TWO" },
  { number: 3, title: "PART THREE" },
  { number: 4, title: "PART FOUR" },
  { number: 5, title: "PART FIVE" },
  { number: 6, title: "PART SIX" },
  { number: 7, title: "PART SEVEN" },
  { number: 8, title: "PART EIGHT" },
  { number: 9, title: "PART NINE" }
];

export const PART_TARGET = {
  min: 12800,
  idealMin: 13300,
  idealMax: 14500,
  max: 15000,
  wordMin: 2300,
  wordMax: 2600
};

export const PARAGRAPH_RULE = {
  minChars: 120,
  maxChars: 220,
  minWords: 22,
  maxWords: 36,
  punchMinWords: 8,
  punchMaxWords: 16
};

export const PRESETS: NichePreset[] = [
  {
    key: "cold_ceo_regret",
    label: "Cold CEO Regret",
    promise: "A loyal man leaves a cold CEO or ex-wife, joins a stronger new woman, and becomes impossible to reclaim.",
    requiredBeats: [
      "humiliation by CEO or ex",
      "calm resignation or divorce",
      "ex assumes he will crawl back",
      "new high-status woman recognizes his value",
      "public jealousy and late regret",
      "hero refuses to return"
    ],
    avoid: ["instant forgiveness", "ex regrets in the first act", "generic boardroom-only revenge"]
  },
  {
    key: "reborn_stop_simping",
    label: "Reborn Stop Simping",
    promise: "A reborn protagonist stops chasing the wrong girl and uses future knowledge to reclaim status.",
    requiredBeats: [
      "past-life death or ruin",
      "return to the first wrong-choice day",
      "first cold refusal",
      "wrong girl chooses the red-flag rival",
      "hero builds money, grades, or power",
      "true girl proves loyalty"
    ],
    avoid: ["too much school filler", "hero still chasing the old girl", "future knowledge with no proof"]
  },
  {
    key: "abandoned_real_heir",
    label: "Abandoned Real Heir",
    promise: "The true child leaves a rich family that chose the fake heir and later exposes the family mistake.",
    requiredBeats: [
      "family protects fake heir",
      "real heir asks for clean separation",
      "parents call it a tantrum",
      "hidden skill, money, or backing appears",
      "fake heir overplays the victim",
      "family realizes they lost the real one"
    ],
    avoid: ["parents apologize too early", "fake heir with no strategy", "empty luxury flexing"]
  },
  {
    key: "bad_husband_redemption",
    label: "Bad Husband Redemption",
    promise: "A failed husband or father is reborn and spends the whole story protecting the family he once destroyed.",
    requiredBeats: [
      "ugly death or guilt hook",
      "rebirth into the damaged family home",
      "wife and child fear him",
      "first real protective action",
      "honest money arc",
      "family slowly trusts him"
    ],
    avoid: ["instant forgiveness", "revenge replacing redemption", "business success with no family warmth"]
  },
  {
    key: "ceo_family_child",
    label: "CEO Family Child",
    promise: "A child, CEO mother, or hidden family bond forces a cold relationship to become warm and addictive.",
    requiredBeats: [
      "unexpected child or stepchild pressure",
      "cold adult misjudges hero",
      "hero seems useless but is emotionally useful",
      "child becomes the emotional bridge",
      "public warmth changes reputation",
      "family payoff"
    ],
    avoid: ["child as prop only", "no daily-life warmth", "romance with no family stakes"]
  },
  {
    key: "overpowered_villain",
    label: "Overpowered Villain",
    promise: "A transmigrated villain stops simping, uses status and plot knowledge, and crushes the protagonist system.",
    requiredBeats: [
      "transmigration into villain body",
      "female lead chooses protagonist",
      "villain refuses the original plot",
      "family or system power unlocks",
      "protagonist loses plot armor",
      "villain wins without apology"
    ],
    avoid: ["rank jargon without emotion", "power fantasy with no regret track", "copying fantasy surfaces from references"]
  }
];

export const INITIAL_STAGE_DATA: StageData = {
  output: "",
  handoff: "",
  status: "not_started",
  feedback: ""
};

export const INITIAL_STATE: ForgeState = {
  rawIdea: "",
  preset: "cold_ceo_regret",
  outputLanguage: "English",
  competitorScripts: "",
  styleBlueprint: "",
  referenceGuard: "",
  activeStageIdx: 0,
  stages: {
    "00_idea": { ...INITIAL_STAGE_DATA },
    "01_foundation": { ...INITIAL_STAGE_DATA },
    "02_macro": { ...INITIAL_STAGE_DATA },
    "03_scenes": { ...INITIAL_STAGE_DATA }
  },
  scriptWriterProvider: "anthropic",
  selectedPart: 1,
  parts: PARTS.map((part) => ({
    ...part,
    output: "",
    memory: "",
    feedback: "",
    status: "empty",
    checks: []
  })),
  avatarEnabled: true,
  notes: "Start with the title or raw situation, extract competitor style, generate the planning stages, then write one part at a time.",
  warnings: []
};

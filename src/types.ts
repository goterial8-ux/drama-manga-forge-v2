export type PresetKey =
  | "cold_ceo_regret"
  | "reborn_stop_simping"
  | "abandoned_real_heir"
  | "bad_husband_redemption"
  | "ceo_family_child"
  | "overpowered_villain";

export interface NichePreset {
  key: PresetKey;
  label: string;
  promise: string;
  requiredBeats: string[];
  avoid: string[];
}

export interface ScriptPart {
  number: number;
  title: string;
  output: string;
  memory: string;
  status: "empty" | "draft" | "checked" | "needs_repair";
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
  storyDna: string;
  sceneCards: string;
  avatarEnabled: boolean;
  selectedPart: number;
  parts: ScriptPart[];
  notes: string;
}

export const PARTS: Omit<ScriptPart, "output" | "memory" | "status" | "checks">[] = [
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

export const INITIAL_STATE: ForgeState = {
  rawIdea: "",
  preset: "cold_ceo_regret",
  outputLanguage: "English",
  competitorScripts: "",
  styleBlueprint: "",
  referenceGuard: "",
  storyDna: "",
  sceneCards: "",
  avatarEnabled: true,
  selectedPart: 1,
  parts: PARTS.map((part) => ({
    ...part,
    output: "",
    memory: "",
    status: "empty",
    checks: []
  })),
  notes: "Paste competitor scripts, extract a style blueprint, lock story DNA and scene cards, then let Claude write one part at a time."
};

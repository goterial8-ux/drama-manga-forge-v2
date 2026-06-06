import dotenv from "dotenv";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "25mb" }));

type ClaudeCallOptions = {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
};

type GeminiCallOptions = {
  system: string;
  prompt: string;
  model: string;
  maxOutputTokens?: number;
  temperature?: number;
  thinkingBudget?: number;
  thinkingLevel?: string;
};

type StageRequest = {
  stageId?: number;
  rawIdea?: string;
  presetLabel?: string;
  presetPromise?: string;
  outputLanguage?: string;
  styleBlueprint?: string;
  referenceGuard?: string;
  previousHandoffs?: Record<string, string>;
  feedback?: string;
};

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_GEMINI_FAST_MODEL = process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash";
const DEFAULT_GEMINI_PRO_MODEL = process.env.GEMINI_PRO_MODEL || "gemini-2.5-pro";
const DEFAULT_GEMINI_WRITER_MODEL = process.env.GEMINI_WRITER_MODEL || "gemini-3.1-pro-preview";
const DEFAULT_GEMINI_WRITER_THINKING = process.env.GEMINI_WRITER_THINKING_LEVEL || "HIGH";

let googleAi: GoogleGenAI | null = null;

function envFlag(value: string | undefined): boolean {
  return value === "True" || value === "true" || value === "1";
}

function getClaudeModel(model?: string): string {
  return model || process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL;
}

function getScriptWriterProvider(provider?: string): "anthropic" | "vertex_gemini" {
  const resolved = provider || process.env.SCRIPT_WRITER_PROVIDER || "anthropic";
  return resolved === "vertex_gemini" ? "vertex_gemini" : "anthropic";
}

function getStageModel(stageId: number): string {
  if (stageId === 2 || stageId === 3) return DEFAULT_GEMINI_PRO_MODEL;
  return DEFAULT_GEMINI_FAST_MODEL;
}

function getGoogleAi(): GoogleGenAI {
  if (googleAi) return googleAi;

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
  const useVertex = envFlag(process.env.GOOGLE_GENAI_USE_VERTEXAI);

  if (!useVertex || !project) {
    throw new Error("Vertex AI is not configured. Set GOOGLE_GENAI_USE_VERTEXAI=True, GOOGLE_CLOUD_PROJECT, and GOOGLE_CLOUD_LOCATION.");
  }

  googleAi = new GoogleGenAI({
    vertexai: true,
    project,
    location
  } as any);

  return googleAi;
}

function stripThinkingBlocks(text: string): string {
  return text.replace(/<(thought|thinking)>[\s\S]*?<\/\1>/gi, "").trim();
}

async function callVertexGemini({
  system,
  prompt,
  model,
  maxOutputTokens = 8192,
  temperature = 0.55,
  thinkingBudget,
  thinkingLevel
}: GeminiCallOptions): Promise<string> {
  const ai = getGoogleAi();
  const config: any = {
    systemInstruction: system,
    temperature,
    maxOutputTokens
  };

  if (thinkingLevel && model.includes("gemini-3")) {
    config.thinkingConfig = { thinkingLevel };
  } else if (typeof thinkingBudget === "number" && model.includes("gemini-2.5")) {
    config.thinkingConfig = { thinkingBudget };
  }

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config
  } as any);

  return stripThinkingBlocks(String((response as any).text || "")).trim();
}

async function callClaude({ system, prompt, maxTokens = 8192, temperature = 0.8, model }: ClaudeCallOptions): Promise<string> {
  // Пытаемся получить TKBK API ключ (который начинается с cr_), иначе фоллбэк на Anthropic
  const apiKey = process.env.TKBK_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Claude API key. Add a Claude-compatible key to deployment secrets.");
  }

  // Если ключ начинается с cr_, шлем запросы на tkbk.io, иначе в стандартный Anthropic API
  const isTkbk = apiKey.startsWith("cr_");
  const url = isTkbk ? "https://api.tkbk.io/claude/v1/messages" : "https://api.anthropic.com/v1/messages";

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION
  };

  // Правильная авторизация для TKBK
  if (isTkbk) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: getClaudeModel(model),
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || data?.message || `API failed with ${response.status}`;
    throw new Error(message);
  }

  const textBlocks = Array.isArray(data.content)
    ? data.content
        .filter((block: any) => block?.type === "text" && typeof block?.text === "string")
        .map((block: any) => block.text)
    : [];

  return textBlocks.join("\n").trim();
}

function sampleReferenceText(text: string, maxChars = 90000): string {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= maxChars) return clean;

  const slice = Math.floor(maxChars / 3);
  const middleStart = Math.max(0, Math.floor(clean.length / 2) - Math.floor(slice / 2));
  return [
    "[REFERENCE SAMPLE: OPENING]",
    clean.slice(0, slice),
    "[REFERENCE SAMPLE: MIDDLE]",
    clean.slice(middleStart, middleStart + slice),
    "[REFERENCE SAMPLE: ENDING]",
    clean.slice(-slice)
  ].join("\n\n");
}

function buildReferenceGuard(referenceScripts: string): string {
  const common = new Set([
    "The", "This", "That", "Then", "When", "After", "Before", "Because", "But", "And",
    "His", "Her", "She", "He", "They", "You", "CEO", "Miss", "Mr", "Mom", "Dad", "Part", "Chapter"
  ]);

  const counts = new Map<string, number>();
  for (const match of referenceScripts.matchAll(/\b[A-Z][a-zA-Z]{2,}\b/g)) {
    const word = match[0];
    if (common.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const likelyNames = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([word]) => word);

  return [
    "REFERENCE GUARD",
    "Use competitor scripts only as style references.",
    "Do not reuse competitor plot paths, scene choreography, proof objects, relationship setups, final punishments, or exact dialogue.",
    likelyNames.length
      ? `Likely reference-specific names or labels to avoid copying into the new story: ${likelyNames.join(", ")}.`
      : "No repeated proper names were extracted, but all reference-specific names remain banned.",
    "When a reference has a useful function, transfer only the function. Public humiliation may transfer; the exact gala, ring, hospital, contract, family setup, or final punishment must not."
  ].join("\n");
}

function fallbackBlueprint(referenceScripts: string): string {
  const sample = sampleReferenceText(referenceScripts, 12000);
  const sentences = sample.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean);
  const averageSentenceLength = Math.round(
    sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).filter(Boolean).length, 0) / Math.max(1, sentences.length)
  );

  return [
    "REFERENCE STYLE BLUEPRINT",
    "Source was analyzed locally because Vertex AI is not configured.",
    `Average sentence estimate: about ${averageSentenceLength} words.`,
    "Use first-person protagonist narration.",
    "Open with immediate humiliation, wrong choice, betrayal, rebirth, divorce, status pressure, or proof pressure.",
    "Keep paragraphs short, direct, and voiceover friendly.",
    "Escalate every few paragraphs through a call, post, contract, public reaction, proof clue, enemy mistake, or regret crack.",
    "Transfer only rhythm and pressure. Do not copy any source plot, character names, locations, proof objects, or exact scenes."
  ].join("\n");
}

const globalPipelineLock = `
GLOBAL PIPELINE DRIFT PREVENTION

Locked facts stay locked. Once a role, character function, hidden card, proof object, antagonist plan, opening fingerprint, or final collapse logic is approved, later stages must not silently change it.

Competitor style affects pacing, paragraph rhythm, hook pressure, dialogue density, dopamine beat spacing, regret timing, and emotional intensity only. It must not change plot, names, proof objects, scene surfaces, power source, final collapse, or character roles.

Protagonist power source stays locked. Do not give sudden secret titles, hidden royal blood, random institutional rank, secret inheritance, or omnipotent shortcuts unless they were approved in Stage 00 or Stage 01.

Every stage must preserve the emotional engine: humiliation, wrong choice, clean break, hidden value, proof, regret, public face-slap, and emotional payoff. Mechanics are vehicles for emotion, not replacements for it.

Domain vocabulary must match the project. Do not import cyber terms into non-cyber stories, legal terms into non-legal stories, or fantasy system terms into grounded billionaire drama unless the premise requires it.
`;

const nicheContract = `
ENGLISH MANHWA DRAMA RECAP NICHE CONTRACT

This is not generic manhwa recap. It is long-form English drama built around humiliation, regret, rebirth, hidden value, status reversal, and emotional payoff.

The default voice is first-person protagonist POV. The protagonist is hurt but not pathetic, strategic but not robotic, and direct without literary bloat.

The story movement should feel like: humiliation -> wrong choice -> clean break -> hidden value -> small revenge -> enemy escalation -> regret crack -> bigger proof -> public face-slap -> emotional payoff.

Avoid generic overused surfaces unless the raw idea requires them: gala, red carpet, helicopter arrival, luxury-store card decline, generic billionaire party, generic boardroom, generic cafe, generic wedding betrayal, generic press conference.
`;

const finalScriptRules = `
FINAL SCRIPT WRITING RULES

Write only the requested part. Do not write future parts. Do not rewrite previous parts. Do not include analysis, plan labels, scene labels, markdown, tables, bullets, or handoff text.

The first line must be the requested part heading exactly, for example PART ONE.

Each part target: thirteen thousand three hundred to fourteen thousand five hundred characters including spaces. Hard minimum: twelve thousand eight hundred. Hard maximum: fifteen thousand.

Word target per part: about two thousand three hundred to two thousand six hundred words.

Paragraph rule: every normal narration paragraph must be twenty two to thirty six words and one hundred twenty to two hundred twenty characters including spaces. Short punch paragraphs are allowed only for hooks, refusals, public face-slaps, reversals, emotional snaps, and cliffhangers.

Write all numbers as words. Do not write digits. Do not use currency signs, percent signs, hashtags, slashes, plus signs, equals signs, arrows, emojis, decorative separators, or markdown.

Every few paragraphs must add a new useful beat: action, reaction, proof, clue, decision, status shift, public pressure, enemy mistake, regret movement, consequence, or payoff setup.

No water. No flowery metaphors. No repeated calm-smile filler. No generic paragraphs that only say the enemy underestimated the protagonist.
`;

function outputLanguageBlock(language?: string): string {
  return [
    `OUTPUT LANGUAGE: ${language || "English"}`,
    "Write all stage outputs, handoffs, titles, notes, and scripts in this language.",
    "If English is selected, use natural English manhwa drama recap phrasing and readable names."
  ].join("\n");
}

function buildReferenceBlock(styleBlueprint?: string, referenceGuard?: string): string {
  return `
REFERENCE STYLE BLUEPRINT
${styleBlueprint?.trim() || "No external blueprint provided. Use the built-in niche contract."}

REFERENCE GUARD
${referenceGuard?.trim() || "Do not copy competitor plots, names, scene surfaces, proof objects, exact dialogue, relationship setups, or final collapse mechanics."}
`;
}

function buildStagePrompt(req: StageRequest): { system: string; prompt: string; model: string; maxOutputTokens: number; temperature: number } {
  const stageId = Number(req.stageId ?? 0);
  const previous = req.previousHandoffs || {};
  const feedback = req.feedback?.trim()
    ? `\nUSER CORRECTIONS FOR THIS STAGE\n${req.feedback.trim()}\nYou must apply these corrections directly.\n`
    : "";
  const commonInput = `
${outputLanguageBlock(req.outputLanguage)}

NICHE PRESET
${req.presetLabel || "Drama Manga"}
${req.presetPromise || "Long-form English manhwa drama built on humiliation, regret, hidden value, and public payoff."}

RAW IDEA OR TITLE
${req.rawIdea || "No raw idea provided."}

${buildReferenceBlock(req.styleBlueprint, req.referenceGuard)}

${nicheContract}

${globalPipelineLock}

${feedback}
`;

  const exactTwoSections = `
FORMAT RULE
Return exactly two clearly marked sections:

### STAGE OUTPUT
Full producer-readable document for this stage.

### HANDOFF PACKAGE
Compact operational handoff for the next stage.

Do not return a table of contents only. Fill every requested section with useful concrete content.
`;

  if (stageId === 0) {
    return {
      system: "You are 00 IDEA SETUP, a raw idea developer for English manhwa drama YouTube scripts.",
      model: getStageModel(stageId),
      maxOutputTokens: 7000,
      temperature: 0.55,
      prompt: `
${commonInput}

TASK
Take the raw title or situation and develop it into a producer-ready story setup. Do not write the script, macro outline, or scene cards.

You must clarify:
- clean premise;
- core hook;
- clickable title direction;
- protagonist public identity and hidden value;
- emotional wound;
- antagonist or opposing force;
- betrayer if applicable;
- true ally direction if useful;
- hidden advantage;
- proof system;
- opening fingerprint;
- surfaces to avoid;
- final collapse promise;
- title and thumbnail package;
- originality risks.

STAGE OUTPUT SECTIONS
1. Raw Idea Cleanup
2. Core Hook
3. Developed Story DNA
4. Protagonist Setup
5. Antagonist Setup
6. Betrayer Setup if applicable
7. True Ally Direction
8. Three Opening Directions and Best Choice
9. Function vs Surface
10. Trope Mix
11. Proof System
12. Final Collapse Promise
13. Template Risk Check
14. Title, Thumbnail, First Thirty Seconds Package
15. Stage Zero Decision

HANDOFF PACKAGE MUST INCLUDE
clean premise, selected opening, strongest title, thumbnail text direction, first thirty seconds promise, story DNA, protagonist wound, antagonist false belief, betrayer false belief, hidden advantage, proof system, true ally direction, final collapse promise, surfaces to avoid, originality rule, and main risk for Stage One.

${exactTwoSections}
`
    };
  }

  if (stageId === 1) {
    return {
      system: "You are 01 FOUNDATION DNA, a story logic architect for long-form manhwa drama scripts.",
      model: getStageModel(stageId),
      maxOutputTokens: 9000,
      temperature: 0.5,
      prompt: `
${commonInput}

APPROVED STAGE ZERO CONTEXT
${previous["00_idea"] || "No Stage Zero handoff. Infer carefully from the raw idea and clearly mark inferred items."}

TASK
Turn the approved idea setup into locked story DNA. Do not write the script. Do not create the full nine-part outline. Do not make scene cards.

Build:
- character function lock;
- emotional chain;
- protagonist control logic;
- betrayer regret ladder;
- antagonist escalation ladder;
- hidden card schedule;
- proof system lock;
- face-slap variation map;
- pacing and retention notes;
- foundation risk check.

STAGE OUTPUT SECTIONS
1. Stage Zero Recap
2. Character Function Lock
3. Core Emotional Chain
4. Protagonist Control Logic
5. Betrayer Regret Ladder
6. Antagonist Escalation Ladder
7. Hidden Card Schedule
8. Proof System Lock
9. Face-Slap Variation Map
10. Pacing and Retention Notes
11. Foundation Risk Check
12. Stage One Final Decision

HANDOFF PACKAGE MUST INCLUDE
title package summary, story DNA, character functions, protagonist control logic, regret ladder, antagonist escalation ladder, true ally function, hidden cards, proof system, face-slap map, pacing notes, surfaces to avoid, main risks, and key rule for the outline or scene cards.

${exactTwoSections}
`
    };
  }

  if (stageId === 2) {
    return {
      system: "You are 02 MACRO OUTLINE, a nine-part master planner for long YouTube manhwa drama scripts.",
      model: getStageModel(stageId),
      maxOutputTokens: 12000,
      temperature: 0.48,
      prompt: `
${commonInput}

APPROVED FOUNDATION CONTEXT
${previous["01_foundation"] || "No Stage One handoff. Infer carefully from the raw idea and previous context."}

TASK
Create an optional but detailed nine-part master outline. This is a planning contract, not final prose.

The full final script target is one hundred twenty thousand to one hundred thirty thousand characters. Each part should later land around thirteen thousand three hundred to fourteen thousand five hundred characters.

Plan all nine parts with:
- target character range;
- estimated scene count;
- part function;
- start state;
- main conflict;
- protagonist movement;
- antagonist movement;
- betrayer movement;
- true ally movement;
- proof and hidden card movement;
- visible payoff;
- face-slap type;
- avatar slot if needed;
- cost or consequence;
- writing direction;
- ending hook.

STAGE OUTPUT SECTIONS
1. Foundation Recap
2. Final Script Length Plan
3. Writing Contract By Part
4. Nine-Part Overview
5. Detailed Part-By-Part Master Plan
6. Face-Slap Rhythm Map
7. Avatar Placement Plan
8. Public Payoff Map
9. Betrayer Regret Map
10. Antagonist Escalation Map
11. Protagonist Control Map
12. Hidden Card Map
13. Scene Card Requirements
14. Scene Surface Guidance
15. Pacing Risk Check
16. Stage Two Final Decision

HANDOFF PACKAGE MUST INCLUDE
nine-part outline summary, target character count per part, estimated scene count per part, part functions, face-slap map, avatar plan, payoff map, regret map, antagonist map, protagonist map, hidden card map, scene card requirements, surfaces to avoid, writing contract, and main risks for Stage Three.

${exactTwoSections}
`
    };
  }

  return {
    system: "You are 03 SCENE CARDS, the final structural planner before script writing.",
    model: getStageModel(3),
    maxOutputTokens: 14000,
    temperature: 0.45,
    prompt: `
${commonInput}

APPROVED CONTEXT
Stage One Foundation:
${previous["01_foundation"] || "No Stage One handoff."}

Stage Two Macro Outline, if used:
${previous["02_macro"] || "Macro outline was skipped or is not available. Build scene cards directly from Stage One while preserving the locked DNA."}

TASK
Create detailed but compact scene cards for all nine parts. This is the source of truth for the script writer. Do not write final prose. Do not add random plot logic.

Scene cards must support the final script contract:
- one hundred twenty thousand to one hundred thirty thousand characters total;
- each part around thirteen thousand three hundred to fourteen thousand five hundred characters;
- normal paragraphs one hundred twenty to two hundred twenty characters;
- first-person protagonist POV unless locked otherwise;
- exactly three avatar slots if enabled, normally parts three, six, and nine.

For each part, include part-level summary and then scene cards with:
- scene title;
- estimated final script length;
- surface;
- characters;
- purpose;
- conflict;
- action;
- proof or hidden card;
- visible payoff;
- status shift;
- regret or panic;
- protagonist control;
- true ally function;
- avatar use;
- exit hook;
- repetition risk.

STAGE OUTPUT SECTIONS
1. Approved Context Recap
2. Total Scene Strategy
3. Opening Surface Originality Check
4. Scene Surface Diversity Plan
5. Complete Scene Cards By Part
6. Face-Slap Distribution Check
7. Avatar Slot Check
8. Hidden Card Timing Check
9. Regret and Panic Track
10. Protagonist Control Track
11. Dialogue and Exposition Control
12. Final Script Readiness Check
13. Stage Three Final Decision

HANDOFF PACKAGE MUST INCLUDE
approved opening fingerprint, total scene count, scene count by part, full scene cards or compact scene references, target characters per part, face-slap distribution, avatar plan, proof objects, hidden card timing, regret and panic tracks, protagonist control, scene surface rules, dialogue warnings, final script writing contract, main risks for Stage Four, and key writing rule.

${exactTwoSections}
`
  };
}

function parseStageResponse(responseText: string): { output: string; handoff: string } {
  const outputMarker = "### STAGE OUTPUT";
  const handoffMarker = "### HANDOFF PACKAGE";
  const outputIdx = responseText.indexOf(outputMarker);
  const handoffIdx = responseText.indexOf(handoffMarker);

  if (outputIdx !== -1 && handoffIdx !== -1) {
    if (outputIdx < handoffIdx) {
      return {
        output: responseText.slice(outputIdx + outputMarker.length, handoffIdx).trim(),
        handoff: responseText.slice(handoffIdx + handoffMarker.length).trim()
      };
    }

    return {
      handoff: responseText.slice(handoffIdx + handoffMarker.length, outputIdx).trim(),
      output: responseText.slice(outputIdx + outputMarker.length).trim()
    };
  }

  return {
    output: responseText.trim(),
    handoff: "Handoff details are included inside the stage output. Review and edit before continuing."
  };
}

function sanitizeScriptOutput(text: string, partTitle: string): string {
  let clean = text
    .replace(/```(?:text|markdown)?/gi, "")
    .replace(/```/g, "")
    .replace(/###\s*SCRIPT_OUTPUT_START/gi, "")
    .replace(/###\s*MEMORY_START[\s\S]*$/gi, "")
    .trim();

  const titleIndex = clean.toUpperCase().indexOf(partTitle.toUpperCase());
  if (titleIndex > 0) {
    clean = clean.slice(titleIndex).trim();
  }

  if (!clean.toUpperCase().startsWith(partTitle.toUpperCase())) {
    clean = `${partTitle}\n\n${clean}`;
  }

  return clean.replace(/\n{3,}/g, "\n\n").trim();
}

function buildMemory(partTitle: string, output: string): string {
  const paragraphs = output
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && paragraph.toUpperCase() !== partTitle.toUpperCase());

  const opening = paragraphs.slice(0, 2).join(" ").slice(0, 500);
  const ending = paragraphs.slice(-2).join(" ").slice(0, 500);
  const words = output.trim() ? output.trim().split(/\s+/).length : 0;

  return [
    `${partTitle} completed.`,
    `Length: ${output.length} characters, ${words} words.`,
    opening ? `Opening continuity: ${opening}` : "",
    ending ? `Latest exit state: ${ending}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

app.get("/api/health", (_req, res) => {
  const useVertex = envFlag(process.env.GOOGLE_GENAI_USE_VERTEXAI);
  const hasTkbkKey = Boolean(process.env.TKBK_API_KEY);
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  res.json({
    status: "ok",
    hasTkbkKey,
    hasOfficialAnthropicKey: hasAnthropicKey,
    hasClaudeKey: hasTkbkKey || hasAnthropicKey,
    hasVertex: Boolean(useVertex && process.env.GOOGLE_CLOUD_PROJECT),
    claudeModel: getClaudeModel(),
    scriptWriterProvider: getScriptWriterProvider(),
    googleGenaiUseVertexAi: process.env.GOOGLE_GENAI_USE_VERTEXAI || "",
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || "",
    googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || "global",
    stageModels: {
      idea: DEFAULT_GEMINI_FAST_MODEL,
      foundation: DEFAULT_GEMINI_FAST_MODEL,
      macro: DEFAULT_GEMINI_PRO_MODEL,
      scenes: DEFAULT_GEMINI_PRO_MODEL,
      geminiWriter: DEFAULT_GEMINI_WRITER_MODEL,
      geminiWriterThinkingLevel: DEFAULT_GEMINI_WRITER_THINKING
    },
    time: new Date().toISOString()
  });
});

app.post("/api/analyze-reference", async (req, res) => {
  const { competitorScripts } = req.body as { competitorScripts?: string };

  if (!competitorScripts || !competitorScripts.trim()) {
    return res.status(400).json({ error: "Paste at least one competitor script first." });
  }

  const referenceGuard = buildReferenceGuard(competitorScripts);
  const sampledReferences = sampleReferenceText(competitorScripts);
  const system = [
    "You are a YouTube retention and style analyst.",
    "Extract reusable style mechanics from competitor scripts without retelling or copying their plots.",
    "Never output long source excerpts.",
    "The result becomes an internal style blueprint for original story planning and script writing."
  ].join(" ");

  const prompt = `
Analyze the competitor scripts below as style references only.

Do not retell their plots.
Do not copy wording.
Do not preserve character names.
Do not recommend copying scenes, settings, proof objects, twists, or endings.

Extract only reusable style mechanics:
- opening hook rhythm;
- first-person narration style;
- paragraph rhythm;
- sentence flow;
- humiliation setup;
- clean break timing;
- small payoff frequency;
- face-slap mechanics;
- regret timing;
- dialogue density;
- social proof surfaces;
- part-ending hook style;
- what this niche must avoid.

Return a compact operational blueprint with headings:
REFERENCE STYLE BLUEPRINT
HOOK RHYTHM
POV AND VOICE
PARAGRAPH AND SENTENCE RHYTHM
RETENTION BEAT FREQUENCY
DIALOGUE STYLE
REGRET TRACK
FACE-SLAP AND PROOF MECHANICS
ANTI-COPY GUARD
WRITER RULES

REFERENCE GUARD:
${referenceGuard}

COMPETITOR SCRIPT SAMPLES:
${sampledReferences}
`;

  try {
    const blueprint = await callVertexGemini({
      system,
      prompt,
      model: DEFAULT_GEMINI_FAST_MODEL,
      maxOutputTokens: 4500,
      temperature: 0.25,
      thinkingBudget: 1024
    });
    res.json({ blueprint, referenceGuard });
  } catch (err: any) {
    res.json({ blueprint: fallbackBlueprint(competitorScripts), referenceGuard, warning: err.message });
  }
});

app.post("/api/generate-stage", async (req, res) => {
  const body = req.body as StageRequest;
  const stageId = Number(body.stageId ?? 0);

  if (stageId < 0 || stageId > 3) {
    return res.status(400).json({ error: "Invalid stage ID. Use zero through three." });
  }

  if (!body.rawIdea?.trim() && stageId === 0) {
    return res.status(400).json({ error: "Raw idea or title is required for Stage Zero." });
  }

  const built = buildStagePrompt({ ...body, stageId });

  try {
    const responseText = await callVertexGemini({
      system: built.system,
      prompt: built.prompt,
      model: built.model,
      maxOutputTokens: built.maxOutputTokens,
      temperature: built.temperature,
      thinkingBudget: stageId >= 2 ? 4096 : 1024
    });
    res.json(parseStageResponse(responseText));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/generate-script-part", async (req, res) => {
  const {
    partNumber,
    partTitle,
    outputLanguage,
    presetLabel,
    presetPromise,
    styleBlueprint,
    referenceGuard,
    sceneCardsHandoff,
    previousPartsOutput,
    previousPartTail,
    avatarEnabled,
    feedback,
    provider,
    writerModel
  } = req.body as Record<string, any>;

  if (!partNumber || !partTitle) {
    return res.status(400).json({ error: "Missing part number or part title." });
  }

  if (!sceneCardsHandoff || !String(sceneCardsHandoff).trim()) {
    return res.status(400).json({ error: "Stage Three scene cards are required before writing." });
  }

  // Переключение провайдера для генерации сценария. Поддерживаем выбор между Vertex AI и Claude (tkbk API)
  const resolvedProvider = getScriptWriterProvider(provider);
  const normalizedPartTitle = String(partTitle).toUpperCase();
  const shouldAvatar = Boolean(avatarEnabled) && [3, 6, 9].includes(Number(partNumber));
  const previousContext = Array.isArray(previousPartsOutput) && previousPartsOutput.length
    ? previousPartsOutput.join("\n\n")
    : "No previous parts yet. This is the opening voice and style anchor.";

  const system = `
You are 04 FINAL SCRIPT, an elite long-form YouTube manhwa-style drama recap scriptwriter.
Your only job is to write the requested final script part.
You are not a supervisor. You do not analyze, explain, summarize, or redesign the plan.
Write first-person protagonist POV unless the approved scene cards explicitly require otherwise.
Output only plain text suitable to save directly as a .txt file.
`;

  const prompt = `
Write exactly this script part:

PART NUMBER:
${partNumber}

PART TITLE:
${normalizedPartTitle}

OUTPUT LANGUAGE:
${outputLanguage || "English"}

The first line of your response must be exactly:
${normalizedPartTitle}

After that first line, write only the final audience-facing narration for this part.

CURRENT PART LOCK
You are writing only ${normalizedPartTitle}.
Do not write any future part.
Do not rewrite previous parts.
Use only the Stage Three scene cards assigned to this part.
If previous text is provided, use it only for continuity and tone.

NICHE PRESET
${presetLabel || "Drama Manga"}
${presetPromise || ""}

${nicheContract}

STYLE BLUEPRINT
${styleBlueprint || "No extracted blueprint. Use the built-in English manhwa drama recap style."}

REFERENCE GUARD
${referenceGuard || "Do not copy competitor plot, names, locations, proof objects, exact dialogue, scene choreography, or final collapse mechanics."}

APPROVED STAGE THREE SCENE CARDS AND HANDOFF
${sceneCardsHandoff}

PREVIOUS PARTS AND MEMORY
${previousContext}

ENDING TAIL OF PREVIOUS PART
${previousPartTail || "No previous part tail."}

USER FEEDBACK FOR THIS PART
${feedback || "No extra feedback."}

${finalScriptRules}

AVATAR RULE
Avatar commentary enabled: ${avatarEnabled ? "YES" : "NO"}.
This part ${shouldAvatar ? "must include exactly one [AVATAR] block" : "must include zero [AVATAR] blocks"}.
If required, the [AVATAR] text must be three hundred to four hundred characters including spaces and must explain character psychology or status pressure without spoiling future reveals.

FINAL OUTPUT RULE
Output only the requested script part.
No preface.
No explanation.
No analysis.
No markdown.
No memory section.
Begin immediately with ${normalizedPartTitle}.
`;

  try {
    const raw = resolvedProvider === "vertex_gemini"
      ? await callVertexGemini({
          system,
          prompt,
          model: writerModel || DEFAULT_GEMINI_WRITER_MODEL,
          maxOutputTokens: 11000,
          temperature: 0.78,
          thinkingLevel: DEFAULT_GEMINI_WRITER_THINKING
        })
      : await callClaude({
          system,
          prompt,
          maxTokens: 9000,
          temperature: 0.82,
          model: writerModel || getClaudeModel()
        });

    const output = sanitizeScriptOutput(raw, normalizedPartTitle);
    res.json({
      output,
      memory: buildMemory(normalizedPartTitle, output),
      provider: resolvedProvider,
      model: resolvedProvider === "vertex_gemini" ? writerModel || DEFAULT_GEMINI_WRITER_MODEL : writerModel || getClaudeModel()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Drama Manga Forge V2 running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

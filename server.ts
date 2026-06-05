import dotenv from "dotenv";
import express from "express";
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
};

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function getClaudeModel(): string {
  return process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
}

function getScriptWriterProvider(): string {
  return process.env.SCRIPT_WRITER_PROVIDER || "anthropic";
}

async function callClaude({ system, prompt, maxTokens = 8192, temperature = 0.8 }: ClaudeCallOptions): Promise<string> {
  const provider = getScriptWriterProvider();
  if (provider !== "anthropic") {
    throw new Error(`Unsupported SCRIPT_WRITER_PROVIDER="${provider}". V2 currently supports "anthropic" for the final script writer.`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY. Put it in .env.local or deployment secrets.");
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: getClaudeModel(),
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
    const message = data?.error?.message || data?.message || `Claude API failed with ${response.status}`;
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
    "The",
    "This",
    "That",
    "Then",
    "When",
    "After",
    "Before",
    "Because",
    "But",
    "And",
    "His",
    "Her",
    "She",
    "He",
    "They",
    "You",
    "CEO",
    "Miss",
    "Mr",
    "Mom",
    "Dad",
    "Part",
    "Chapter"
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
      ? `Likely reference-specific names/labels to avoid copying into the new story: ${likelyNames.join(", ")}.`
      : "No repeated proper names were extracted, but all reference-specific names remain banned.",
    "When a reference has a useful function, transfer only the function. Example: public humiliation may transfer, but the exact gala, ring, hospital, contract, or family setup must not."
  ].join("\n");
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

function fallbackBlueprint(referenceScripts: string): string {
  const sample = sampleReferenceText(referenceScripts, 12000);
  const averageSentenceLength = Math.round(
    sample
      .split(/[.!?]+/)
      .map((sentence) => sentence.trim().split(/\s+/).filter(Boolean).length)
      .filter(Boolean)
      .reduce((sum, length, _, arr) => sum + length / arr.length, 0) || 18
  );

  return [
    "REFERENCE STYLE BLUEPRINT",
    "Source was analyzed locally because Claude API is not configured.",
    `Average sentence estimate: about ${averageSentenceLength} words.`,
    "Use first-person protagonist narration.",
    "Open with immediate humiliation, betrayal, wrong choice, death, divorce, or public status pressure.",
    "Keep paragraphs short, direct, and voiceover friendly.",
    "Escalate every few paragraphs through a call, post, contract, public reaction, proof clue, enemy mistake, or regret crack.",
    "Transfer only rhythm and pressure. Do not copy any source plot, character names, locations, proof objects, or exact scenes."
  ].join("\n");
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasClaudeKey: Boolean(process.env.ANTHROPIC_API_KEY),
    model: getClaudeModel(),
    scriptWriterProvider: getScriptWriterProvider(),
    googleGenaiUseVertexAi: process.env.GOOGLE_GENAI_USE_VERTEXAI || "",
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || "",
    googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || "",
    time: new Date().toISOString()
  });
});

app.post("/api/extract-style-blueprint", async (req, res) => {
  const { competitorScripts } = req.body as { competitorScripts?: string };

  if (!competitorScripts || !competitorScripts.trim()) {
    return res.status(400).json({ error: "Paste at least one competitor script first." });
  }

  const referenceGuard = buildReferenceGuard(competitorScripts);

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({
      blueprint: fallbackBlueprint(competitorScripts),
      referenceGuard
    });
  }

  const sampledReferences = sampleReferenceText(competitorScripts);
  const system = [
    "You are a YouTube retention and style analyst.",
    "You extract style mechanics from competitor scripts without retelling or copying their plots.",
    "Never output long source excerpts.",
    "Your result becomes a style blueprint for an original script writer."
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
- clean break / refusal timing;
- small payoff frequency;
- face-slap mechanics;
- regret timing;
- dialogue density;
- social proof surfaces;
- part-ending hook style;
- what this niche must avoid.

Return a compact but operational blueprint with headings:
REFERENCE STYLE BLUEPRINT
HOOK RHYTHM
POV AND VOICE
PARAGRAPH AND SENTENCE RHYTHM
RETENTION BEAT FREQUENCY
DIALOGUE STYLE
REGRET TRACK
FACE-SLAP AND PROOF MECHANICS
ANTI-COPY GUARD
WRITER RULES FOR CLAUDE

REFERENCE GUARD:
${referenceGuard}

COMPETITOR SCRIPT SAMPLES:
${sampledReferences}
`;

  try {
    const blueprint = await callClaude({ system, prompt, maxTokens: 3500, temperature: 0.25 });
    res.json({ blueprint, referenceGuard });
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
    storyDna,
    currentPartSceneCards,
    previousPartsMemory,
    previousPartTail,
    avatarEnabled
  } = req.body as Record<string, any>;

  if (!partNumber || !partTitle) {
    return res.status(400).json({ error: "Missing part number or part title." });
  }

  if (!storyDna || !String(storyDna).trim()) {
    return res.status(400).json({ error: "Story DNA is required before writing." });
  }

  if (!currentPartSceneCards || !String(currentPartSceneCards).trim()) {
    return res.status(400).json({ error: "Scene cards for this part are required." });
  }

  const system = `
You are an elite long-form YouTube manhwa-style drama recap scriptwriter.
Your only job is to write the requested final script part.
You are not a supervisor. You do not analyze, explain, summarize, or redesign the plan.
You write first-person protagonist POV in clean English manhwa drama recap style.
Output only plain text suitable to save directly as a .txt file.
`;

  const shouldAvatar = Boolean(avatarEnabled) && [3, 6, 9].includes(Number(partNumber));

  const prompt = `
Write exactly this script part:

PART NUMBER:
${partNumber}

PART TITLE:
${partTitle}

OUTPUT LANGUAGE:
${outputLanguage || "English"}

The first line of your response must be exactly:
${String(partTitle).toUpperCase()}

After that first line, write only the final audience-facing narration for this part.

CURRENT PART LOCK:
You are writing only ${partTitle}.
Do not write any future part.
Do not rewrite previous parts.
Use only the scene cards assigned to ${partTitle}.
If previous text is provided, use it only for continuity and tone.

NICHE PRESET:
${presetLabel || "Drama Manga"}
${presetPromise || ""}

STYLE CONTRACT:
Write in first-person protagonist POV.
Preserve the high-performing competitor style rhythm: immediate emotional pressure, direct narration, simple addictive sentence flow, sharp dialogue, clear injustice, visible status shifts, slow regret, frequent small payoffs, and no literary bloat.

The story movement should feel like:
humiliation -> wrong choice -> clean break -> hidden value -> small revenge -> enemy escalation -> regret crack -> bigger proof -> public face-slap -> emotional payoff.

COMPETITOR STYLE BLUEPRINT:
${styleBlueprint || "No extracted blueprint. Use the built-in English manhwa drama recap style."}

REFERENCE GUARD:
${referenceGuard || "Do not copy competitor plot, names, locations, proof objects, exact dialogue, scene choreography, or final collapse mechanics."}

APPROVED STORY DNA:
${storyDna}

APPROVED SCENE CARDS FOR THIS PART:
${currentPartSceneCards}

CONTINUITY MEMORY FROM PREVIOUS PARTS:
${previousPartsMemory || "No previous parts yet."}

ENDING TAIL OF PREVIOUS PART:
${previousPartTail || "No previous part tail."}

LENGTH CONTRACT:
Write ${partTitle} between thirteen thousand three hundred and fourteen thousand five hundred characters including spaces.
Do not finish under twelve thousand eight hundred characters.
Do not exceed fifteen thousand characters.
Aim for about two thousand three hundred to two thousand six hundred words.

PARAGRAPH RULE:
Every normal narration paragraph must be twenty two to thirty six words.
Every normal narration paragraph must be between one hundred twenty and two hundred twenty characters including spaces.
Short punch paragraphs are allowed only for a hook, refusal, reversal, humiliation, emotional snap, or cliffhanger.
Do not make the whole script a stack of tiny paragraphs.
Do not create huge paragraphs.

VOICEOVER CLEAN TEXT:
Write all numbers as words.
Do not write digits.
Do not use markdown.
Do not use bullet points.
Do not use tables.
Do not include labels such as Scene, Beat, Stage, Outline, Analysis, or Handoff.

AVATAR RULE:
Avatar commentary enabled: ${avatarEnabled ? "YES" : "NO"}.
This part ${shouldAvatar ? "must include exactly one [AVATAR] block" : "must include zero [AVATAR] blocks"}.
If required, the [AVATAR] text must be three hundred to four hundred characters including spaces and must explain character psychology or status pressure without spoiling future reveals.

FINAL OUTPUT RULE:
Output only the requested script part.
No preface.
No explanation.
No analysis.
No markdown.
No memory section.
Begin immediately with ${String(partTitle).toUpperCase()}.
`;

  try {
    const raw = await callClaude({ system, prompt, maxTokens: 9000, temperature: 0.82 });
    const output = sanitizeScriptOutput(raw, String(partTitle).toUpperCase());
    res.json({
      output,
      memory: buildMemory(String(partTitle).toUpperCase(), output)
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

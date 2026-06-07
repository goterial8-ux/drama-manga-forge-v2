import { CheckIssue, PARAGRAPH_RULE, PART_TARGET } from "../types";

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function getParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function getMetrics(text: string) {
  const paragraphs = getParagraphs(text);
  return {
    chars: text.length,
    words: countWords(text),
    paragraphs: paragraphs.length,
    averageParagraphWords:
      paragraphs.length > 0
        ? Math.round(paragraphs.reduce((sum, p) => sum + countWords(p), 0) / paragraphs.length)
        : 0
  };
}

export function validatePart(text: string, partTitle: string, partNumber: number, avatarEnabled: boolean): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const clean = text.trim();

  if (!clean) {
    return [{ severity: "error", message: "Part is empty." }];
  }

  if (!clean.startsWith(partTitle)) {
    issues.push({ severity: "error", message: `First line must be exactly ${partTitle}.` });
  }

  if (clean.length < PART_TARGET.min) {
    issues.push({
      severity: "error",
      message: `Too short: ${clean.length.toLocaleString()} chars. Minimum is ${PART_TARGET.min.toLocaleString()}.`
    });
  } else if (clean.length < PART_TARGET.idealMin) {
    issues.push({
      severity: "warning",
      message: `Below ideal range: ${clean.length.toLocaleString()} chars. Ideal starts at ${PART_TARGET.idealMin.toLocaleString()}.`
    });
  } else if (clean.length > PART_TARGET.max) {
    issues.push({
      severity: "error",
      message: `Too long: ${clean.length.toLocaleString()} chars. Maximum is ${PART_TARGET.max.toLocaleString()}.`
    });
  } else if (clean.length > PART_TARGET.idealMax) {
    issues.push({
      severity: "warning",
      message: `Above ideal range: ${clean.length.toLocaleString()} chars. Ideal ends at ${PART_TARGET.idealMax.toLocaleString()}.`
    });
  } else {
    issues.push({ severity: "ok", message: "Part length is inside the ideal character range." });
  }

  const totalWords = countWords(clean);
  if (totalWords < PART_TARGET.wordMin) {
    issues.push({
      severity: "warning",
      message: `Below word target: ${totalWords.toLocaleString()} words. Target starts at ${PART_TARGET.wordMin.toLocaleString()}.`
    });
  } else if (totalWords > PART_TARGET.wordMax) {
    issues.push({
      severity: "warning",
      message: `Above word target: ${totalWords.toLocaleString()} words. Target ends at ${PART_TARGET.wordMax.toLocaleString()}.`
    });
  } else {
    issues.push({ severity: "ok", message: "Part word count is inside the target range." });
  }

  if (/\d/.test(clean)) {
    issues.push({ severity: "error", message: "Digits detected. Voiceover text must write all numbers as words." });
  }

  const forbiddenMarkers = [
    "###",
    "SCRIPT_OUTPUT_START",
    "MEMORY_START",
    "STAGE OUTPUT",
    "HANDOFF PACKAGE",
    "Scene Card",
    "Analysis:",
    "Outline:"
  ];

  forbiddenMarkers.forEach((marker) => {
    if (clean.toLowerCase().includes(marker.toLowerCase())) {
      issues.push({ severity: "error", message: `Forbidden production marker detected: ${marker}.` });
    }
  });

  const avatarCount = (clean.match(/\[AVATAR\]/g) || []).length;
  const shouldHaveAvatar = avatarEnabled && [3, 6, 9].includes(partNumber);

  if (shouldHaveAvatar && avatarCount !== 1) {
    issues.push({ severity: "error", message: "This part must contain exactly one [AVATAR] block." });
  }

  if (!shouldHaveAvatar && avatarCount !== 0) {
    issues.push({ severity: "error", message: "This part must contain zero [AVATAR] blocks." });
  }

  const paragraphs = getParagraphs(clean).filter((paragraph) => paragraph !== partTitle && !paragraph.startsWith("[AVATAR]"));
  let shortNormal = 0;
  let longNormal = 0;
  let wordRangeProblems = 0;

  paragraphs.forEach((paragraph) => {
    const words = countWords(paragraph);
    const isPunch = words >= PARAGRAPH_RULE.punchMinWords && words <= PARAGRAPH_RULE.punchMaxWords;
    if (isPunch) return;

    if (paragraph.length < PARAGRAPH_RULE.minChars) shortNormal += 1;
    if (paragraph.length > PARAGRAPH_RULE.maxChars) longNormal += 1;
    if (words < PARAGRAPH_RULE.minWords || words > PARAGRAPH_RULE.maxWords) wordRangeProblems += 1;
  });

  if (shortNormal > 0) {
    issues.push({ severity: "warning", message: `${shortNormal} normal paragraphs are under ${PARAGRAPH_RULE.minChars} chars.` });
  }

  if (longNormal > 0) {
    issues.push({ severity: "warning", message: `${longNormal} normal paragraphs are over ${PARAGRAPH_RULE.maxChars} chars.` });
  }

  if (wordRangeProblems > 0) {
    issues.push({
      severity: "warning",
      message: `${wordRangeProblems} paragraphs are outside the ${PARAGRAPH_RULE.minWords}-${PARAGRAPH_RULE.maxWords} word rule.`
    });
  }

  if (!issues.some((issue) => issue.severity === "error" || issue.severity === "warning")) {
    issues.push({ severity: "ok", message: "No structural issues detected." });
  }

  return issues;
}

export function buildMemoryFromPart(partTitle: string, text: string): string {
  const paragraphs = getParagraphs(text).filter((paragraph) => paragraph !== partTitle);
  const first = paragraphs.slice(0, 2).join(" ");
  const last = paragraphs.slice(-2).join(" ");
  return [
    `${partTitle} drafted.`,
    `Length: ${text.length.toLocaleString()} characters, ${countWords(text).toLocaleString()} words.`,
    first ? `Opening continuity: ${first.slice(0, 500)}` : "",
    last ? `Exit hook / latest state: ${last.slice(0, 500)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function extractPartSceneCards(sceneCards: string, partTitle: string): string {
  if (!sceneCards.trim()) return "";
  const escaped = partTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const partPattern = new RegExp(
    `(^|\\n)\\s*${escaped}\\s*(?:\\n|$)([\\s\\S]*?)(?=\\n\\s*PART\\s+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)\\s*(?:\\n|$)|$)`,
    "i"
  );
  const match = sceneCards.match(partPattern);
  return match ? `${partTitle}\n${match[2].trim()}` : sceneCards;
}

export function getPreviousTail(text: string, maxChars = 800): string {
  const clean = text.trim();
  return clean.length > maxChars ? clean.slice(-maxChars) : clean;
}

export function getLastNonEmptyLine(text: string): string {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[lines.length - 1] || "";
}

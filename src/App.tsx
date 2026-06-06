import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  Copy,
  Download,
  FileText,
  Gauge,
  Layers,
  Library,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  WandSparkles
} from "lucide-react";
import { CORE_NICHE_BIBLE, COMPETITOR_STYLE_RULE } from "./lib/styleBible";
import {
  buildMemoryFromPart,
  getMetrics,
  getPreviousTail,
  validatePart
} from "./lib/validation";
import {
  ForgeState,
  INITIAL_STATE,
  PARAGRAPH_RULE,
  PART_TARGET,
  PARTS,
  PRESETS,
  ScriptPart,
  ScriptWriterProvider,
  StageData,
  StageKey,
  STAGES_CONFIG
} from "./types";

const STORAGE_KEY = "drama_manga_forge_v2_state";

const CLAUDE_WRITER_MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" }
];

const GEMINI_WRITER_MODELS = [
  { value: "gemini-3.1-pro-preview", label: "Vertex Gemini 3.1 Pro Preview High" }
];

const PART_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];

type Health = {
  hasClaudeKey: boolean;
  hasTkbkKey?: boolean;
  hasVertex: boolean;
  claudeModel: string;
  scriptWriterProvider?: ScriptWriterProvider;
  googleCloudLocation?: string;
  stageModels?: Record<string, string>;
};

function hydrateState(parsed: Partial<ForgeState>): ForgeState {
  const stages = { ...INITIAL_STATE.stages };
  STAGES_CONFIG.forEach((stage) => {
    stages[stage.key] = {
      ...INITIAL_STATE.stages[stage.key],
      ...(parsed.stages?.[stage.key] || {})
    } as StageData;
  });

  return {
    ...INITIAL_STATE,
    ...parsed,
    stages,
    outputLanguage: parsed.outputLanguage || "Russian",
    stageOutputLanguage: parsed.stageOutputLanguage || "Russian",
    scriptOutputLanguage: parsed.scriptOutputLanguage || "English",
    scriptWriterProvider: parsed.scriptWriterProvider || "anthropic",
    scriptWriterClaudeModel: parsed.scriptWriterClaudeModel || INITIAL_STATE.scriptWriterClaudeModel,
    scriptWriterGeminiModel: parsed.scriptWriterGeminiModel || INITIAL_STATE.scriptWriterGeminiModel,
    parts: INITIAL_STATE.parts.map((basePart) => {
      const existing = parsed.parts?.find((part) => part.number === basePart.number);
      return existing ? { ...basePart, ...existing, checks: existing.checks || [] } : basePart;
    })
  };
}

function loadInitialState(): ForgeState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return INITIAL_STATE;
    return hydrateState(JSON.parse(saved) as Partial<ForgeState>);
  } catch {
    return INITIAL_STATE;
  }
}

function downloadTxt(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function selectedPreset(state: ForgeState) {
  return PRESETS.find((preset) => preset.key === state.preset) || PRESETS[0];
}

function stageStatusLabel(status: StageData["status"]) {
  if (status === "not_started") return "empty";
  return status.replace("_", " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPartAliases(partNumber: number, partTitle: string) {
  const word = PART_WORDS[partNumber - 1] || String(partNumber);
  return [partTitle, `Part ${word}`, `PART ${word}`, `Part ${partNumber}`, `PART ${partNumber}`, `${partNumber}.`];
}

function findPartMarker(text: string, aliases: string[], fromIndex = 0) {
  const slice = text.slice(fromIndex);
  const candidates = aliases
    .map((alias) => {
      const pattern = new RegExp(`(^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\d+\\.\\s*)?${escapeRegExp(alias)}\\b`, "i");
      const match = pattern.exec(slice);
      return match ? fromIndex + match.index + match[0].length - alias.length : -1;
    })
    .filter((index) => index >= 0);

  return candidates.length ? Math.min(...candidates) : -1;
}

function extractFocusedPartContext(text: string, partNumber: number, partTitle: string, maxChars = 28000) {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return "";

  const start = findPartMarker(clean, buildPartAliases(partNumber, partTitle));
  if (start < 0) return clean.slice(0, maxChars);

  const otherStarts = PARTS
    .filter((part) => part.number !== partNumber)
    .map((part) => findPartMarker(clean, buildPartAliases(part.number, part.title), start + 1))
    .filter((index) => index > start)
    .sort((a, b) => a - b);

  const end = otherStarts[0] || clean.length;
  return clean.slice(start, end).trim().slice(0, maxChars);
}

export default function App() {
  const [state, setState] = useState<ForgeState>(loadInitialState);
  const [health, setHealth] = useState<Health>({ hasClaudeKey: false, hasVertex: false, claudeModel: "claude-sonnet-4-6" });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingStage, setIsGeneratingStage] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [isAutoWriting, setIsAutoWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = selectedPreset(state);
  const activeStageConfig = STAGES_CONFIG[state.activeStageIdx] || STAGES_CONFIG[0];
  const activeStageData = state.stages[activeStageConfig.key];
  const activePart = state.parts.find((part) => part.number === state.selectedPart) || state.parts[0];
  const activeMetrics = getMetrics(activePart.output);
  const hasClaudeWriterKey = Boolean(health.hasClaudeKey || health.hasTkbkKey);
  const selectedWriterModel = state.scriptWriterProvider === "vertex_gemini" ? state.scriptWriterGeminiModel : state.scriptWriterClaudeModel;
  const selectedWriterModelLabel =
    [...CLAUDE_WRITER_MODELS, ...GEMINI_WRITER_MODELS].find((item) => item.value === selectedWriterModel)?.label || selectedWriterModel;
  const combinedScript = useMemo(
    () => state.parts.map((part) => part.output.trim()).filter(Boolean).join("\n\n"),
    [state.parts]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) =>
        setHealth({
          hasClaudeKey: Boolean(data.hasClaudeKey),
          hasTkbkKey: Boolean(data.hasTkbkKey),
          hasVertex: data.hasVertex,
          claudeModel: data.claudeModel || "claude-sonnet-4-6",
          scriptWriterProvider: data.scriptWriterProvider,
          googleCloudLocation: data.googleCloudLocation,
          stageModels: data.stageModels
        })
      )
      .catch(() => setHealth({ hasClaudeKey: false, hasVertex: false, claudeModel: "unknown" }));
  }, []);

  const updateState = (patch: Partial<ForgeState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const updateStage = (stageKey: StageKey, patch: Partial<StageData>) => {
    setState((prev) => ({
      ...prev,
      stages: {
        ...prev.stages,
        [stageKey]: {
          ...prev.stages[stageKey],
          ...patch
        }
      }
    }));
  };

  const updatePart = (partNumber: number, patch: Partial<ScriptPart>) => {
    setState((prev) => ({
      ...prev,
      parts: prev.parts.map((part) => (part.number === partNumber ? { ...part, ...patch } : part))
    }));
  };

  const buildPreviousHandoffs = () => {
    const previousHandoffs: Record<string, string> = {};
    STAGES_CONFIG.forEach((stage) => {
      if (stage.id < activeStageConfig.id) {
        const data = state.stages[stage.key];
        if (data.output || data.handoff) {
          previousHandoffs[stage.key] = `[${stage.code} ${stage.name} OUTPUT]\n${data.output}\n\n[${stage.code} ${stage.name} HANDOFF]\n${data.handoff}`;
        }
      }
    });
    return previousHandoffs;
  };

  const extractStyleBlueprint = async () => {
    setIsExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorScripts: state.competitorScripts,
          outputLanguage: state.stageOutputLanguage
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to extract style blueprint.");
      updateState({
        styleBlueprint: data.blueprint,
        referenceGuard: data.referenceGuard,
        notes: data.warning ? `Style blueprint fallback used: ${data.warning}` : "Competitor scripts converted into style blueprint and anti-copy guard."
      });
    } catch (err: any) {
      setError(err.message || "Could not extract style blueprint.");
    } finally {
      setIsExtracting(false);
    }
  };

  const generateActiveStage = async () => {
    setIsGeneratingStage(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId: activeStageConfig.id,
          rawIdea: state.rawIdea,
          presetLabel: preset.label,
          presetPromise: preset.promise,
          outputLanguage: state.stageOutputLanguage,
          styleBlueprint: state.styleBlueprint,
          referenceGuard: state.referenceGuard,
          previousHandoffs: buildPreviousHandoffs(),
          feedback: activeStageData.feedback
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to generate stage.");
      updateStage(activeStageConfig.key, {
        output: data.output,
        handoff: data.handoff,
        status: "draft"
      });
      updateState({ notes: `${activeStageConfig.code} ${activeStageConfig.name} drafted. Review, edit, and approve before the next stage.` });
    } catch (err: any) {
      setError(err.message || "Could not generate stage.");
    } finally {
      setIsGeneratingStage(false);
    }
  };

  const approveActiveStage = () => {
    updateStage(activeStageConfig.key, { status: "approved" });
    updateState({ notes: `${activeStageConfig.code} ${activeStageConfig.name} approved.` });
  };

  const skipMacroOutline = () => {
    updateStage("02_macro", {
      output: "Macro outline intentionally skipped.",
      handoff: "Use Stage One Foundation DNA directly for Stage Three Scene Cards. Preserve all locked roles, proof logic, hidden cards, and final collapse.",
      status: "approved"
    });
    updateState({ activeStageIdx: 3, notes: "Macro outline skipped. Generate Scene Cards from Foundation DNA." });
  };

  const nextStage = () => {
    updateState({ activeStageIdx: Math.min(STAGES_CONFIG.length - 1, state.activeStageIdx + 1) });
  };

  const copyStageHandoff = async () => {
    await navigator.clipboard.writeText(activeStageData.handoff || "");
    updateState({ notes: "Handoff copied." });
  };

  const buildPartRequest = (partToWrite: ScriptPart, workingParts: ScriptPart[]) => {
    const stageTwo = state.stages["02_macro"];
    const stageThree = state.stages["03_scenes"];
    const partPlanContext = extractFocusedPartContext(
      `[STAGE TWO MACRO OUTLINE OUTPUT]\n${stageTwo.output}\n\n[STAGE TWO HANDOFF]\n${stageTwo.handoff}`,
      partToWrite.number,
      partToWrite.title
    );
    const partSceneContext = extractFocusedPartContext(
      `[STAGE THREE SCENE CARDS OUTPUT]\n${stageThree.output}\n\n[STAGE THREE HANDOFF]\n${stageThree.handoff}`,
      partToWrite.number,
      partToWrite.title
    );
    const previousParts = workingParts.filter((part) => part.number < partToWrite.number && part.output.trim());
    const previousPartsOutput = previousParts.map((part) => [
      `--- ${part.title} ---`,
      part.output,
      part.memory ? `[MEMORY]\n${part.memory}` : ""
    ].filter(Boolean).join("\n"));
    const previousPart = [...previousParts].reverse()[0];
    const writerModel = selectedWriterModel || (state.scriptWriterProvider === "vertex_gemini" ? "gemini-3.1-pro-preview" : health.claudeModel || "claude-sonnet-4-6");

    return {
      writerModel,
      body: {
        partNumber: partToWrite.number,
        partTitle: partToWrite.title,
        outputLanguage: state.scriptOutputLanguage,
        presetLabel: preset.label,
        presetPromise: preset.promise,
        styleBlueprint: state.styleBlueprint,
        referenceGuard: state.referenceGuard,
        sceneCardsHandoff: `[FULL STAGE THREE OUTPUT]\n${stageThree.output}\n\n[STAGE THREE HANDOFF]\n${stageThree.handoff}`,
        partPlanContext,
        partSceneContext,
        previousPartsOutput,
        previousPartTail: previousPart ? getPreviousTail(previousPart.output) : "",
        avatarEnabled: state.avatarEnabled,
        feedback: partToWrite.feedback,
        provider: state.scriptWriterProvider,
        writerModel
      }
    };
  };

  const writeScriptPart = async (partToWrite: ScriptPart, workingParts: ScriptPart[]) => {
    const { body, writerModel } = buildPartRequest(partToWrite, workingParts);
    const res = await fetch("/api/generate-script-part", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Failed to generate ${partToWrite.title}.`);

    const checks = validatePart(data.output, partToWrite.title, partToWrite.number, state.avatarEnabled);
    const updatedPart: ScriptPart = {
      ...partToWrite,
      output: data.output,
      memory: data.memory || buildMemoryFromPart(partToWrite.title, data.output),
      status: checks.some((issue) => issue.severity === "error") ? "needs_repair" : "draft",
      checks
    };

    return {
      updatedPart,
      provider: data.provider || state.scriptWriterProvider,
      model: data.model || writerModel
    };
  };

  const generateActivePart = async () => {
    setIsWriting(true);
    setError(null);

    try {
      const { updatedPart, provider, model } = await writeScriptPart(activePart, state.parts);
      updatePart(activePart.number, {
        output: updatedPart.output,
        memory: updatedPart.memory,
        status: updatedPart.status,
        checks: updatedPart.checks
      });
      updateState({ notes: `${activePart.title} written with ${provider} / ${model}.` });
    } catch (err: any) {
      setError(err.message || "Could not generate script part.");
    } finally {
      setIsWriting(false);
    }
  };

  const autoGenerateAllParts = async () => {
    if (!state.stages["03_scenes"].output.trim()) return;

    const hasExistingOutput = state.parts.some((part) => part.output.trim());
    if (hasExistingOutput && !window.confirm("Auto-generate all nine parts and overwrite existing drafts?")) return;

    setIsAutoWriting(true);
    setError(null);

    let workingParts = state.parts.map((part) => ({ ...part, output: "", memory: "", status: "empty" as const, checks: [] }));
    setState((prev) => ({
      ...prev,
      selectedPart: 1,
      parts: workingParts,
      notes: `Auto-generation started with ${selectedWriterModelLabel}.`
    }));

    try {
      for (const basePart of PARTS) {
        const partToWrite = workingParts.find((part) => part.number === basePart.number) || {
          ...basePart,
          output: "",
          memory: "",
          feedback: "",
          status: "empty" as const,
          checks: []
        };

        setState((prev) => ({
          ...prev,
          selectedPart: partToWrite.number,
          notes: `Auto-writing ${partToWrite.title} with ${selectedWriterModelLabel}.`
        }));

        const { updatedPart, provider, model } = await writeScriptPart(partToWrite, workingParts);
        workingParts = workingParts.map((part) => (part.number === updatedPart.number ? updatedPart : part));

        setState((prev) => ({
          ...prev,
          selectedPart: updatedPart.number,
          parts: prev.parts.map((part) => (part.number === updatedPart.number ? updatedPart : part)),
          notes: `${updatedPart.title} completed with ${provider} / ${model}.`
        }));
      }

      setState((prev) => ({
        ...prev,
        selectedPart: 9,
        notes: "Auto-generation completed for all nine parts."
      }));
    } catch (err: any) {
      setError(err.message || "Auto-generation stopped.");
      setState((prev) => ({
        ...prev,
        notes: "Auto-generation stopped. Review the last completed part before continuing."
      }));
    } finally {
      setIsAutoWriting(false);
    }
  };

  const checkActivePart = () => {
    const checks = validatePart(activePart.output, activePart.title, activePart.number, state.avatarEnabled);
    updatePart(activePart.number, {
      checks,
      memory: activePart.output ? buildMemoryFromPart(activePart.title, activePart.output) : "",
      status: checks.some((issue) => issue.severity === "error") ? "needs_repair" : "checked"
    });
  };

  const approveActivePart = () => {
    if (!activePart.output.trim()) return;
    updatePart(activePart.number, { status: "approved" });
  };

  const clearProject = () => {
    if (!window.confirm("Clear this V2 project state?")) return;
    setState(INITIAL_STATE);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Drama Manga Forge V2</p>
          <h1>Step-by-step niche pipeline with Claude or Vertex Gemini writer</h1>
        </div>
        <div className="status-row">
          <span className={health.hasVertex ? "pill ok" : "pill warn"}>{health.hasVertex ? "Vertex ready" : "Vertex missing"}</span>
          <span className={hasClaudeWriterKey ? "pill ok" : "pill warn"}>{hasClaudeWriterKey ? "Claude key loaded" : "Claude key missing"}</span>
          <span className="pill">Writer: {selectedWriterModelLabel}</span>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="workspace">
        <aside className="panel left-panel">
          <section className="block">
            <div className="block-title">
              <WandSparkles size={16} />
              Project Setup
            </div>
            <label>
              Niche preset
              <select value={state.preset} onChange={(e) => updateState({ preset: e.target.value as ForgeState["preset"] })}>
                {PRESETS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="preset-card">
              <strong>{preset.label}</strong>
              <p>{preset.promise}</p>
            </div>
            <label>
              Planning language
              <select
                value={state.stageOutputLanguage}
                onChange={(e) =>
                  updateState({
                    stageOutputLanguage: e.target.value as ForgeState["stageOutputLanguage"],
                    outputLanguage: e.target.value as ForgeState["outputLanguage"]
                  })
                }
              >
                <option value="Russian">Russian</option>
                <option value="English">English</option>
              </select>
            </label>
            <label>
              Script language
              <select
                value={state.scriptOutputLanguage}
                onChange={(e) => updateState({ scriptOutputLanguage: e.target.value as ForgeState["scriptOutputLanguage"] })}
              >
                <option value="English">English</option>
                <option value="Russian">Russian</option>
              </select>
            </label>
            <label>
              Raw title or idea
              <textarea
                value={state.rawIdea}
                onChange={(e) => updateState({ rawIdea: e.target.value })}
                placeholder="Paste the title, hook, or messy situation here."
                rows={8}
              />
            </label>
          </section>

          <section className="block">
            <div className="block-title">
              <Library size={16} />
              Competitor Style Library
            </div>
            <textarea
              value={state.competitorScripts}
              onChange={(e) => updateState({ competitorScripts: e.target.value })}
              placeholder="Paste competitor scripts. They become a style blueprint, not plot source."
              rows={13}
            />
            <button className="primary-button full" onClick={extractStyleBlueprint} disabled={isExtracting || !state.competitorScripts.trim()}>
              {isExtracting ? <RefreshCw className="spin" size={16} /> : <ShieldCheck size={16} />}
              Extract Style Blueprint
            </button>
          </section>
        </aside>

        <main className="main-panel">
          <section className="panel block">
            <div className="block-title">
              <Layers size={16} />
              Planning Pipeline
            </div>
            <div className="stage-tabs">
              {STAGES_CONFIG.map((stage) => {
                const data = state.stages[stage.key];
                return (
                  <button
                    key={stage.key}
                    className={stage.id === state.activeStageIdx ? "stage-tab active" : `stage-tab ${data.status}`}
                    onClick={() => updateState({ activeStageIdx: stage.id })}
                  >
                    <strong>{stage.code}</strong>
                    <span>{stage.name}</span>
                    <small>{stageStatusLabel(data.status)}</small>
                  </button>
                );
              })}
            </div>

            <div className="stage-head">
              <div>
                <h2>{activeStageConfig.code} {activeStageConfig.name}</h2>
                <p className="hint">{activeStageConfig.description}</p>
              </div>
              <div className="status-row">
                <span className="pill">{activeStageConfig.model}</span>
                {activeStageConfig.optional && <span className="pill warn">optional</span>}
              </div>
            </div>

            <label>
              Stage feedback
              <textarea
                value={activeStageData.feedback}
                onChange={(e) => updateStage(activeStageConfig.key, { feedback: e.target.value })}
                placeholder="Optional correction for this stage before generation."
                rows={3}
              />
            </label>

            <div className="stage-controls">
              <button className="primary-button" onClick={generateActiveStage} disabled={isGeneratingStage}>
                {isGeneratingStage ? <RefreshCw className="spin" size={16} /> : <Play size={16} />}
                Generate Stage
              </button>
              {activeStageConfig.key === "02_macro" && (
                <button className="secondary-button" onClick={skipMacroOutline} disabled={isGeneratingStage}>
                  Skip Macro
                </button>
              )}
              <button className="secondary-button" onClick={approveActiveStage} disabled={!activeStageData.output.trim()}>
                <Check size={16} />
                Approve Stage
              </button>
              <button className="secondary-button" onClick={nextStage} disabled={state.activeStageIdx >= STAGES_CONFIG.length - 1}>
                Next Stage
              </button>
              <button className="ghost-button" onClick={copyStageHandoff} disabled={!activeStageData.handoff.trim()}>
                <Copy size={16} />
                Copy Handoff
              </button>
            </div>

            <div className="grid-two">
              <label>
                Stage output
                <textarea
                  className="stage-textarea"
                  value={activeStageData.output}
                  onChange={(e) => updateStage(activeStageConfig.key, { output: e.target.value, status: "draft" })}
                  placeholder="Generated stage document appears here."
                  rows={16}
                />
              </label>
              <label>
                Handoff package
                <textarea
                  className="stage-textarea"
                  value={activeStageData.handoff}
                  onChange={(e) => updateStage(activeStageConfig.key, { handoff: e.target.value, status: "draft" })}
                  placeholder="Compact handoff for the next stage appears here."
                  rows={16}
                />
              </label>
            </div>
          </section>

          <section className="panel block writer-panel">
            <div className="writer-head">
              <div>
                <div className="block-title">
                  <FileText size={16} />
                  Stage Four Part Writer
                </div>
                <p className="hint">Scene Cards are the source of truth. The writer outputs one clean .txt part only.</p>
              </div>
              <div className="writer-actions">
                <label className="compact-label">
                  Writer provider
                  <select
                    value={state.scriptWriterProvider}
                    onChange={(e) => updateState({ scriptWriterProvider: e.target.value as ScriptWriterProvider })}
                    disabled={isWriting || isAutoWriting}
                  >
                    <option value="anthropic">Claude writer</option>
                    <option value="vertex_gemini">Vertex Gemini writer</option>
                  </select>
                </label>
                <label className="compact-label">
                  Writer model
                  <select
                    value={selectedWriterModel}
                    disabled={isWriting || isAutoWriting}
                    onChange={(e) =>
                      state.scriptWriterProvider === "vertex_gemini"
                        ? updateState({ scriptWriterGeminiModel: e.target.value })
                        : updateState({ scriptWriterClaudeModel: e.target.value })
                    }
                  >
                    {(state.scriptWriterProvider === "vertex_gemini" ? GEMINI_WRITER_MODELS : CLAUDE_WRITER_MODELS).map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="secondary-button" onClick={checkActivePart} disabled={isAutoWriting || !activePart.output}>
                  <Gauge size={16} />
                  Check Part
                </button>
                <button className="secondary-button" onClick={approveActivePart} disabled={isAutoWriting || !activePart.output}>
                  <Check size={16} />
                  Approve Part
                </button>
                <button
                  className="secondary-button"
                  onClick={() => downloadTxt(`${activePart.title.toLowerCase().replace(/\s+/g, "-")}.txt`, activePart.output)}
                  disabled={isAutoWriting || !activePart.output}
                >
                  <Download size={16} />
                  Part TXT
                </button>
                <button className="primary-button" onClick={generateActivePart} disabled={isWriting || isAutoWriting || !state.stages["03_scenes"].output.trim()}>
                  {isWriting ? <RefreshCw className="spin" size={16} /> : <Play size={16} />}
                  Generate {activePart.title}
                </button>
                <button className="secondary-button" onClick={autoGenerateAllParts} disabled={isWriting || isAutoWriting || !state.stages["03_scenes"].output.trim()}>
                  {isAutoWriting ? <RefreshCw className="spin" size={16} /> : <WandSparkles size={16} />}
                  Auto 1-9
                </button>
              </div>
            </div>

            <div className="part-tabs">
              {state.parts.map((part) => (
                <button
                  key={part.number}
                  className={part.number === state.selectedPart ? "part-tab active" : `part-tab ${part.status}`}
                  onClick={() => updateState({ selectedPart: part.number })}
                >
                  <span>{part.title.replace("PART ", "")}</span>
                  <small>{part.output ? `${Math.round(part.output.length / 100) / 10}k` : "0k"}</small>
                </button>
              ))}
            </div>

            <label>
              Part feedback
              <textarea
                value={activePart.feedback}
                onChange={(e) => updatePart(activePart.number, { feedback: e.target.value })}
                placeholder="Optional instruction for this part: more tension, stricter first person, fix ending hook, etc."
                rows={3}
              />
            </label>

            <textarea
              className="script-output"
              value={activePart.output}
              onChange={(e) =>
                updatePart(activePart.number, {
                  output: e.target.value,
                  status: "draft",
                  checks: []
                })
              }
              placeholder={`${activePart.title} will appear here as clean .txt voiceover script.`}
              rows={22}
            />

            <div className="metrics-row">
              <span>{activeMetrics.chars.toLocaleString()} chars</span>
              <span>{activeMetrics.words.toLocaleString()} words</span>
              <span>{activeMetrics.paragraphs.toLocaleString()} paragraphs</span>
              <span>{activeMetrics.averageParagraphWords} avg words per paragraph</span>
            </div>
          </section>
        </main>

        <aside className="panel right-panel">
          <section className="block">
            <div className="block-title">
              <Clipboard size={16} />
              Locked Rules
            </div>
            <div className="rule-list">
              <p>Stage Zero and One: {health.stageModels?.idea || "gemini-2.5-flash"}.</p>
              <p>Macro outline: Gemini 2.5 Pro, optional.</p>
              <p>Scene cards: Gemini 2.5 Pro.</p>
              <p>Writer switch: Claude model or Vertex Gemini model selected in Stage Four.</p>
              <p>Planning language: {state.stageOutputLanguage}.</p>
              <p>Script language: {state.scriptOutputLanguage}.</p>
              <p>Part target: {PART_TARGET.idealMin.toLocaleString()}-{PART_TARGET.idealMax.toLocaleString()} chars.</p>
              <p>Paragraph: {PARAGRAPH_RULE.minWords}-{PARAGRAPH_RULE.maxWords} words, {PARAGRAPH_RULE.minChars}-{PARAGRAPH_RULE.maxChars} chars.</p>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={state.avatarEnabled}
                onChange={(e) => updateState({ avatarEnabled: e.target.checked })}
              />
              Enable avatar commentary in parts three, six, and nine
            </label>
          </section>

          <section className="block">
            <div className="block-title">
              <Check size={16} />
              Part Checks
            </div>
            <div className="check-list">
              {activePart.checks.length === 0 ? (
                <p className="hint">No check run yet.</p>
              ) : (
                activePart.checks.map((issue, index) => (
                  <div key={`${issue.message}-${index}`} className={`check-item ${issue.severity}`}>
                    {issue.message}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="block">
            <div className="block-title">
              <Save size={16} />
              Export and Reset
            </div>
            <button
              className="secondary-button full"
              onClick={() => downloadTxt("full-drama-manga-script.txt", combinedScript)}
              disabled={!combinedScript}
            >
              <Download size={16} />
              Download Full Script
            </button>
            <button className="ghost-button full" onClick={clearProject}>
              <Trash2 size={16} />
              Clear Local Project
            </button>
          </section>

          <section className="block">
            <div className="block-title">Built-in Niche Bible</div>
            <pre className="small-pre">{CORE_NICHE_BIBLE}</pre>
            <pre className="small-pre">{COMPETITOR_STYLE_RULE}</pre>
          </section>
        </aside>
      </div>
    </div>
  );
}

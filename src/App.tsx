import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  Download,
  FileText,
  Gauge,
  Library,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  WandSparkles
} from "lucide-react";
import { CORE_NICHE_BIBLE, COMPETITOR_STYLE_RULE } from "./lib/styleBible";
import {
  buildMemoryFromPart,
  extractPartSceneCards,
  getMetrics,
  getPreviousTail,
  validatePart
} from "./lib/validation";
import { ForgeState, INITIAL_STATE, PARAGRAPH_RULE, PART_TARGET, PRESETS, ScriptPart } from "./types";

const STORAGE_KEY = "drama_manga_forge_v2_state";

type Health = {
  hasClaudeKey: boolean;
  model: string;
  scriptWriterProvider?: string;
};

function loadInitialState(): ForgeState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return INITIAL_STATE;
    const parsed = JSON.parse(saved) as ForgeState;
    return {
      ...INITIAL_STATE,
      ...parsed,
      parts: INITIAL_STATE.parts.map((basePart) => {
        const existing = parsed.parts?.find((part) => part.number === basePart.number);
        return existing ? { ...basePart, ...existing } : basePart;
      })
    };
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

export default function App() {
  const [state, setState] = useState<ForgeState>(loadInitialState);
  const [health, setHealth] = useState<Health>({ hasClaudeKey: false, model: "claude-sonnet-4-6" });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = selectedPreset(state);
  const activePart = state.parts.find((part) => part.number === state.selectedPart) || state.parts[0];
  const activeMetrics = getMetrics(activePart.output);
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
      .then((data) => setHealth({ hasClaudeKey: data.hasClaudeKey, model: data.model }))
      .catch(() => setHealth({ hasClaudeKey: false, model: "unknown" }));
  }, []);

  const updateState = (patch: Partial<ForgeState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const updatePart = (partNumber: number, patch: Partial<ScriptPart>) => {
    setState((prev) => ({
      ...prev,
      parts: prev.parts.map((part) => (part.number === partNumber ? { ...part, ...patch } : part))
    }));
  };

  const extractStyleBlueprint = async () => {
    setIsExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/extract-style-blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorScripts: state.competitorScripts })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to extract style blueprint.");
      updateState({
        styleBlueprint: data.blueprint,
        referenceGuard: data.referenceGuard,
        notes: "Competitor scripts were converted into a style blueprint and anti-copy guard."
      });
    } catch (err: any) {
      setError(err.message || "Could not extract style blueprint.");
    } finally {
      setIsExtracting(false);
    }
  };

  const generateActivePart = async () => {
    setIsWriting(true);
    setError(null);

    const previousParts = state.parts.filter((part) => part.number < activePart.number);
    const previousPartsMemory = previousParts.map((part) => part.memory).filter(Boolean).join("\n\n");
    const previousPart = [...previousParts].reverse().find((part) => part.output.trim());
    const currentPartSceneCards = extractPartSceneCards(state.sceneCards, activePart.title);

    try {
      const res = await fetch("/api/generate-script-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partNumber: activePart.number,
          partTitle: activePart.title,
          outputLanguage: state.outputLanguage,
          presetLabel: preset.label,
          presetPromise: preset.promise,
          styleBlueprint: state.styleBlueprint,
          referenceGuard: state.referenceGuard,
          storyDna: state.storyDna,
          currentPartSceneCards,
          previousPartsMemory,
          previousPartTail: previousPart ? getPreviousTail(previousPart.output) : "",
          avatarEnabled: state.avatarEnabled
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to generate script part.");
      const checks = validatePart(data.output, activePart.title, activePart.number, state.avatarEnabled);
      updatePart(activePart.number, {
        output: data.output,
        memory: data.memory || buildMemoryFromPart(activePart.title, data.output),
        status: checks.some((issue) => issue.severity === "error") ? "needs_repair" : "draft",
        checks
      });
    } catch (err: any) {
      setError(err.message || "Could not generate script part.");
    } finally {
      setIsWriting(false);
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

  const clearProject = () => {
    if (!window.confirm("Clear this V2 project state?")) return;
    setState(INITIAL_STATE);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Drama Manga Forge V2</p>
          <h1>Claude part writer for regret/rebirth manhwa scripts</h1>
        </div>
        <div className="status-row">
          <span className={health.hasClaudeKey ? "pill ok" : "pill warn"}>
            {health.hasClaudeKey ? "Claude key loaded" : "Claude key missing"}
          </span>
          <span className="pill">{health.model}</span>
          <span className="pill">{health.scriptWriterProvider || "anthropic"}</span>
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
              Raw idea
              <textarea
                value={state.rawIdea}
                onChange={(e) => updateState({ rawIdea: e.target.value })}
                placeholder="Paste the raw story idea here. Keep it messy if needed."
                rows={7}
              />
            </label>
          </section>

          <section className="block">
            <div className="block-title">
              <Library size={16} />
              Competitor Style Library
            </div>
            <p className="hint">
              Paste competitor scripts here. They are used only to extract rhythm, paragraph flow, hook pressure, and regret timing.
            </p>
            <textarea
              value={state.competitorScripts}
              onChange={(e) => updateState({ competitorScripts: e.target.value })}
              placeholder="Paste one or more competitor scripts. The writer will never receive them as plot source."
              rows={10}
            />
            <button className="primary-button" onClick={extractStyleBlueprint} disabled={isExtracting || !state.competitorScripts.trim()}>
              {isExtracting ? <RefreshCw className="spin" size={16} /> : <ShieldCheck size={16} />}
              Extract Style Blueprint
            </button>
          </section>
        </aside>

        <main className="main-panel">
          <section className="panel block">
            <div className="block-title">
              <ShieldCheck size={16} />
              Locked Style Blueprint
            </div>
            <div className="grid-two">
              <label>
                Style blueprint
                <textarea
                  value={state.styleBlueprint}
                  onChange={(e) => updateState({ styleBlueprint: e.target.value })}
                  placeholder="Extract from competitor scripts or paste a manual style blueprint."
                  rows={9}
                />
              </label>
              <label>
                Reference guard
                <textarea
                  value={state.referenceGuard}
                  onChange={(e) => updateState({ referenceGuard: e.target.value })}
                  placeholder="Anti-copy guard generated from references."
                  rows={9}
                />
              </label>
            </div>
          </section>

          <section className="panel block">
            <div className="block-title">
              <FileText size={16} />
              Story DNA and Scene Cards
            </div>
            <div className="grid-two">
              <label>
                Approved story DNA
                <textarea
                  value={state.storyDna}
                  onChange={(e) => updateState({ storyDna: e.target.value })}
                  placeholder="Lock the premise, protagonist wound, betrayal, hidden advantage, proof system, regret track, and final payoff."
                  rows={12}
                />
              </label>
              <label>
                Approved scene cards by part
                <textarea
                  value={state.sceneCards}
                  onChange={(e) => updateState({ sceneCards: e.target.value })}
                  placeholder={"Use headings like:\nPART ONE\n- Hook...\n- Scene...\n\nPART TWO\n- Scene..."}
                  rows={12}
                />
              </label>
            </div>
          </section>

          <section className="panel block writer-panel">
            <div className="writer-head">
              <div>
                <div className="block-title">
                  <Play size={16} />
                  Claude Part Writer
                </div>
                <p className="hint">Claude writes only the selected part, strictly from its scene cards.</p>
              </div>
              <div className="writer-actions">
                <button className="secondary-button" onClick={checkActivePart} disabled={!activePart.output}>
                  <Gauge size={16} />
                  Check Part
                </button>
                <button
                  className="secondary-button"
                  onClick={() => downloadTxt(`${activePart.title.toLowerCase().replace(/\s+/g, "-")}.txt`, activePart.output)}
                  disabled={!activePart.output}
                >
                  <Download size={16} />
                  Part TXT
                </button>
                <button className="primary-button" onClick={generateActivePart} disabled={isWriting}>
                  {isWriting ? <RefreshCw className="spin" size={16} /> : <Play size={16} />}
                  Generate {activePart.title}
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
              <p>Part target: {PART_TARGET.idealMin.toLocaleString()}-{PART_TARGET.idealMax.toLocaleString()} chars.</p>
              <p>Hard bounds: {PART_TARGET.min.toLocaleString()}-{PART_TARGET.max.toLocaleString()} chars.</p>
              <p>Normal paragraph: {PARAGRAPH_RULE.minWords}-{PARAGRAPH_RULE.maxWords} words.</p>
              <p>Normal paragraph chars: {PARAGRAPH_RULE.minChars}-{PARAGRAPH_RULE.maxChars} including spaces.</p>
              <p>Write only selected part. Output clean .txt text.</p>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={state.avatarEnabled}
                onChange={(e) => updateState({ avatarEnabled: e.target.checked })}
              />
              Enable three avatar commentary blocks in parts three, six, and nine
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

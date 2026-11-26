import React, { useState } from 'react';
import { Cpu, Download, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  AI_PERSONAS,
  AiEngineId,
  AiPersonaId,
  AiSettings,
  DEFAULT_AI_SETTINGS,
  LOCAL_AI_MODELS,
  NeuralModelStatus,
  OllamaStatus,
} from '../types/workspace';

interface AiSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AiSettings;
  onSaveSettings: (next: AiSettings) => void;
  selectedEngine: AiEngineId;
  onSelectEngine: (id: AiEngineId) => void;
  ollamaUrl: string;
  ollamaStatus: OllamaStatus;
  ollamaModels: string[];
  onChangeOllamaUrl: (url: string) => void;
  onCheckOllama: () => void;
  neuralStatus: NeuralModelStatus;
  neuralProgress: number;
  neuralStatusMessage: string;
  cachedModelIds: string[];
  onLoadNeuralModel: (id: AiEngineId) => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  open,
  onClose,
  settings,
  onSaveSettings,
  selectedEngine,
  onSelectEngine,
  ollamaUrl,
  ollamaStatus,
  ollamaModels,
  onChangeOllamaUrl,
  onCheckOllama,
  neuralStatus,
  neuralProgress,
  neuralStatusMessage,
  cachedModelIds,
  onLoadNeuralModel,
}) => {
  const [draft, setDraft] = useState<AiSettings>(settings);

  React.useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) return null;

  const activeSpec =
    LOCAL_AI_MODELS.find((m) => m.id === selectedEngine) ?? LOCAL_AI_MODELS[0];

  const handlePersonaChange = (personaId: AiPersonaId) => {
    const preset = AI_PERSONAS.find((p) => p.id === personaId);
    if (!preset) return;
    setDraft((prev) => ({
      ...prev,
      personaId,
      systemPrompt: preset.systemPrompt,
      temperature: preset.defaultTemperature,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-settings-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal
              className="w-4 h-4 text-teal-700 dark:text-teal-400"
              aria-hidden="true"
            />
            <h2
              id="ai-settings-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display"
            >
              AI Engine & Assistant Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI settings"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Model Runtime Section */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
              <span>Local Model Runtime</span>
            </h3>

            <div>
              <label
                htmlFor="modal-engine-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Active Engine
              </label>
              <select
                id="modal-engine-select"
                value={selectedEngine}
                onChange={(e) => onSelectEngine(e.target.value as AiEngineId)}
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                {LOCAL_AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {m.sizeLabel}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {activeSpec.description}
              </p>
            </div>

            {activeSpec.runtime === 'ollama' && (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-48">
                    <label
                      htmlFor="modal-ollama-url"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Local Ollama Endpoint
                    </label>
                    <input
                      id="modal-ollama-url"
                      type="url"
                      value={ollamaUrl}
                      onChange={(e) => onChangeOllamaUrl(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={ollamaStatus === 'checking'}
                    onClick={onCheckOllama}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    {ollamaStatus === 'checking' ? 'Checking...' : 'Connect Local'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="modal-ollama-model-tag"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Target Ollama Model Tag
                    </label>
                    {ollamaModels.length > 0 ? (
                      <select
                        id="modal-ollama-model-tag"
                        value={draft.customOllamaModel}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            customOllamaModel: e.target.value,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                      >
                        {ollamaModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="modal-ollama-model-tag"
                        type="text"
                        value={draft.customOllamaModel}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            customOllamaModel: e.target.value,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                      />
                    )}
                  </div>
                  <div className="flex items-end text-[11px] text-slate-500 dark:text-slate-400 pb-1.5">
                    {ollamaStatus === 'connected'
                      ? `Connected · ${ollamaModels.length} local model(s) detected`
                      : 'Run `ollama run qwen2.5-coder:7b` locally, then click Connect Local.'}
                  </div>
                </div>
              </div>
            )}

            {activeSpec.runtime === 'browser-llm' && (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  {neuralStatusMessage || activeSpec.description}
                </div>
                <button
                  type="button"
                  disabled={neuralStatus === 'loading' || neuralStatus === 'ready'}
                  onClick={() => onLoadNeuralModel(selectedEngine)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {neuralStatus === 'ready'
                      ? 'Model Ready Offline'
                      : neuralStatus === 'loading'
                      ? `Loading ${neuralProgress}%`
                      : cachedModelIds.includes(selectedEngine)
                      ? 'Load Cached Weights'
                      : 'Download & Cache Offline'}
                  </span>
                </button>
              </div>
            )}
          </section>

          {/* Persona Presets */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              AI Persona Preset
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AI_PERSONAS.map((preset) => {
                const selected = draft.personaId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePersonaChange(preset.id)}
                    className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-600 dark:border-teal-500'
                        : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {preset.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* System Prompt & Generation Parameters */}
          <section className="space-y-4">
            <div>
              <label
                htmlFor="modal-system-prompt"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                System Instructions
              </label>
              <textarea
                id="modal-system-prompt"
                rows={3}
                value={draft.systemPrompt}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, systemPrompt: e.target.value }))
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label
                    htmlFor="modal-temp-range"
                    className="font-medium text-slate-700 dark:text-slate-300"
                  >
                    Temperature
                  </label>
                  <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {draft.temperature.toFixed(2)}
                  </span>
                </div>
                <input
                  id="modal-temp-range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.temperature}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      temperature: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-teal-700"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>0.0 Precise</span>
                  <span>1.0 Creative</span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="modal-max-tokens"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Max Response Tokens
                </label>
                <select
                  id="modal-max-tokens"
                  value={draft.maxTokens}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      maxTokens: Number(e.target.value),
                    }))
                  }
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 tabular-nums"
                >
                  <option value={512}>512 tokens (Fast)</option>
                  <option value={1024}>1,024 tokens (Balanced)</option>
                  <option value={2048}>2,048 tokens (Long Code / Reports)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Footer Buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_AI_SETTINGS)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md cursor-pointer"
              >
                Save AI Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

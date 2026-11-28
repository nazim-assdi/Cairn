import React, { useState } from 'react';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  AI_PERSONAS,
  AiPersonaId,
  AiSettings,
  DEFAULT_AI_SETTINGS,
} from '../types/workspace';

interface AiSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AiSettings;
  onSaveSettings: (next: AiSettings) => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  open,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [draft, setDraft] = useState<AiSettings>(settings);

  React.useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open) return null;

  const handlePersonaChange = (personaId: AiPersonaId) => {
    const preset = AI_PERSONAS.find((item) => item.id === personaId);
    if (!preset) return;
    setDraft((previous) => ({
      ...previous,
      personaId,
      systemPrompt: preset.systemPrompt,
      temperature: preset.defaultTemperature,
    }));
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    onSaveSettings(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/75" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <div>
              <h2 id="ai-settings-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">Qwen 3B Assistant Settings</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">One offline model · automatic first-run download</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close AI settings" className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-6">
          <section className="rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/70 dark:bg-teal-950/30 p-3.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Qwen 2.5 Coder 3B · Q4 ONNX</div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">Cairn checks its local cache at startup. It downloads the model only when missing, then reconnects to the saved local copy on later launches.</p>
          </section>

          <section className="space-y-2.5">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Response Mode</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Fast gives concise replies; Thinking spends more tokens checking difficult problems.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { id: 'fast', label: 'Fast', detail: 'Quick replies · shortest output' },
                { id: 'balanced', label: 'Balanced', detail: 'More context · everyday use' },
                { id: 'thinking', label: 'Thinking', detail: 'Deeper analysis · slower' },
              ] as const).map((mode) => {
                const selected = (draft.responseMode ?? 'fast') === mode.id;
                return (
                  <button key={mode.id} type="button" aria-pressed={selected} onClick={() => setDraft((previous) => ({ ...previous, responseMode: mode.id }))} className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    selected ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-600 dark:border-teal-500' : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{mode.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{mode.detail}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Assistant Style</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AI_PERSONAS.map((preset) => {
                const selected = draft.personaId === preset.id;
                return (
                  <button key={preset.id} type="button" onClick={() => handlePersonaChange(preset.id)} className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    selected ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-600 dark:border-teal-500' : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{preset.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{preset.description}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <label htmlFor="modal-system-prompt" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">System Instructions</label>
              <textarea id="modal-system-prompt" rows={3} value={draft.systemPrompt} onChange={(event) => setDraft((previous) => ({ ...previous, systemPrompt: event.target.value }))} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:border-teal-700" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="modal-temp-range" className="font-medium text-slate-700 dark:text-slate-300">Temperature</label>
                  <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">{draft.temperature.toFixed(2)}</span>
                </div>
                <input id="modal-temp-range" type="range" min={0} max={1} step={0.05} value={draft.temperature} onChange={(event) => setDraft((previous) => ({ ...previous, temperature: Number(event.target.value) }))} className="w-full accent-teal-700" />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>0.0 Precise</span><span>1.0 Creative</span></div>
              </div>
              <div>
                <label htmlFor="modal-max-tokens" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Max Response Tokens</label>
                <select id="modal-max-tokens" value={draft.maxTokens} onChange={(event) => setDraft((previous) => ({ ...previous, maxTokens: Number(event.target.value) }))} className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 tabular-nums">
                  <option value={192}>192 tokens</option><option value={384}>384 tokens</option><option value={512}>512 tokens</option><option value={768}>768 tokens</option><option value={1024}>1,024 tokens</option><option value={1536}>1,536 tokens</option><option value={2048}>2,048 tokens</option>
                </select>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setDraft(DEFAULT_AI_SETTINGS)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /><span>Reset defaults</span></button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md cursor-pointer">Save Settings</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

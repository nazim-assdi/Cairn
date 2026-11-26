import React, { useRef } from 'react';
import { Menu, Moon, ShieldCheck, Sun, Upload } from 'lucide-react';
import { ThemeMode, WorkspaceTab } from '../types/workspace';

interface TopBarProps {
  activeTab: WorkspaceTab;
  activeSessionTitle?: string;
  selectedDocCount: number;
  totalDocCount: number;
  isUploading: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenMobileSidebar: () => void;
  onUploadFiles: (files: FileList | File[]) => void;
  onSelectTab: (tab: WorkspaceTab) => void;
}

const TAB_LABELS: Record<WorkspaceTab, string> = {
  chat: 'Analysis Chat',
  inspector: 'Document Inspector',
  media: 'Media Studio',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  activeSessionTitle,
  selectedDocCount,
  totalDocCount,
  isUploading,
  theme,
  onToggleTheme,
  onOpenMobileSidebar,
  onUploadFiles,
  onSelectTab,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const headingText =
    activeTab === 'chat' && activeSessionTitle
      ? activeSessionTitle
      : TAB_LABELS[activeTab];

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 h-14">
        {/* Left: Mobile toggle + Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label="Open document vault sidebar"
            className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-md"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:inline">
              Local Vault
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">
              /
            </span>
            <h1 className="font-semibold text-slate-900 dark:text-slate-100 truncate font-display">
              {headingText}
            </h1>
          </div>
        </div>

        {/* Right: Local privacy summary + Theme Toggle + Primary Upload CTA */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <span>
              On-device processing · {selectedDocCount}/{totalDocCount} active
            </span>
          </span>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="lg:hidden p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv"
            multiple
            className="sr-only"
            aria-label="Upload documents from header"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isUploading ? 'Processing...' : 'Upload Files'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Compact Tab Switcher */}
      <div className="flex lg:hidden border-t border-slate-100 dark:border-slate-800 px-3 py-1.5 gap-1">
        {(['chat', 'inspector', 'media'] as WorkspaceTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onSelectTab(tab)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {tab === 'chat' ? 'Chat' : tab === 'inspector' ? 'Inspector' : 'Media'}
          </button>
        ))}
      </div>
    </header>
  );
};

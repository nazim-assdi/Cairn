import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckSquare,
  FileText,
  Film,
  HardDrive,
  History,
  MessageSquare,
  Moon,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Square,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ChatSession,
  ThemeMode,
  VaultDocument,
  WorkspaceTab,
} from '../types/workspace';
import { formatBytes, formatTimestamp } from '../utils/formatters';

interface SidebarVaultProps {
  documents: VaultDocument[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeTab: WorkspaceTab;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onTogglePinSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onSelectTab: (tab: WorkspaceTab) => void;
  onUploadFiles: (files: FileList | File[]) => void;
  onToggleDocument: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteDocument: (id: string) => void;
  onInspectDocument: (id: string) => void;
  onRestoreSamples: () => void;
  onWipeVault: () => void;
  isUploading: boolean;
  mediaCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const SidebarVault: React.FC<SidebarVaultProps> = ({
  documents,
  sessions,
  activeSessionId,
  activeTab,
  theme,
  onToggleTheme,
  onNewChat,
  onSelectSession,
  onRenameSession,
  onTogglePinSession,
  onDeleteSession,
  onSelectTab,
  onUploadFiles,
  onToggleDocument,
  onSelectAll,
  onDeleteDocument,
  onInspectDocument,
  onRestoreSamples,
  onWipeVault,
  isUploading,
  mediaCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const selectedCount = documents.filter((d) => d.selected).length;
  const totalBytes = documents.reduce((sum, d) => sum + d.sizeBytes, 0);
  const totalChunks = documents.reduce((sum, d) => sum + d.chunkCount, 0);

  const filteredSessions = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const list = !q
      ? [...sessions]
      : sessions.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.messages.some((m) => m.content.toLowerCase().includes(q))
        );
    list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [sessions, historySearch]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  const commitRename = (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) {
      onRenameSession(id, trimmed);
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-72 select-none">
      {/* Brand Wordmark + Theme Toggle */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('chat');
            onCloseMobile();
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          Cairn
        </a>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
            }
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="lg:hidden p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Primary New Chat + Navigation */}
      <div className="px-3 pt-3 pb-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md transition-colors whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New Chat</span>
        </button>

        <nav aria-label="Workspace navigation" className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectTab('chat');
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Analysis Chat</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('inspector');
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'inspector'
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Document Inspector</span>
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
              {documents.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('media');
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'media'
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Film className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Media Studio</span>
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
              {mediaCount}
            </span>
          </button>
        </nav>
      </div>

      {/* Scrollable Middle: Chat History + Document Vault */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-3 py-3 space-y-5">
        {/* Chat History Section */}
        <section aria-label="Chat history" className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Chat History</span>
            </h2>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
              {sessions.length}
            </span>
          </div>

          {sessions.length > 2 && (
            <div className="relative px-1">
              <Search
                className="w-3 h-3 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <label htmlFor="chat-history-search" className="sr-only">
                Search chat history
              </label>
              <input
                id="chat-history-search"
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search threads..."
                className="w-full pl-7 pr-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-teal-700"
              />
            </div>
          )}

          <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5" data-testid="chat-history-list">
            {filteredSessions.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                {sessions.length === 0
                  ? 'Start a conversation to save local history.'
                  : 'No matching threads.'}
              </p>
            ) : (
              filteredSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const isEditing = editingSessionId === session.id;

                return (
                  <div
                    key={session.id}
                    className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-colors ${
                      isActive
                        ? 'bg-teal-50/70 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800/60'
                        : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitRename(session.id);
                        }}
                        className="flex-1 flex items-center gap-1 min-w-0"
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          autoFocus
                          aria-label="Rename conversation title"
                          className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-white dark:bg-slate-800 border border-teal-600 rounded text-slate-900 dark:text-slate-100 focus:outline-none"
                        />
                        <button
                          type="submit"
                          aria-label="Save thread title"
                          className="p-1 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded cursor-pointer"
                        >
                          <Check className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSession(session.id);
                            onCloseMobile();
                          }}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <div
                            className={`text-xs font-medium truncate flex items-center gap-1 ${
                              isActive
                                ? 'text-teal-900 dark:text-teal-200'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {session.pinned && (
                              <Pin
                                className="w-3 h-3 text-teal-700 dark:text-teal-400 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            <span className="truncate">{session.title}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums truncate">
                            {session.messages.length} msgs · {formatTimestamp(session.updatedAt)}
                          </div>
                        </button>

                        <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 shrink-0">
                          <button
                            type="button"
                            onClick={() => onTogglePinSession(session.id)}
                            aria-label={`${session.pinned ? 'Unpin' : 'Pin'} ${session.title}`}
                            className={`p-1 rounded cursor-pointer ${
                              session.pinned
                                ? 'text-teal-700 dark:text-teal-400'
                                : 'text-slate-400 hover:text-teal-700 dark:hover:text-teal-400'
                            }`}
                          >
                            <Pin className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSessionId(session.id);
                              setEditingTitle(session.title);
                            }}
                            aria-label={`Rename ${session.title}`}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSession(session.id)}
                            aria-label={`Delete conversation ${session.title}`}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Document Vault Section */}
        <section aria-label="Document vault" className="flex-1 flex flex-col min-h-0 space-y-2">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Document Vault
            </h2>
            {documents.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectAll(selectedCount < documents.length)}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 cursor-pointer whitespace-nowrap"
              >
                {selectedCount < documents.length ? 'Select all' : 'Clear all'}
              </button>
            )}
          </div>

          {/* Local Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-lg border border-dashed p-2.5 text-center transition-colors ${
              isDragging
                ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv"
              multiple
              className="sr-only"
              aria-label="Upload PDF, DOCX, or TXT files"
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
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer disabled:opacity-60"
            >
              <Upload className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
              <span className="font-medium">
                {isUploading ? 'Parsing locally...' : 'Add PDF, DOCX, TXT'}
              </span>
            </button>
          </div>

          {/* Document List */}
          <div className="space-y-1 pr-0.5" data-testid="document-list">
            {documents.length === 0 ? (
              <div className="px-2 py-4 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No documents in local storage.
                </p>
                <button
                  type="button"
                  onClick={onRestoreSamples}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 rounded-md cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Load Sample Files</span>
                </button>
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`group flex items-start gap-2 px-2 py-1.5 rounded-md border transition-colors ${
                    doc.selected
                      ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                      : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleDocument(doc.id)}
                    aria-label={`${doc.selected ? 'Deselect' : 'Select'} ${doc.name}`}
                    className="mt-0.5 text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 shrink-0 cursor-pointer"
                  >
                    {doc.selected ? (
                      <CheckSquare className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                    ) : (
                      <Square className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onInspectDocument(doc.id);
                      onCloseMobile();
                    }}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                      <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {doc.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums truncate">
                      <span className="uppercase">{doc.format}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{formatBytes(doc.sizeBytes)}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{doc.chunkCount} chunks</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteDocument(doc.id)}
                    aria-label={`Delete ${doc.name}`}
                    className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 opacity-80 group-hover:opacity-100 rounded transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Local Storage Summary Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-2 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 tabular-nums">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <span>IndexedDB</span>
          </span>
          <span>
            {formatBytes(totalBytes)} · {totalChunks} chunks
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onRestoreSamples}
            className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
          >
            Restore samples
          </button>
          <button
            type="button"
            onClick={onWipeVault}
            className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer whitespace-nowrap"
          >
            Purge local vault
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 h-full">{sidebarContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};

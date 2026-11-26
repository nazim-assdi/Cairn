import { SEED_DOCUMENTS } from '../data/seedDocuments';
import {
  ChatMessage,
  ChatSession,
  MediaArtifact,
  VaultDocument,
} from '../types/workspace';
import { chunkDocumentPages } from './edgeEngine';
import { deriveSessionTitle } from './markdownParser';

const DB_NAME = 'cairn_edge_vault_v1';
const DB_VERSION = 2;
const STORE_DOCS = 'documents';
const STORE_MESSAGES = 'messages';
const STORE_SESSIONS = 'sessions';
const STORE_MEDIA = 'media';
const SEED_FLAG = 'cairn_vault_seeded_v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function putIntoStore<T>(storeName: string, item: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback gracefully in restricted environments
  }
}

async function deleteFromStore(storeName: string, id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

async function clearStore(storeName: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export function buildSeedDocuments(): VaultDocument[] {
  return SEED_DOCUMENTS.map((seed) => {
    const chunks = chunkDocumentPages(seed.id, seed.name, seed.format, seed.pages);
    return {
      ...seed,
      chunkCount: chunks.length,
    };
  });
}

export async function loadVaultState(): Promise<{
  documents: VaultDocument[];
  sessions: ChatSession[];
  media: MediaArtifact[];
}> {
  let documents = await getAllFromStore<VaultDocument>(STORE_DOCS);
  const alreadySeeded =
    typeof localStorage !== 'undefined' && localStorage.getItem(SEED_FLAG) === 'true';

  if (documents.length === 0 && !alreadySeeded) {
    const seeded = buildSeedDocuments();
    for (const doc of seeded) {
      await putIntoStore(STORE_DOCS, doc);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SEED_FLAG, 'true');
    }
    documents = seeded;
  }

  documents.sort((a, b) => b.uploadedAt - a.uploadedAt);

  let sessions = await getAllFromStore<ChatSession>(STORE_SESSIONS);

  // Migrate legacy single-thread messages if sessions store is empty
  if (sessions.length === 0) {
    const legacyMessages = await getAllFromStore<ChatMessage>(STORE_MESSAGES);
    if (legacyMessages.length > 0) {
      legacyMessages.sort((a, b) => a.createdAt - b.createdAt);
      const firstUserMsg = legacyMessages.find((m) => m.role === 'user');
      const migrated: ChatSession = {
        id: `session-${legacyMessages[0].createdAt}`,
        title: deriveSessionTitle(firstUserMsg?.content || 'Restored conversation'),
        createdAt: legacyMessages[0].createdAt,
        updatedAt: legacyMessages[legacyMessages.length - 1].createdAt,
        messages: legacyMessages,
      };
      await putIntoStore(STORE_SESSIONS, migrated);
      await clearStore(STORE_MESSAGES);
      sessions = [migrated];
    }
  }

  sessions.sort((a, b) => b.updatedAt - a.updatedAt);

  const media = await getAllFromStore<MediaArtifact>(STORE_MEDIA);
  media.sort((a, b) => b.createdAt - a.createdAt);

  return { documents, sessions, media };
}

export async function saveDocumentToVault(doc: VaultDocument): Promise<void> {
  await putIntoStore(STORE_DOCS, doc);
}

export async function deleteDocumentFromVault(id: string): Promise<void> {
  await deleteFromStore(STORE_DOCS, id);
}

export async function saveSessionToVault(session: ChatSession): Promise<void> {
  await putIntoStore(STORE_SESSIONS, session);
}

export async function deleteSessionFromVault(id: string): Promise<void> {
  await deleteFromStore(STORE_SESSIONS, id);
}

export async function clearSessionsFromVault(): Promise<void> {
  await clearStore(STORE_SESSIONS);
  await clearStore(STORE_MESSAGES);
}

export async function saveMediaToVault(artifact: MediaArtifact): Promise<void> {
  await putIntoStore(STORE_MEDIA, artifact);
}

export async function deleteMediaFromVault(id: string): Promise<void> {
  await deleteFromStore(STORE_MEDIA, id);
}

export async function restoreSampleDocuments(): Promise<VaultDocument[]> {
  const seeded = buildSeedDocuments();
  for (const doc of seeded) {
    await putIntoStore(STORE_DOCS, doc);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SEED_FLAG, 'true');
  }
  return seeded;
}

export async function wipeEntireVault(): Promise<void> {
  await clearStore(STORE_DOCS);
  await clearStore(STORE_MESSAGES);
  await clearStore(STORE_SESSIONS);
  await clearStore(STORE_MEDIA);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SEED_FLAG, 'true');
  }
}

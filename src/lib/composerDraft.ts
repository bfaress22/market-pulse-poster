export type ComposerDraft = {
  textMode: "ai" | "manual";
  textPrompt: string;
  content: string;
  title: string;
  language: string;
  targetIds: string[];
  imageMode: "ai" | "manual" | "chart";
  imagePrompt: string;
  imageUrl: string | null;
  chartPayload?: unknown | null;
  analysis?: string;
  researchLog?: unknown[];
  analysisNews?: unknown[];
  includeImage: boolean;
  scheduleEnabled: boolean;
  scheduleDate: string | null;
  scheduleTime: string;
  selectedSourceIds: string[];
  adhocSources: { id: string; type: "url" | "keyword" | "idea"; value: string }[];
  quickSubject: string;
  savedAt: string;
};

const keyFor = (userId: string) => `composer_draft_${userId}`;

export function loadComposerDraft(userId: string): ComposerDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveComposerDraft(userId: string, draft: Omit<ComposerDraft, "savedAt">): void {
  try {
    const payload: ComposerDraft = { ...draft, savedAt: new Date().toISOString() };
    localStorage.setItem(keyFor(userId), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function clearComposerDraft(userId: string): void {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}

export function draftHasWork(draft: ComposerDraft | null): boolean {
  if (!draft) return false;
  return Boolean(
    draft.content.trim() ||
    draft.textPrompt.trim() ||
    draft.title.trim() ||
    draft.imageUrl ||
    draft.quickSubject.trim() ||
    draft.adhocSources.length ||
    draft.scheduleEnabled,
  );
}

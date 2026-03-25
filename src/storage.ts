const STORAGE_KEY = "easynote";

interface StoredNote {
  content: string;
}

export function saveNote(content: string) {
  const data: StoredNote = { content };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadNote(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  try {
    const data = JSON.parse(raw) as Partial<StoredNote>;
    if (typeof data.content === "string") {
      return data.content;
    }
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearNote() {
  localStorage.removeItem(STORAGE_KEY);
}

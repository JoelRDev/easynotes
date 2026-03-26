import "./style.css";
import {
  getThemePreference,
  initTheme,
  setThemePreference,
  type ThemePreference,
} from "./theme";
import { saveNote, loadNote } from "./storage";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const editor = $<HTMLDivElement>("editor");
const toolbar = $<HTMLDivElement>("toolbar");
const wordCountEl = $<HTMLSpanElement>("wordCount");
const charCountEl = $<HTMLSpanElement>("charCount");
const settingsButton = $<HTMLButtonElement>("settingsButton");
const settingsDropdown = $<HTMLDivElement>("settingsDropdown");
const undoButton = $<HTMLButtonElement>("undoButton");
const redoButton = $<HTMLButtonElement>("redoButton");
const boldButton = $<HTMLButtonElement>("boldButton");
const italicButton = $<HTMLButtonElement>("italicButton");
const underlineButton = $<HTMLButtonElement>("underlineButton");
const listButton = $<HTMLButtonElement>("listButton");
type FormatCommand = "bold" | "italic" | "underline" | "insertUnorderedList";
type HistoryCommand = "undo" | "redo";
type FormatState = Record<FormatCommand, boolean>;

const historyButtons = [undoButton, redoButton];
const formatButtons = [boldButton, italicButton, underlineButton, listButton];
const toolbarButtons = [...historyButtons, ...formatButtons];
const formatButtonsByCommand: Record<FormatCommand, HTMLButtonElement> = {
  bold: boldButton,
  italic: italicButton,
  underline: underlineButton,
  insertUnorderedList: listButton,
};
const rememberedCollapsedFormatState: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  insertUnorderedList: false,
};
const themeToggle = $<HTMLDivElement>("themeToggle");
const themeToggleButtons = themeToggle.querySelectorAll<HTMLButtonElement>(".theme-toggle-btn");

// ── Theme ────────────────────────────────────────────

initTheme();
syncThemePreferenceInputs();

themeToggleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const value = btn.dataset.themeValue as ThemePreference;
    setThemePreference(value);
    syncThemePreferenceInputs();
  });
});

settingsButton.addEventListener("click", () => {
  if (isSettingsOpen()) {
    closeSettings();
  } else {
    openSettings();
  }
});

document.addEventListener("click", (event) => {
  if (
    isSettingsOpen() &&
    !settingsDropdown.contains(event.target as Node) &&
    !settingsButton.contains(event.target as Node)
  ) {
    closeSettings();
  }
});

// ── Load existing note ───────────────────────────────

const existing = loadNote();
if (existing !== null) {
  editor.innerHTML = existing;
}
syncOrderedListMarkerWidths();
syncEditorPlaceholderState();
updateStats();
syncToolbarScrollState();
syncToolbarState();

// ── Debounced auto-save ──────────────────────────────

let saveTimer: ReturnType<typeof setTimeout>;

function getEditorContent(): string {
  return editor.innerHTML;
}

function persistEditorContent() {
  saveNote(getEditorContent());
}

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistEditorContent();
  }, 500);
}

editor.addEventListener("input", (event) => {
  if (event instanceof InputEvent) {
    resetBulletListStateIfEditorWasCleared(event);
  }

  handleEditorContentChange();
});
editor.addEventListener("focus", () => {
  syncEditorPlaceholderState();
  syncToolbarState();
});
editor.addEventListener("blur", syncEditorPlaceholderState);

editor.addEventListener("beforeinput", (event) => {
  if (removeEmptyBulletPoint(event)) {
    return;
  }

  if (syncEmptyEditorTypingFormat(event)) {
    return;
  }

  rememberCurrentFormatState();
});

window.addEventListener("beforeunload", persistEditorContent);
window.addEventListener("pagehide", persistEditorContent);
window.addEventListener("scroll", syncToolbarScrollState, { passive: true });
window.addEventListener("resize", syncToolbarScrollState);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    persistEditorContent();
  }
});

// ── Formatting ───────────────────────────────────────

function execFormat(command: FormatCommand) {
  const formatButton = formatButtonsByCommand[command];
  const nextButtonState = !formatButton.classList.contains("active");
  const selection = getEditorSelection();
  const isCollapsedEditorSelection = selection?.isCollapsed ?? false;

  document.execCommand(command, false);
  editor.focus();
  requestAnimationFrame(syncOrderedListMarkerWidths);

  if (isCollapsedEditorSelection) {
    formatButton.classList.toggle("active", nextButtonState);
    rememberedCollapsedFormatState[command] = nextButtonState;
    return;
  }

  requestAnimationFrame(syncToolbarButtons);
}

function syncToolbarButtons() {
  const selection = getEditorSelection();
  if (!selection) return;

  if (selection.isCollapsed && isEditorVisuallyEmpty()) {
    applyToolbarState(rememberedCollapsedFormatState);
    return;
  }

  const currentFormatState = getCurrentFormatState();
  applyToolbarState(currentFormatState);

  if (selection.isCollapsed) {
    Object.assign(rememberedCollapsedFormatState, currentFormatState);
  }
}

function syncHistoryButtons() {
  undoButton.disabled = !canExecCommand("undo");
  redoButton.disabled = !canExecCommand("redo");
}

function syncToolbarState() {
  syncToolbarButtons();
  syncHistoryButtons();
}

function getEditorSelection() {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode) return null;

  const isWithinEditor = [anchorNode, focusNode].every((node) => {
    const element = node instanceof Element ? node : node.parentElement;
    return element !== null && (element === editor || editor.contains(element));
  });

  return isWithinEditor ? selection : null;
}

function getCurrentFormatState(): FormatState {
  return {
    bold: document.queryCommandState("bold"),
    italic: document.queryCommandState("italic"),
    underline: document.queryCommandState("underline"),
    insertUnorderedList: document.queryCommandState("insertUnorderedList"),
  };
}

function applyToolbarState(formatState: FormatState) {
  boldButton.classList.toggle("active", formatState.bold);
  italicButton.classList.toggle("active", formatState.italic);
  underlineButton.classList.toggle("active", formatState.underline);
  listButton.classList.toggle("active", formatState.insertUnorderedList);
}

function canExecCommand(command: HistoryCommand) {
  try {
    return document.queryCommandEnabled(command);
  } catch {
    return false;
  }
}

function rememberCurrentFormatState() {
  Object.assign(rememberedCollapsedFormatState, getCurrentFormatState());
}

function isEditorVisuallyEmpty() {
  return (editor.textContent ?? "").replace(/\u200B/g, "").length === 0;
}

function handleEditorContentChange() {
  syncOrderedListMarkerWidths();
  syncEditorPlaceholderState();
  debouncedSave();
  updateStats();
  syncToolbarState();
}

function execHistory(command: HistoryCommand) {
  editor.focus();
  if (!canExecCommand(command)) {
    syncHistoryButtons();
    return;
  }

  document.execCommand(command, false);
  requestAnimationFrame(handleEditorContentChange);
}

function syncEditorPlaceholderState() {
  editor.classList.toggle("is-empty", shouldShowEditorPlaceholder());
}

function shouldShowEditorPlaceholder() {
  return (
    isEditorVisuallyEmpty() &&
    document.activeElement !== editor &&
    !hasPlaceholderSuppressingStructure()
  );
}

function hasPlaceholderSuppressingStructure() {
  const relevantNodes = Array.from(editor.childNodes).filter(isRelevantEditorNode);

  if (relevantNodes.length === 0) {
    return false;
  }

  if (relevantNodes.length > 1) {
    return true;
  }

  return suppressesPlaceholderWhenEmpty(relevantNodes[0]);
}

function isRelevantEditorNode(node: Node): boolean {
  if (node instanceof HTMLBRElement) {
    return false;
  }

  if (node instanceof Text) {
    return node.textContent?.replace(/\u200B/g, "").trim().length !== 0;
  }

  return node instanceof HTMLElement;
}

function suppressesPlaceholderWhenEmpty(node: Node): boolean {
  if (!isRelevantEditorNode(node)) {
    return false;
  }

  if (node instanceof Text) {
    return true;
  }

  if (node instanceof HTMLUListElement || node instanceof HTMLOListElement) {
    return node.childElementCount > 0;
  }

  const relevantChildren = Array.from(node.childNodes).filter(isRelevantEditorNode);
  if (relevantChildren.length === 0) {
    return node instanceof HTMLElement && !isSimpleEmptyEditorBlock(node);
  }

  if (relevantChildren.length > 1) {
    return true;
  }

  return suppressesPlaceholderWhenEmpty(relevantChildren[0]);
}

function isSimpleEmptyEditorBlock(element: HTMLElement) {
  return /^(DIV|P)$/.test(element.tagName) && Array.from(element.childNodes).every((child) => {
    if (child instanceof HTMLBRElement) {
      return true;
    }

    if (child instanceof Text) {
      return child.textContent?.replace(/\u200B/g, "").trim().length === 0;
    }

    return false;
  });
}

function syncOrderedListMarkerWidths() {
  const orderedLists = editor.querySelectorAll<HTMLOListElement>("ol");
  orderedLists.forEach((list) => {
    let nextValue = getOrderedListStart(list);

    Array.from(list.children).forEach((child) => {
      if (!(child instanceof HTMLLIElement)) {
        return;
      }

      const explicitValue = child.getAttribute("value");
      const parsedValue = explicitValue === null ? Number.NaN : Number.parseInt(explicitValue, 10);
      const markerValue = Number.isFinite(parsedValue) ? parsedValue : nextValue;

      child.style.setProperty("--editor-ol-marker-width", `${String(markerValue).length + 1}ch`);
      nextValue = markerValue + 1;
    });
  });
}

function getOrderedListStart(list: HTMLOListElement) {
  const startAttr = list.getAttribute("start");
  const parsedStart = startAttr === null ? Number.NaN : Number.parseInt(startAttr, 10);
  return Number.isFinite(parsedStart) ? parsedStart : 1;
}

function resetBulletListStateIfEditorWasCleared(event: InputEvent) {
  if (
    !event.inputType.startsWith("delete") ||
    !isEditorVisuallyEmpty() ||
    isEditorOnlyEmptyList()
  ) {
    return;
  }

  rememberedCollapsedFormatState.insertUnorderedList = false;

  if (document.queryCommandState("insertUnorderedList")) {
    document.execCommand("insertUnorderedList", false);
  }
}

function isEditorOnlyEmptyList() {
  if (editor.childElementCount !== 1) {
    return false;
  }

  const onlyChild = editor.firstElementChild;
  if (!(onlyChild instanceof HTMLUListElement || onlyChild instanceof HTMLOListElement)) {
    return false;
  }

  const listItems = Array.from(onlyChild.children);
  return (
    listItems.length > 0 &&
    listItems.every((item) => item instanceof HTMLLIElement && isVisuallyEmptyNode(item))
  );
}

function removeEmptyBulletPoint(event: InputEvent) {
  if (!event.inputType.startsWith("delete")) {
    return false;
  }

  const selection = getEditorSelection();
  if (!selection || !selection.isCollapsed) {
    return false;
  }

  const listItem = getClosestListItem(selection.anchorNode);
  if (!listItem || !isVisuallyEmptyNode(listItem)) {
    return false;
  }

  event.preventDefault();

  const list = listItem.parentElement;
  if (!(list instanceof HTMLUListElement || list instanceof HTMLOListElement)) {
    return false;
  }

  const emptyLine = document.createElement("div");
  emptyLine.append(document.createElement("br"));

  const nextListItems = Array.from(listItem.nextElementSibling ? list.children : []).slice(
    Array.from(list.children).indexOf(listItem) + 1,
  );

  listItem.remove();

  let trailingList: HTMLUListElement | HTMLOListElement | null = null;
  if (nextListItems.length > 0) {
    trailingList = list.cloneNode(false) as HTMLUListElement | HTMLOListElement;
    nextListItems.forEach((item) => trailingList?.append(item));
  }

  list.insertAdjacentElement("afterend", emptyLine);

  if (trailingList && trailingList.childElementCount > 0) {
    emptyLine.insertAdjacentElement("afterend", trailingList);
  }

  if (list.childElementCount === 0) {
    list.remove();
  }

  placeCaretAtStart(emptyLine);
  rememberedCollapsedFormatState.insertUnorderedList = false;
  handleEditorContentChange();
  return true;
}

function getClosestListItem(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest("li") ?? null;
}

function isVisuallyEmptyNode(node: Node) {
  return (node.textContent ?? "").replace(/\u200B/g, "").trim().length === 0;
}

function placeCaretAtStart(element: HTMLElement) {
  const selection = document.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  editor.focus();
}

function syncEmptyEditorTypingFormat(event: InputEvent) {
  const selection = getEditorSelection();
  const isInsertEvent = event.inputType.startsWith("insert");

  if (!selection || !selection.isCollapsed || !isEditorVisuallyEmpty() || !isInsertEvent) {
    return false;
  }

  (Object.keys(rememberedCollapsedFormatState) as FormatCommand[]).forEach((command) => {
    if (document.queryCommandState(command) !== rememberedCollapsedFormatState[command]) {
      document.execCommand(command, false);
    }
  });

  return true;
}

toolbarButtons.forEach((button) => {
  button.addEventListener("mousedown", (event) => {
    // Keep the caret/selection in the editor so command state stays in sync.
    event.preventDefault();
  });
});

undoButton.addEventListener("click", (e) => {
  e.preventDefault();
  execHistory("undo");
});

redoButton.addEventListener("click", (e) => {
  e.preventDefault();
  execHistory("redo");
});

boldButton.addEventListener("click", (e) => {
  e.preventDefault();
  execFormat("bold");
});

italicButton.addEventListener("click", (e) => {
  e.preventDefault();
  execFormat("italic");
});

underlineButton.addEventListener("click", (e) => {
  e.preventDefault();
  execFormat("underline");
});

listButton.addEventListener("click", (e) => {
  e.preventDefault();
  execFormat("insertUnorderedList");
});

editor.addEventListener("keyup", syncToolbarState);
editor.addEventListener("mouseup", syncToolbarState);
document.addEventListener("selectionchange", () => {
  if (document.activeElement === editor || editor.contains(document.activeElement)) {
    syncToolbarState();
  }
});

// ── Stats ────────────────────────────────────────────

function updateStats() {
  const text = editor.innerText || "";
  const chars = text.replace(/\n$/, "").length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  wordCountEl.textContent = `${words} word${words !== 1 ? "s" : ""}`;
  charCountEl.textContent = `${chars} character${chars !== 1 ? "s" : ""}`;
}

function syncToolbarScrollState() {
  const stickyTop = Number.parseFloat(getComputedStyle(toolbar).top) || 0;
  toolbar.classList.toggle("is-scrolled", toolbar.getBoundingClientRect().top <= stickyTop);
}

// ── Keyboard shortcuts ───────────────────────────────

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    execHistory("undo");
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    execHistory("redo");
    return;
  }

  if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "y") {
    e.preventDefault();
    execHistory("redo");
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "b") {
    e.preventDefault();
    execFormat("bold");
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "i") {
    e.preventDefault();
    execFormat("italic");
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "u") {
    e.preventDefault();
    execFormat("underline");
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "8") {
    e.preventDefault();
    execFormat("insertUnorderedList");
    return;
  }

  if (e.key === "Escape" && isSettingsOpen()) {
    closeSettings();
    return;
  }

  if (shouldFocusEditor(e)) {
    editor.focus();
  }
});

// ── Settings ─────────────────────────────────────────

function openSettings() {
  settingsDropdown.classList.add("is-opening");
  settingsDropdown.hidden = false;
  settingsButton.setAttribute("aria-expanded", "true");
  settingsButton.classList.add("active");
  syncThemePreferenceInputs();
  requestAnimationFrame(() => {
    settingsDropdown.classList.remove("is-opening");
  });
}

function closeSettings() {
  settingsDropdown.classList.add("is-closing");
  settingsButton.setAttribute("aria-expanded", "false");
  settingsButton.classList.remove("active");
  settingsDropdown.addEventListener(
    "transitionend",
    () => {
      settingsDropdown.hidden = true;
      settingsDropdown.classList.remove("is-closing");
    },
    { once: true },
  );
}

function isSettingsOpen() {
  return !settingsDropdown.hidden;
}

function syncThemePreferenceInputs() {
  const current = getThemePreference();
  themeToggleButtons.forEach((btn) => {
    const isActive = btn.dataset.themeValue === current;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-checked", String(isActive));
  });
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLAnchorElement ||
    target.closest('.settings-dropdown') !== null
  );
}

function shouldFocusEditor(event: KeyboardEvent) {
  return (
    !isSettingsOpen() &&
    !isInteractiveTarget(event.target) &&
    document.activeElement !== editor &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    event.key !== "Tab"
  );
}

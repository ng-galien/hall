import type { SpreadsheetPopup, SpreadsheetTextRange } from "./spreadsheetInteraction";

export interface FormulaBarMessages {
  formulaBar: string;
  activeCell: string;
  insertFunction: string;
  formulaValue: string;
  cancelFormula: string;
  validateFormula: string;
  expandFormulaBar: string;
  collapseFormulaBar: string;
}

export interface FormulaBarTokenView {
  text: string;
  kind: string;
  unsupported: boolean;
  referenceColorIndex?: number;
  activeReference?: boolean;
}

export interface FormulaBarSuggestionView {
  name: string;
  testId: string;
  signature: string;
  description: string;
}

export interface FormulaBarViewModel {
  address: string;
  value: string;
  editing: boolean;
  expanded: boolean;
  popup: SpreadsheetPopup;
  tokens: FormulaBarTokenView[];
  suggestions: FormulaBarSuggestionView[];
}

export interface FormulaBarEvents {
  addressSubmitted(value: string): void;
  addressCancelled(): void;
  inputChanged(value: string, caret: SpreadsheetTextRange): void;
  inputFocused(value: string, caret: SpreadsheetTextRange): void;
  caretChanged(caret: SpreadsheetTextRange): void;
  commitRequested(): void;
  cancelRequested(): void;
  expansionToggled(): void;
  catalogToggled(): void;
  suggestionSelected(name: string): void;
  inputBlurred(): void;
}

function textRange(input: HTMLTextAreaElement): SpreadsheetTextRange {
  return { start: input.selectionStart ?? 0, end: input.selectionEnd ?? input.selectionStart ?? 0 };
}

export class FormulaBarBridge {
  readonly element: HTMLFormElement;
  readonly address: HTMLInputElement;
  readonly input: HTMLTextAreaElement;
  private readonly highlight: HTMLPreElement;
  private readonly suggestions: HTMLDivElement;
  private readonly expandButton: HTMLButtonElement;
  private readonly events: FormulaBarEvents;

  constructor(messages: FormulaBarMessages, readOnly: boolean, events: FormulaBarEvents) {
    this.events = events;
    const formulaBar = window.document.createElement("form");
    formulaBar.className = "spreadsheet-formula-bar";
    formulaBar.dataset.testid = "spreadsheet-formula-bar";
    formulaBar.setAttribute("aria-label", messages.formulaBar);
    for (const eventName of ["pointerdown", "mousedown", "click", "keydown", "keyup"])
      formulaBar.addEventListener(eventName, (event) => event.stopPropagation());

    const address = window.document.createElement("input");
    address.type = "text";
    address.className = "spreadsheet-cell-address";
    address.dataset.testid = "spreadsheet-cell-address";
    address.setAttribute("aria-label", messages.activeCell);
    address.spellcheck = false;
    address.addEventListener("focus", () => address.select());
    address.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        events.addressCancelled();
      } else if (event.key === "Enter") {
        event.preventDefault();
        events.addressSubmitted(address.value);
      }
    });

    const cancel = window.document.createElement("button");
    cancel.type = "button";
    cancel.className = "spreadsheet-formula-control spreadsheet-formula-cancel";
    cancel.dataset.testid = "spreadsheet-formula-cancel";
    cancel.setAttribute("aria-label", messages.cancelFormula);
    cancel.textContent = "×";
    cancel.addEventListener("click", () => events.cancelRequested());

    const validate = window.document.createElement("button");
    validate.type = "submit";
    validate.className = "spreadsheet-formula-control spreadsheet-formula-validate";
    validate.dataset.testid = "spreadsheet-formula-validate";
    validate.setAttribute("aria-label", messages.validateFormula);
    validate.textContent = "✓";

    const picker = window.document.createElement("div");
    picker.className = "spreadsheet-formula-picker";
    const formulaSymbol = window.document.createElement("button");
    formulaSymbol.type = "button";
    formulaSymbol.className = "spreadsheet-formula-symbol";
    formulaSymbol.dataset.testid = "spreadsheet-formula-functions";
    formulaSymbol.setAttribute("aria-label", messages.insertFunction);
    formulaSymbol.textContent = "fx";
    formulaSymbol.addEventListener("click", () => events.catalogToggled());
    const suggestions = window.document.createElement("div");
    suggestions.className = "spreadsheet-formula-suggestions";
    suggestions.dataset.testid = "spreadsheet-formula-suggestions";
    suggestions.setAttribute("role", "listbox");
    picker.append(formulaSymbol, suggestions);

    const inputShell = window.document.createElement("div");
    inputShell.className = "spreadsheet-formula-input-shell";
    const highlight = window.document.createElement("pre");
    highlight.className = "spreadsheet-formula-highlight";
    highlight.setAttribute("aria-hidden", "true");
    const input = window.document.createElement("textarea");
    input.className = "spreadsheet-formula-input";
    input.dataset.testid = "spreadsheet-formula-input";
    input.setAttribute("aria-label", messages.formulaValue);
    input.autocomplete = "off";
    input.spellcheck = false;
    input.readOnly = readOnly;
    input.rows = 1;
    input.addEventListener("input", () => events.inputChanged(input.value, textRange(input)));
    input.addEventListener("focus", () => events.inputFocused(input.value, textRange(input)));
    input.addEventListener("click", () => events.caretChanged(textRange(input)));
    input.addEventListener("keyup", () => events.caretChanged(textRange(input)));
    input.addEventListener("blur", () => events.inputBlurred());
    input.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "u") {
        event.preventDefault();
        events.expansionToggled();
      } else if (event.key === "Escape") {
        event.preventDefault();
        events.cancelRequested();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        events.commitRequested();
      }
    });
    input.addEventListener("scroll", () => {
      highlight.scrollTop = input.scrollTop;
      highlight.scrollLeft = input.scrollLeft;
    });
    inputShell.append(highlight, input);

    const expand = window.document.createElement("button");
    expand.type = "button";
    expand.className = "spreadsheet-formula-expand";
    expand.dataset.testid = "spreadsheet-formula-expand";
    expand.addEventListener("click", () => events.expansionToggled());

    formulaBar.addEventListener("submit", (event) => {
      event.preventDefault();
      events.commitRequested();
    });
    formulaBar.append(address, cancel, validate, picker, inputShell, expand);

    this.element = formulaBar;
    this.address = address;
    this.input = input;
    this.highlight = highlight;
    this.suggestions = suggestions;
    this.expandButton = expand;
  }

  render(view: FormulaBarViewModel, messages: FormulaBarMessages): void {
    this.address.value = view.address;
    if (this.input.value !== view.value) this.input.value = view.value;
    this.element.classList.toggle("is-editing", view.editing);
    this.element.classList.toggle("is-expanded", view.expanded);
    this.expandButton.setAttribute("aria-pressed", String(view.expanded));
    this.expandButton.setAttribute("aria-label", view.expanded ? messages.collapseFormulaBar : messages.expandFormulaBar);
    this.expandButton.textContent = view.expanded ? "⌃" : "⌄";
    this.highlight.replaceChildren(
      ...view.tokens.map((token) => {
        const span = window.document.createElement("span");
        span.className = `spreadsheet-formula-token spreadsheet-formula-token-${token.kind}${token.unsupported ? " is-unsupported" : ""}${
          token.referenceColorIndex === undefined
            ? ""
            : ` spreadsheet-formula-reference-${token.referenceColorIndex}${token.activeReference ? " is-active-reference" : ""}`
        }`;
        if (token.referenceColorIndex !== undefined)
          span.dataset.testid = `spreadsheet-formula-reference-token-${token.referenceColorIndex}`;
        span.textContent = token.text;
        return span;
      }),
    );
    this.suggestions.replaceChildren(
      ...view.suggestions.map((suggestion, index) => {
        const option = window.document.createElement("button");
        option.type = "button";
        option.className = "spreadsheet-formula-suggestion";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === 0));
        option.dataset.testid = suggestion.testId;
        const name = window.document.createElement("strong");
        name.textContent = suggestion.name;
        const signature = window.document.createElement("code");
        signature.textContent = suggestion.signature;
        const description = window.document.createElement("small");
        description.textContent = suggestion.description;
        option.replaceChildren(name, signature, description);
        option.addEventListener("pointerdown", (event) => event.preventDefault());
        option.addEventListener("click", () => this.events.suggestionSelected(suggestion.name));
        return option;
      }),
    );
    this.suggestions.classList.toggle(
      "is-open",
      (view.popup.kind === "autocomplete" || view.popup.kind === "catalog") && view.suggestions.length > 0,
    );
  }

  focus(caret?: SpreadsheetTextRange): void {
    this.input.focus();
    if (caret) this.input.setSelectionRange(caret.start, caret.end);
  }
}

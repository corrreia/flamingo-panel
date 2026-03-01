import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#09090b",
      color: "#d4d4d8",
    },
    ".cm-content": {
      caretColor: "#d4d4d8",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "#27272a !important",
    },
    ".cm-activeLine": {
      backgroundColor: "#18181b",
    },
    ".cm-gutters": {
      backgroundColor: "#09090b",
      color: "#52525b",
      border: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#18181b",
    },
  },
  { dark: true }
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "#6b7280" },
  { tag: tags.string, color: "#a5d6ff" },
  { tag: tags.number, color: "#79c0ff" },
  { tag: tags.keyword, color: "#ff7b72" },
  { tag: tags.definition(tags.variableName), color: "#ffa657" },
  { tag: tags.typeName, color: "#7ee787" },
  { tag: tags.propertyName, color: "#d2a8ff" },
  { tag: tags.bool, color: "#79c0ff" },
]);

export const flamingoDark: Extension = [
  editorTheme,
  syntaxHighlighting(highlightStyle),
];

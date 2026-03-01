import { json } from "@codemirror/lang-json";
import type { Extension } from "@codemirror/state";
import CodeMirror from "@uiw/react-codemirror";
import { flamingoDark } from "@web/lib/codemirror-theme";
import { cn } from "@web/lib/utils";

type Language = "json" | "bash";

const languageExtensions: Record<Language, () => Extension[]> = {
  json: () => [json()],
  bash: () => [],
};

interface CodeEditorProps {
  className?: string;
  language?: Language;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function CodeEditor({
  className,
  language = "json",
  onChange,
  placeholder,
  value,
}: CodeEditorProps) {
  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <CodeMirror
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          autocompletion: false,
        }}
        extensions={languageExtensions[language]?.() ?? []}
        height="100%"
        minHeight="120px"
        onChange={onChange}
        placeholder={placeholder}
        theme={flamingoDark}
        value={value}
      />
    </div>
  );
}

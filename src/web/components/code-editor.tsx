import { cn } from "@web/lib/utils";
import { useEffect, useState } from "react";

type Language = "json" | "bash";

const languageModules: Record<Language, () => Promise<unknown>> = {
  json: () => import("prismjs/components/prism-json"),
  bash: () => import("prismjs/components/prism-bash"),
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
  const [editor, setEditor] = useState<{
    Editor: typeof import("react-simple-code-editor").default;
    Prism: typeof import("prismjs");
  } | null>(null);

  useEffect(() => {
    Promise.all([import("react-simple-code-editor"), import("prismjs")]).then(
      async ([editorMod, prismMod]) => {
        await languageModules[language]();
        setEditor({ Editor: editorMod.default, Prism: prismMod });
      }
    );
  }, [language]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-md border border-input bg-transparent shadow-xs dark:bg-input/30",
          className
        )}
      >
        <textarea
          className="h-full w-full resize-none bg-transparent p-3 font-mono text-xs outline-none"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </div>
    );
  }

  const { Editor: Ed, Prism } = editor;
  const grammar = Prism.languages[language];

  return (
    <div
      className={cn(
        "overflow-auto rounded-md border border-input bg-transparent shadow-xs dark:bg-input/30",
        className
      )}
    >
      <Ed
        highlight={(code) =>
          grammar ? Prism.highlight(code, grammar, language) : code
        }
        onValueChange={onChange}
        padding={12}
        placeholder={placeholder}
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.75rem",
          lineHeight: "1.5",
          minHeight: "100%",
        }}
        value={value}
      />
    </div>
  );
}

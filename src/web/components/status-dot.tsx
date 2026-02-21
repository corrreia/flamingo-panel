interface StatusDotProps {
  label?: string;
  status: "online" | "offline";
}

export function StatusDot({ status, label }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${
          status === "online"
            ? "bg-emerald-500 shadow-[0_0_4px_theme(--color-emerald-500/0.5)]"
            : "bg-muted-foreground/40"
        }`}
      />
      {label && <span>{label}</span>}
      <span className="sr-only">
        {status === "online" ? "Online" : "Offline"}
      </span>
    </span>
  );
}

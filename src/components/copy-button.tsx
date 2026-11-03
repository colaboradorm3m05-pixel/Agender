"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

export function CopyButton({ value, label = "Copiar link", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "md", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copie o link:", value);
        }
      }}
    >
      <span aria-live="polite">{copied ? "Copiado!" : label}</span>
    </button>
  );
}

export function PublicLinkBox({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="block flex-1 truncate rounded-lg border border-line bg-canvas px-3 py-2 text-sm" title={url}>
        {url}
      </code>
      <div className="flex gap-2">
        <CopyButton value={url} />
        <a href={url} target="_blank" rel="noreferrer" className={buttonClass("ghost")}>
          Abrir
        </a>
      </div>
    </div>
  );
}

import { renderSafeMarkdown } from "@/lib/text";

export function SafeMarkdown({ text }: { text: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(text) }} />;
}

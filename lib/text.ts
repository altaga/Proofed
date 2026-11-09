export function visibleAssistantText(content: string | null | undefined): string {
  if (!content) return "";
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

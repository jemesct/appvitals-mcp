export interface ToolText {
  type: "text";
  text: string;
}

export interface ToolResult {
  [key: string]: unknown;
  content: ToolText[];
  isError?: boolean;
}

export function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function fail(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

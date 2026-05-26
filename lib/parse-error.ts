export interface ParsedError {
  title: string;
  detail: string;
  retryable: boolean;
}

export function parseApiError(raw: string): ParsedError {
  // Anthropic SDK errors arrive as: "429 {\"type\":\"error\",\"error\":{...}}"
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      const errType: string = obj?.error?.type ?? "";
      const errMsg: string = obj?.error?.message ?? raw;

      switch (errType) {
        case "rate_limit_error": {
          const short = errMsg.split(" (org:")[0]
            .replace("This request would exceed your organization's rate limit of ", "Limit: ")
            .replace("This request would exceed your organization's ", "");
          return {
            title: "Rate limit exceeded",
            detail: short || "Too many tokens per minute.",
            retryable: true,
          };
        }
        case "authentication_error":
          return { title: "API key error", detail: "Your ANTHROPIC_API_KEY is missing or invalid.", retryable: false };
        case "permission_error":
          return { title: "Permission denied", detail: errMsg.slice(0, 200), retryable: false };
        case "not_found_error":
          return { title: "Model not found", detail: "The selected model doesn't exist or was removed.", retryable: false };
        case "overloaded_error":
          return { title: "Anthropic overloaded", detail: "Too much traffic right now. Try again in a moment.", retryable: true };
        case "invalid_request_error":
          return { title: "Invalid request", detail: errMsg.slice(0, 250), retryable: false };
        default:
          if (errMsg) return { title: "API error", detail: errMsg.slice(0, 300), retryable: false };
      }
    } catch {}
  }

  // Check for simple HTTP-status prefix like "503 Service Unavailable"
  const statusMatch = raw.match(/^(\d{3})\s+(.+)/);
  if (statusMatch) {
    const code = parseInt(statusMatch[1], 10);
    return {
      title: `Error ${statusMatch[1]}`,
      detail: statusMatch[2].slice(0, 200),
      retryable: code === 429 || code >= 500,
    };
  }

  return { title: "Request failed", detail: raw.slice(0, 300), retryable: false };
}

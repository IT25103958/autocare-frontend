// Turns an axios error into text that is always safe to render.
// The backend usually replies with a plain string, but Spring's default error
// body is an object ({ status, error, message, ... }) — rendering that object
// directly as a React child crashes the page.
export function getErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown; status?: number } })?.response?.data;
  const status = (err as { response?: { status?: number } })?.response?.status;

  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const body = data as { message?: unknown; error?: unknown };
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return `${body.error} (${status})`;
  }
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "You don't have permission to do that.";
  return fallback;
}

import createClient from "openapi-fetch";
import type { paths } from "./schema";

export const api = createClient<paths>({ baseUrl: "" });

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type ValidationItem = { loc?: (string | number)[]; msg?: string };

/** Turns FastAPI's `detail` (string, list of strings or validation errors) into a readable message. */
export function errorMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: string | ValidationItem) => {
        if (typeof d === "string") return d;
        const field = d.loc?.filter((part) => part !== "body").join(".");
        return field ? `${field}: ${d.msg}` : (d.msg ?? "invalid value");
      })
      .join("\n");
  }
  return "Something went wrong";
}

/** Unwraps an openapi-fetch result: returns the data or throws an ApiError. */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) {
    const detail = (error as { detail?: unknown } | undefined)?.detail;
    throw new ApiError(errorMessage(detail ?? response.statusText), response.status);
  }
  return data as T;
}

/** Multipart upload (openapi-fetch's typed bodies don't cover files well). */
export async function upload<T>(url: string, form: FormData): Promise<T> {
  const response = await fetch(url, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(errorMessage(body.detail), response.status);
  return body as T;
}

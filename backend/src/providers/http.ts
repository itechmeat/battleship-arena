interface RequestJsonOptions {
  fetch: typeof globalThis.fetch;
  url: string;
  init: RequestInit;
  retries?: number;
  retryDelayMs?: number;
}

const DEFAULT_BACKOFF_MS = [500, 1500, 4500] as const;
const RETRY_AFTER_CAP_MS = 30_000;

export class NonRetriable4xxError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Provider rejected the request with HTTP ${status}`);
    this.name = "NonRetriable4xxError";
    this.status = status;
    this.body = body;
  }
}

export class TransientFailureError extends Error {
  readonly status?: number;
  readonly body?: string;

  constructor(message: string, options: { status?: number; body?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "TransientFailureError";
    if (options.status !== undefined) {
      this.status = options.status;
    }
    if (options.body !== undefined) {
      this.body = options.body;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }

  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function transientMessageForStatus(status: number): string {
  if (status === 429) {
    return "Provider rate limit reached";
  }

  return "Provider service failed";
}

function retryDelayFor(
  response: Response,
  attempt: number,
  overrideMs: number | undefined,
): number {
  if (overrideMs !== undefined) {
    return overrideMs;
  }

  const retryAfter = response.headers.get("Retry-After");
  const retryAfterSeconds = retryAfter === null ? null : Number.parseInt(retryAfter, 10);
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)) {
    return Math.min(retryAfterSeconds * 1000, RETRY_AFTER_CAP_MS);
  }

  return DEFAULT_BACKOFF_MS[attempt] ?? DEFAULT_BACKOFF_MS.at(-1) ?? 4500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function requestJson<T>(options: RequestJsonOptions, signal: AbortSignal): Promise<T> {
  const text = await requestText(options, signal);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new TransientFailureError("Provider returned malformed JSON", {
      body: text,
    });
  }
}

export async function requestText(
  options: RequestJsonOptions,
  signal: AbortSignal,
): Promise<string> {
  const maxAttempts = Math.max(1, options.retries ?? DEFAULT_BACKOFF_MS.length);
  let attempt = 0;

  while (true) {
    try {
      const response = await options.fetch(options.url, {
        ...options.init,
        signal,
      });
      const text = await response.text();

      if (!response.ok) {
        if (isRetryableStatus(response.status)) {
          if (attempt + 1 >= maxAttempts) {
            throw new TransientFailureError(transientMessageForStatus(response.status), {
              status: response.status,
              body: text,
            });
          }

          const retryDelayMs = retryDelayFor(response, attempt, options.retryDelayMs);
          attempt += 1;
          await delay(retryDelayMs, signal);
          continue;
        }

        throw new NonRetriable4xxError(response.status, text);
      }

      return text;
    } catch (error) {
      if (
        error instanceof NonRetriable4xxError ||
        error instanceof TransientFailureError ||
        isAbortError(error)
      ) {
        throw error;
      }

      if (attempt + 1 < maxAttempts) {
        const retryDelayMs =
          options.retryDelayMs ?? DEFAULT_BACKOFF_MS[attempt] ?? DEFAULT_BACKOFF_MS.at(-1) ?? 4500;

        attempt += 1;
        await delay(retryDelayMs, signal);
        continue;
      }

      throw new TransientFailureError("Provider network request failed", {
        cause: error,
      });
    }
  }
}

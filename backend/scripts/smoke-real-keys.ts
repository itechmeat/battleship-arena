import { createQueries } from "../src/db/queries.ts";
import { withTempDatabase } from "../src/db/with-temp-database.ts";
import { getPricingEntry } from "../src/pricing/catalog.ts";
import { sanitizeProviderCause } from "../src/providers/errors.ts";
import { createOpenCodeGoAdapter } from "../src/providers/opencode-go.ts";
import { createOpenRouterAdapter } from "../src/providers/openrouter.ts";
import type { ProviderAdapter } from "../src/providers/types.ts";
import { runEngine } from "../src/runs/engine.ts";

type ProviderId = "openrouter" | "opencode-go";

interface SmokeOptions {
  providers: ProviderId[];
  key?: string;
  openrouterKey?: string;
  opencodeGoKey?: string;
  model?: string;
  turns: number;
  budgetUsd?: number;
  dryRun: boolean;
  forceProd: boolean;
}

interface SmokeSummary {
  providerId: ProviderId;
  modelId: string;
  outcome: string | null;
  shotsFired: number;
  costUsdMicros: number;
  tokensIn: number;
  tokensOut: number;
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  openrouter: "openai/gpt-5-nano",
  "opencode-go": "opencode-go/glm-5.1",
};

const DEFAULT_ENDPOINTS: Record<ProviderId, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
};

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

function usage(): string {
  return [
    "Usage: bun run --cwd backend smoke:real-keys (--provider <openrouter|opencode-go> | --all) [flags]",
    "",
    "Flags:",
    "  --key <value>              Shared provider API key",
    "  --openrouter-key <value>   OpenRouter API key",
    "  --opencode-go-key <value>  OpenCode Go API key",
    "  --model <id>               Exact model id for a single-provider smoke",
    "  --turns <n>                Positive turn cap, default 3",
    "  --budget <usd>             Optional non-negative budget cap",
    "  --dry-run                  Print request plan without network",
    "  --force-prod               Allow NODE_ENV=production",
  ].join("\n");
}

function readRequiredValue(flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value`);
  }

  return value;
}

function readArgs(argv: readonly string[]): SmokeOptions {
  const options: SmokeOptions = {
    providers: [],
    turns: 3,
    dryRun: false,
    forceProd: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--provider": {
        const provider = readRequiredValue("--provider", next);
        if (provider !== "openrouter" && provider !== "opencode-go") {
          throw new UsageError("--provider must be openrouter or opencode-go");
        }

        options.providers = [provider];
        index += 1;
        break;
      }
      case "--all":
        options.providers = ["openrouter", "opencode-go"];
        break;
      case "--key":
        options.key = readRequiredValue("--key", next);
        index += 1;
        break;
      case "--openrouter-key":
        options.openrouterKey = readRequiredValue("--openrouter-key", next);
        index += 1;
        break;
      case "--opencode-go-key":
        options.opencodeGoKey = readRequiredValue("--opencode-go-key", next);
        index += 1;
        break;
      case "--model":
        options.model = readRequiredValue("--model", next);
        index += 1;
        break;
      case "--turns":
        options.turns = Number.parseInt(readRequiredValue("--turns", next), 10);
        index += 1;
        break;
      case "--budget":
        options.budgetUsd = Number.parseFloat(readRequiredValue("--budget", next));
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--force-prod":
        options.forceProd = true;
        break;
      default:
        throw new UsageError(`Unknown flag: ${arg ?? "<empty>"}`);
    }
  }

  if (options.providers.length === 0) {
    throw new UsageError("Either --provider or --all is required");
  }

  if (!Number.isInteger(options.turns) || options.turns <= 0) {
    throw new UsageError("--turns must be a positive integer");
  }

  if (
    options.budgetUsd !== undefined &&
    (!Number.isFinite(options.budgetUsd) || options.budgetUsd < 0)
  ) {
    throw new UsageError("--budget must be zero or a positive number");
  }

  return options;
}

function keyForProvider(options: SmokeOptions, providerId: ProviderId): string | undefined {
  if (providerId === "openrouter") {
    return options.openrouterKey ?? options.key ?? process.env.OPENROUTER_API_KEY;
  }

  return options.opencodeGoKey ?? options.key ?? process.env.OPENCODE_GO_API_KEY;
}

function adapterFor(providerId: ProviderId): ProviderAdapter {
  return providerId === "openrouter" ? createOpenRouterAdapter() : createOpenCodeGoAdapter();
}

function providerModelId(providerId: ProviderId, modelId: string): string {
  if (providerId === "opencode-go") {
    return modelId.replace(/^opencode-go\//, "");
  }

  return modelId;
}

function requestPlanFor(providerId: ProviderId, modelId: string) {
  const entry = getPricingEntry(providerId, modelId);

  return {
    providerId,
    modelId,
    url: entry?.endpoint ?? DEFAULT_ENDPOINTS[providerId],
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer [redacted]",
    },
    body: {
      model: providerModelId(providerId, modelId),
      stream: false,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "[system prompt]" },
        {
          role: "user",
          content: [
            { type: "text", text: "[seed, ships remaining, and prior shots]" },
            { type: "image_url", image_url: { url: "data:image/png;base64,[redacted]" } },
          ],
        },
      ],
    },
  };
}

function redactText(text: string, keys: readonly string[]): string {
  let redacted = sanitizeProviderCause(text) ?? text;
  for (const key of keys) {
    if (key.length > 0) {
      redacted = redacted.split(key).join("[redacted]");
    }
  }

  return redacted;
}

function jsonLine(value: unknown, keys: readonly string[]): string {
  return redactText(JSON.stringify(value), keys);
}

function withRedactedConsole(keys: readonly string[]) {
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };
  const redactArgs = (args: readonly unknown[]) =>
    args.map((arg) => (typeof arg === "string" ? redactText(arg, keys) : arg));

  console.log = ((...args: unknown[]) => originals.log(...redactArgs(args))) as typeof console.log;
  console.warn = ((...args: unknown[]) =>
    originals.warn(...redactArgs(args))) as typeof console.warn;
  console.error = ((...args: unknown[]) =>
    originals.error(...redactArgs(args))) as typeof console.error;
  console.info = ((...args: unknown[]) =>
    originals.info(...redactArgs(args))) as typeof console.info;

  return () => {
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
    console.info = originals.info;
  };
}

function withTurnCap(provider: ProviderAdapter, turns: number): ProviderAdapter {
  let calls = 0;

  return {
    ...provider,
    async call(input, signal) {
      if (calls >= turns) {
        throw new DOMException("Smoke turn cap reached", "AbortError");
      }

      calls += 1;
      return provider.call(input, signal);
    },
  };
}

async function runProviderSmoke(
  options: SmokeOptions,
  providerId: ProviderId,
  keys: readonly string[],
): Promise<SmokeSummary | null> {
  const key = keyForProvider(options, providerId);
  const modelId = options.model ?? DEFAULT_MODELS[providerId];

  if (options.dryRun) {
    console.log(jsonLine(requestPlanFor(providerId, modelId), keys));
    return null;
  }

  if (key === undefined || key.length === 0) {
    throw new UsageError(`Missing key for ${providerId}`);
  }

  return await withTempDatabase(async ({ db }) => {
    const queries = createQueries(db);
    const outcome = await runEngine(
      `smoke-${providerId}`,
      {
        providerId,
        modelId,
        apiKey: key,
        clientSession: "real-token-smoke",
        seedDate: new Date().toISOString().slice(0, 10),
        ...(options.budgetUsd === undefined ? {} : { budgetUsd: options.budgetUsd }),
      },
      new AbortController().signal,
      (event) => {
        if (event.kind === "shot") {
          console.log(jsonLine({ providerId, modelId, turn: event }, keys));
        }
      },
      { queries, provider: withTurnCap(adapterFor(providerId), options.turns) },
    );
    const meta = queries.getRunMeta(`smoke-${providerId}`);

    return {
      providerId,
      modelId,
      outcome,
      shotsFired: meta?.shotsFired ?? 0,
      costUsdMicros: meta?.costUsdMicros ?? 0,
      tokensIn: meta?.tokensIn ?? 0,
      tokensOut: meta?.tokensOut ?? 0,
    };
  });
}

function collectAllKeys(options: SmokeOptions | null): string[] {
  const keys: string[] = [];
  if (options !== null) {
    if (options.key !== undefined) keys.push(options.key);
    if (options.openrouterKey !== undefined) keys.push(options.openrouterKey);
    if (options.opencodeGoKey !== undefined) keys.push(options.opencodeGoKey);
  }
  if (process.env.OPENROUTER_API_KEY !== undefined) keys.push(process.env.OPENROUTER_API_KEY);
  if (process.env.OPENCODE_GO_API_KEY !== undefined) keys.push(process.env.OPENCODE_GO_API_KEY);
  return keys.filter((key) => key.length > 0);
}

// Parsed at module scope so the top-level catch below can redact CLI-supplied keys even after
// restoreConsole() has run. `parsedOptions` stays null if arg parsing itself fails; the catch
// still redacts env-var-provided keys in that case.
let parsedOptions: SmokeOptions | null = null;

async function main() {
  try {
    parsedOptions = readArgs(Bun.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${usage()}\n\n${error.message}`);
      process.exit(2);
    }

    throw error;
  }

  const options = parsedOptions;
  const keys = options.providers.flatMap((providerId) => keyForProvider(options, providerId) ?? []);
  const restoreConsole = withRedactedConsole(keys);

  try {
    if (process.env.NODE_ENV === "production" && !options.forceProd) {
      throw new Error("Refusing real-token smoke in production without --force-prod");
    }

    for (const providerId of options.providers) {
      const summary = await runProviderSmoke(options, providerId, keys);
      if (summary !== null) {
        console.log(jsonLine(summary, keys));
      }
    }
  } finally {
    restoreConsole();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    redactText(
      error instanceof Error ? error.message : String(error),
      collectAllKeys(parsedOptions),
    ),
  );
  process.exit(1);
}

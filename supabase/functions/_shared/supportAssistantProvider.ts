export interface ProviderAttempt {
  attemptNumber: number;
  provider: string;
  model: string;
  providerRequestId: string | null;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  latencyMs: number;
  finishReason: string | null;
  errorCategory: string | null;
}

export interface EmbeddingResult {
  provider: 'openai';
  model: string;
  providerRequestId: string | null;
  embedding: number[];
  inputTokens: number | null;
  latencyMs: number;
}

export interface GeneratedSupportAnswer {
  answer: string;
  citations: string[];
  noAnswerReason: string | null;
}

export interface GenerationResult {
  provider: 'openai';
  model: string;
  providerRequestId: string | null;
  answer: GeneratedSupportAnswer;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  latencyMs: number;
  finishReason: string | null;
  attempts: ProviderAttempt[];
}

interface ProviderOptions {
  apiKey: string;
  timeoutMs: number;
  retryCount: number;
  fetchImpl?: typeof fetch;
}

interface GenerateOptions extends ProviderOptions {
  model: string;
  fallbackModel?: string | null;
  maxOutputTokens: number;
  system: string;
  developer: string;
  user: string;
}

function errorCategory(status: number | null, reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'AbortError') return 'PROVIDER_TIMEOUT';
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status !== null && status >= 500) return 'PROVIDER_TEMPORARY';
  if (status === 400) return 'PROVIDER_INPUT_ERROR';
  if (status === 401 || status === 403) return 'PROVIDER_CONFIGURATION';
  return 'PROVIDER_ERROR';
}

function retryable(status: number | null, reason: unknown): boolean {
  if (reason instanceof DOMException && reason.name === 'AbortError') return true;
  return status === 429 || (status !== null && status >= 500);
}

function parseRetryAfter(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(2_000, Math.max(0, seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(2_000, Math.max(0, date - Date.now())) : 0;
}

async function postOpenAi(
  path: string,
  body: Record<string, unknown>,
  options: ProviderOptions,
): Promise<{ response: Response; json: Record<string, unknown>; latencyMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await (options.fetchImpl || fetch)(`https://api.openai.com/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { response, json, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export async function createEmbedding(
  input: string | string[],
  model: string,
  dimensions: number,
  options: ProviderOptions,
): Promise<EmbeddingResult | EmbeddingResult[]> {
  const { response, json, latencyMs } = await postOpenAi('embeddings', {
    model,
    input,
    dimensions,
    encoding_format: 'float',
  }, options);
  if (!response.ok) throw new Error(errorCategory(response.status, json));
  const rows = Array.isArray(json.data) ? json.data as Array<Record<string, unknown>> : [];
  const usage = (json.usage || {}) as Record<string, unknown>;
  const requestId = response.headers.get('x-request-id');
  const mapped = rows.map((row) => ({
    provider: 'openai' as const,
    model: String(json.model || model),
    providerRequestId: requestId,
    embedding: Array.isArray(row.embedding) ? row.embedding.map(Number) : [],
    inputTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null,
    latencyMs,
  }));
  if (!mapped.length || mapped.some((row) => row.embedding.length !== dimensions)) {
    throw new Error('INVALID_EMBEDDING_RESPONSE');
  }
  return Array.isArray(input) ? mapped : mapped[0];
}

function responseOutputText(json: Record<string, unknown>): string {
  const output = Array.isArray(json.output) ? json.output as Array<Record<string, unknown>> : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [];
    for (const part of content) {
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  throw new Error('INVALID_PROVIDER_RESPONSE');
}

function parseStructuredAnswer(value: string): GeneratedSupportAnswer {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (typeof parsed.answer !== 'string' || !Array.isArray(parsed.citations)) {
    throw new Error('INVALID_PROVIDER_RESPONSE');
  }
  return {
    answer: parsed.answer.trim(),
    citations: parsed.citations.filter((citation): citation is string => typeof citation === 'string'),
    noAnswerReason: typeof parsed.no_answer_reason === 'string' ? parsed.no_answer_reason : null,
  };
}

export async function generateSupportAnswer(options: GenerateOptions): Promise<GenerationResult> {
  const attempts: ProviderAttempt[] = [];
  const models = [options.model, ...(options.fallbackModel && options.fallbackModel !== options.model
    ? [options.fallbackModel]
    : [])];
  const maximumAttempts = options.retryCount + 1 + (models.length - 1);
  let lastError = 'PROVIDER_ERROR';

  for (let attemptNumber = 1; attemptNumber <= maximumAttempts; attemptNumber += 1) {
    const model = attemptNumber <= options.retryCount + 1 ? models[0] : models[1];
    const started = Date.now();
    let status: number | null = null;
    try {
      const result = await postOpenAi('responses', {
        model,
        store: false,
        max_output_tokens: options.maxOutputTokens,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: options.system }] },
          { role: 'developer', content: [{ type: 'input_text', text: options.developer }] },
          { role: 'user', content: [{ type: 'input_text', text: options.user }] },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'timan_support_answer',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                answer: { type: 'string' },
                citations: { type: 'array', items: { type: 'string' } },
                no_answer_reason: {
                  anyOf: [
                    { type: 'string', enum: [
                      'NO_RELEVANT_KNOWLEDGE', 'LOW_CONFIDENCE', 'AMBIGUOUS_QUESTION',
                      'MISSING_DOCUMENTATION', 'OTHER',
                    ] },
                    { type: 'null' },
                  ],
                },
              },
              required: ['answer', 'citations', 'no_answer_reason'],
            },
          },
        },
      }, options);
      status = result.response.status;
      if (!result.response.ok) {
        const category = errorCategory(status, result.json);
        const retryAfter = parseRetryAfter(result.response.headers.get('retry-after'));
        attempts.push({
          attemptNumber, provider: 'openai', model, providerRequestId: result.response.headers.get('x-request-id'),
          status: 'FAILED', inputTokens: null, outputTokens: null, cachedTokens: null,
          latencyMs: result.latencyMs, finishReason: null, errorCategory: category,
        });
        lastError = category;
        if (!retryable(status, result.json) || attemptNumber >= maximumAttempts) break;
        if (retryAfter) await new Promise((resolve) => setTimeout(resolve, retryAfter));
        continue;
      }
      const usage = (result.json.usage || {}) as Record<string, unknown>;
      const details = (usage.input_tokens_details || {}) as Record<string, unknown>;
      const answer = parseStructuredAnswer(responseOutputText(result.json));
      const finishReason = typeof result.json.status === 'string' ? result.json.status : null;
      const providerRequestId = typeof result.json.id === 'string'
        ? result.json.id
        : result.response.headers.get('x-request-id');
      const attempt: ProviderAttempt = {
        attemptNumber, provider: 'openai', model, providerRequestId, status: 'SUCCESS',
        inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
        outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
        cachedTokens: typeof details.cached_tokens === 'number' ? details.cached_tokens : null,
        latencyMs: result.latencyMs, finishReason, errorCategory: null,
      };
      attempts.push(attempt);
      return {
        provider: 'openai', model, providerRequestId, answer,
        inputTokens: attempt.inputTokens, outputTokens: attempt.outputTokens,
        cachedTokens: attempt.cachedTokens, latencyMs: result.latencyMs,
        finishReason, attempts,
      };
    } catch (reason) {
      const category = errorCategory(status, reason);
      attempts.push({
        attemptNumber, provider: 'openai', model, providerRequestId: null,
        status: category === 'PROVIDER_TIMEOUT' ? 'TIMEOUT' : 'FAILED',
        inputTokens: null, outputTokens: null, cachedTokens: null,
        latencyMs: Date.now() - started, finishReason: null, errorCategory: category,
      });
      lastError = category;
      if (!retryable(status, reason) || attemptNumber >= maximumAttempts) break;
    }
  }
  const error = new Error(lastError) as Error & { attempts?: ProviderAttempt[] };
  error.attempts = attempts;
  throw error;
}

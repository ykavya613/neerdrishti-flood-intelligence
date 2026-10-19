/**
 * Meta Llama OpenAI-Compatible Client
 * Connects to Ollama or any OpenAI-compatible open-weight inference endpoint (e.g. Llama 3.2 3B).
 * Reads environment variables strictly on the server:
 *  - OPENAI_COMPATIBLE_BASE_URL (defaults to http://127.0.0.1:11434/v1)
 *  - OPENAI_COMPATIBLE_API_KEY (defaults to ollama)
 *  - OPENAI_COMPATIBLE_MODEL (defaults to llama3.2:3b)
 *  - LIVE_DATA_REFRESH_MINUTES (defaults to 30)
 */

export interface LlamaConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  refreshMinutes: number;
}

export function getLlamaConfig(): LlamaConfig {
  const rawBase = process.env.OPENAI_COMPATIBLE_BASE_URL || 'http://127.0.0.1:11434/v1';
  const cleanBase = rawBase.trim().replace(/\/+$/, '');
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY || 'ollama';
  const model = process.env.OPENAI_COMPATIBLE_MODEL || 'llama3.2:3b';
  const refreshMinutes = Math.max(1, parseInt(process.env.LIVE_DATA_REFRESH_MINUTES || '30', 10) || 30);

  return {
    baseUrl: cleanBase,
    apiKey,
    model,
    refreshMinutes,
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlamaChatResult {
  text: string;
  model: string;
  provider: string;
  latencyMs: number;
}

/**
 * Invokes Meta Llama using standard OpenAI-compatible /chat/completions protocol.
 */
export async function callLlamaChat(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    timeoutMs?: number;
    jsonMode?: boolean;
  }
): Promise<LlamaChatResult | null> {
  const config = getLlamaConfig();
  const endpoint = `${config.baseUrl}/chat/completions`;
  const timeoutMs = options?.timeoutMs || 12000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload: Record<string, any> = {
    model: config.model,
    messages,
    temperature: options?.temperature ?? 0.2,
  };

  if (options?.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'User-Agent': 'NeerDrishti-Llama-Client/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[LlamaClient] OpenAI-compatible endpoint returned status ${res.status}: ${res.statusText}`);
      return null;
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      console.warn('[LlamaClient] Empty message content in OpenAI-compatible response');
      return null;
    }

    return {
      text: content.trim(),
      model: config.model,
      provider: 'Meta Llama',
      latencyMs: Date.now() - startTime,
    };
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      console.warn(`[LlamaClient] Request timed out after ${timeoutMs}ms connecting to ${endpoint}`);
    } else {
      console.warn(`[LlamaClient] Could not reach Meta Llama endpoint at ${endpoint}:`, err?.message || err);
    }
    return null;
  }
}

/**
 * Pings the OpenAI-compatible endpoint to check operational availability.
 */
export async function pingLlama(timeoutMs = 2000): Promise<{ isHealthy: boolean; latencyMs: number; error?: string }> {
  const config = getLlamaConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    // Attempt standard /models probe first
    const modelsUrl = `${config.baseUrl}/models`;
    const res = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      return { isHealthy: true, latencyMs: Date.now() - start };
    }
  } catch {
    clearTimeout(timer);
  }

  // Fallback probe: quick single-token chat completion
  try {
    const pingController = new AbortController();
    const pingTimer = setTimeout(() => pingController.abort(), timeoutMs);
    const pingStart = Date.now();
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: pingController.signal,
    });
    clearTimeout(pingTimer);

    if (res.ok) {
      return { isHealthy: true, latencyMs: Date.now() - pingStart };
    }
    return { isHealthy: false, latencyMs: 0, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { isHealthy: false, latencyMs: 0, error: err?.message || 'Connection refused' };
  }
}

/**
 * Safely extracts and parses JSON from Meta Llama output, stripping code fences if present.
 */
export function extractJsonFromText(rawText: string): any {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return JSON.parse(cleaned.trim());
}

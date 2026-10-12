import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mockCall } from './mock.mjs';
import { compactEvidence, failure, normalizeEnvelope } from './shape.mjs';

export const isMock = () => process.env.QLOO_MODE === 'mock';
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
const TTL = positive(process.env.QLOO_CACHE_TTL_S, 21600) * 1000;
const cache = new Map();
const CACHE_LIMIT = 512;
const hash = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const credentialScope = () => hash(stable(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('QLOO_') && key !== 'QLOO_MODE'))));
let connection;

async function conn() {
  const scope = credentialScope();
  if (connection?.scope === scope) return connection.promise;
  if (connection) await closeQloo();
  const entry = { scope };
  connection = entry;
  entry.promise = (async () => {
    // Use the installed entry point and this Node executable, avoiding npx and
    // Windows shell shims. No dependency downloads occur at request time.
    const bin = fileURLToPath(new URL('./bin.js', import.meta.resolve('@qloo/qloo-harness')));
    const transport = new StdioClientTransport({ command: process.execPath, args: [bin, 'mcp'], env: process.env, stderr: 'pipe' });
    transport.stderr?.on('data', () => {});
    const client = new Client({ name: 'houselights', version: '0.6.0' });
    entry.client = client;
    client.onclose = () => { if (connection === entry) connection = undefined; };
    try { await client.connect(transport); return client; }
    catch (error) { await client.close().catch(() => {}); throw error; }
  })().catch(error => { if (connection === entry) connection = undefined; throw error; });
  return entry.promise;
}

export async function closeQloo() {
  const current = connection;
  connection = undefined;
  if (current?.client) await current.client.close().catch(() => {});
}

export function decodeToolResult(response, tool) {
  let raw = response?.structuredContent;
  if (!raw) for (const part of response?.content || []) {
    if (part.type !== 'text') continue;
    try { raw = JSON.parse(part.text); break; } catch { /* another block may contain JSON */ }
  }
  if (response?.isError && raw?.status !== 'error') return failure('MCP_ERROR', 'The Qloo tool could not complete the request.');
  return normalizeEnvelope(raw, tool);
}

const liveCall = async (tool, args, { signal, timeoutMs } = {}) => {
  const client = await conn();
  signal?.throwIfAborted();
  return decodeToolResult(await client.callTool(
    { name: `qloo_${tool}`, arguments: args }, undefined,
    { timeout: timeoutMs || 45000, resetTimeoutOnProgress: false, signal },
  ), tool);
};

async function timedCall(execute, tool, args, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => execute(tool, args, { signal: controller.signal, timeoutMs })),
      new Promise((_, reject) => { timer = setTimeout(() => {
        const error = new Error('Qloo workflow exceeded its time limit.');
        error.name = 'TimeoutError';
        controller.abort(error);
        reject(error);
      }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

// Budgets count workflow attempts including retries. A workflow may internally
// issue multiple HTTP requests; this is not the event's provider quota meter.
export class Run {
  receipts = [];
  used = 0;
  constructor({ budget = 30, emit = () => {}, mode = isMock() ? 'mock' : 'live', execute,
    cacheStore = cache, ttl = TTL, now = Date.now, timeoutMs = 45000,
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    this.budget = Math.max(0, Math.floor(positive(budget, 30)));
    this.emit = emit;
    this.mode = mode;
    this.execute = execute || (mode === 'mock' ? mockCall : liveCall);
    this.cache = cacheStore;
    this.ttl = ttl;
    this.now = now;
    this.delay = delay;
    this.timeoutMs = Math.max(1, positive(timeoutMs, 45000));
    this.scope = `${mode}:${credentialScope()}`;
  }

  async call(tool, args, why) {
    const key = hash(this.scope + tool + stable(args));
    const t0 = this.now(), hit = this.cache.get(key);
    let env, cached = false, fetchedAt, attempts = 0;
    if (hit && t0 - hit.at < this.ttl) {
      env = structuredClone(hit.env); cached = true; fetchedAt = hit.at;
    } else {
      if (hit) this.cache.delete(key);
      env = failure('BUDGET', 'Per-memo workflow attempt budget exhausted.');
      while (attempts < 3 && this.used < this.budget) {
        this.used++; attempts++;
        try { env = normalizeEnvelope(await timedCall(this.execute, tool, args, this.timeoutMs), tool); }
        catch (error) { env = error?.name === 'TimeoutError' || error?.code === -32001
          ? failure('TIMEOUT', 'The Qloo workflow exceeded its time limit. Retry the memo when the service is available.')
          : failure('TRANSPORT', 'The Qloo harness connection failed. Check installation and server credentials.'); }
        if (env.status !== 'error' || !env.error?.retryable || attempts >= 3 || this.used >= this.budget) break;
        await this.delay(700 * attempts);
      }
      fetchedAt = this.now();
      if (['ok', 'empty', 'partial'].includes(env.status)) {
        if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { at: fetchedAt, env: structuredClone(env) });
      }
    }
    const evidence = compactEvidence(tool, env);
    const source = this.mode === 'mock' || env.mock === true ? 'synthetic' : 'qloo';
    const provenance = env.provenance ? Object.fromEntries(['source', 'endpoint', 'documentation'].flatMap(key =>
      typeof env.provenance[key] === 'string' ? [[key, env.provenance[key].slice(0, 500)]] : [])) : {};
    const receipt = {
      id: `r${this.receipts.length + 1}`, tool, args: structuredClone(args), why,
      status: env.status, summary: env.summary, count: env.result_count, cached,
      ms: this.now() - t0, attempts, source, fetchedAt: new Date(fetchedAt).toISOString(),
      observedAt: new Date(this.now()).toISOString(), evidence, provenance,
      digest: `sha256:${hash(stable({ tool, args, source, fetchedAt, status: env.status, evidence }))}`,
    };
    this.receipts.push(receipt);
    this.emit({ type: 'receipt', receipt, budget: { used: this.used, max: this.budget } });
    return { env, receipt };
  }

}

/**
 * @fileoverview Lightweight in-process HTTP metrics.
 *
 * Records request counts, error counts, status-class and per-method tallies,
 * in-flight gauge, and a bounded latency reservoir for percentile estimates.
 * No external dependency, bounded memory (a fixed-size ring buffer), and zero
 * impact on the request path beyond a `res.on('finish')` hook.
 *
 * Counters are process-local. On a multi-instance / restart they reset — this
 * is meant for a cheap, always-available `/metrics` scrape and quick health
 * triage, not long-term time-series storage (use Prometheus/Grafana for that,
 * scraping the Prometheus output below).
 *
 * @module middleware/metrics
 */

/** Max latency samples retained for percentile math (bounded memory). */
const RESERVOIR_SIZE = 2048;

/** Ops endpoints we don't want polluting business-traffic metrics. */
const SKIP_PREFIXES = ['/health', '/metrics', '/favicon'];

const startedAt = Date.now();

const state = {
  total: 0,
  errors: 0, // status >= 500
  clientErrors: 0, // 400..499
  inFlight: 0,
  byStatusClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 },
  byMethod: Object.create(null),
  sumLatencyMs: 0,
  maxLatencyMs: 0,
  // Ring buffer of recent latencies.
  latencies: new Array(RESERVOIR_SIZE),
  latencyCount: 0, // total samples ever written (for ring index)
};

/**
 * Whether a path should be excluded from metrics.
 * @param {string} path
 * @returns {boolean}
 */
function isSkipped(path) {
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p));
}

/**
 * Express middleware that records timing + outcome for each request.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function metricsMiddleware(req, res, next) {
  if (isSkipped(req.path)) return next();

  const start = process.hrtime.bigint();
  state.inFlight += 1;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    state.inFlight = Math.max(0, state.inFlight - 1);
    state.total += 1;
    state.sumLatencyMs += durationMs;
    if (durationMs > state.maxLatencyMs) state.maxLatencyMs = durationMs;

    // Ring-buffer write.
    state.latencies[state.latencyCount % RESERVOIR_SIZE] = durationMs;
    state.latencyCount += 1;

    const method = req.method || 'UNKNOWN';
    state.byMethod[method] = (state.byMethod[method] || 0) + 1;

    const s = res.statusCode;
    if (s >= 500) { state.errors += 1; state.byStatusClass['5xx'] += 1; }
    else if (s >= 400) { state.clientErrors += 1; state.byStatusClass['4xx'] += 1; }
    else if (s >= 300) { state.byStatusClass['3xx'] += 1; }
    else if (s >= 200) { state.byStatusClass['2xx'] += 1; }
    else { state.byStatusClass.other += 1; }
  });

  next();
}

/**
 * Compute a percentile from the current reservoir.
 * @param {number[]} sorted - ascending-sorted latency samples
 * @param {number} p - percentile in [0,100]
 * @returns {number} latency in ms (0 when no samples)
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)] * 100) / 100;
}

/**
 * Snapshot the current metrics as a plain object.
 * @returns {object}
 */
function snapshot() {
  const sampleCount = Math.min(state.latencyCount, RESERVOIR_SIZE);
  const samples = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const v = state.latencies[i];
    if (typeof v === 'number') samples.push(v);
  }
  samples.sort((a, b) => a - b);

  const mem = process.memoryUsage();
  return {
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    requests_total: state.total,
    requests_in_flight: state.inFlight,
    errors_5xx_total: state.errors,
    errors_4xx_total: state.clientErrors,
    error_rate: state.total > 0 ? Math.round((state.errors / state.total) * 10000) / 10000 : 0,
    status_class: { ...state.byStatusClass },
    by_method: { ...state.byMethod },
    latency_ms: {
      avg: state.total > 0 ? Math.round((state.sumLatencyMs / state.total) * 100) / 100 : 0,
      max: Math.round(state.maxLatencyMs * 100) / 100,
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
      samples: samples.length,
    },
    memory_mb: {
      rss: Math.round((mem.rss / 1048576) * 100) / 100,
      heap_used: Math.round((mem.heapUsed / 1048576) * 100) / 100,
      heap_total: Math.round((mem.heapTotal / 1048576) * 100) / 100,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Render the snapshot in Prometheus text exposition format.
 * @returns {string}
 */
function prometheus() {
  const s = snapshot();
  const lines = [];
  const push = (name, type, help, value, labels = '') => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    lines.push(`${name}${labels} ${value}`);
  };

  push('msrm_uptime_seconds', 'gauge', 'Process uptime in seconds.', s.uptime_seconds);
  push('msrm_requests_total', 'counter', 'Total HTTP requests observed.', s.requests_total);
  push('msrm_requests_in_flight', 'gauge', 'Currently in-flight HTTP requests.', s.requests_in_flight);
  push('msrm_errors_5xx_total', 'counter', 'Total 5xx responses.', s.errors_5xx_total);
  push('msrm_errors_4xx_total', 'counter', 'Total 4xx responses.', s.errors_4xx_total);

  // status class as labelled series
  lines.push('# HELP msrm_responses_by_class Responses grouped by status class.');
  lines.push('# TYPE msrm_responses_by_class counter');
  for (const [cls, n] of Object.entries(s.status_class)) {
    lines.push(`msrm_responses_by_class{class="${cls}"} ${n}`);
  }

  push('msrm_request_latency_ms_avg', 'gauge', 'Average request latency (ms).', s.latency_ms.avg);
  push('msrm_request_latency_ms_p95', 'gauge', 'p95 request latency (ms).', s.latency_ms.p95);
  push('msrm_request_latency_ms_p99', 'gauge', 'p99 request latency (ms).', s.latency_ms.p99);
  push('msrm_memory_rss_mb', 'gauge', 'Resident set size (MB).', s.memory_mb.rss);

  return lines.join('\n') + '\n';
}

/** Reset all counters — used in tests. */
function reset() {
  state.total = 0;
  state.errors = 0;
  state.clientErrors = 0;
  state.inFlight = 0;
  state.byStatusClass = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 };
  state.byMethod = Object.create(null);
  state.sumLatencyMs = 0;
  state.maxLatencyMs = 0;
  state.latencies = new Array(RESERVOIR_SIZE);
  state.latencyCount = 0;
}

module.exports = { metricsMiddleware, snapshot, prometheus, reset };

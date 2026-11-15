export type LangfuseClientErrorKind =
  | 'configuration'
  | 'unauthorized'
  | 'forbidden'
  | 'v4-required'
  | 'invalid-query'
  | 'url-too-long'
  | 'rate-limit'
  | 'cancelled'
  | 'timeout'
  | 'server'
  | 'network'
  | 'malformed-response'
  | 'unexpected';

export class LangfuseClientError extends Error {
  constructor(
    readonly kind: LangfuseClientErrorKind,
    message: string,
    readonly status?: number,
    readonly retryAfter?: string
  ) {
    super(message);
    this.name = 'LangfuseClientError';
  }
}

const messages: Record<LangfuseClientErrorKind, string> = {
  configuration: 'Invalid Langfuse configuration. Configure a Grafana data proxy URL.',
  unauthorized: 'Invalid Langfuse credentials. Check the public and secret keys.',
  forbidden: 'Insufficient Langfuse permissions. Check access to this project.',
  'v4-required': 'Langfuse v4 is required; the Observations v2 endpoint is unavailable.',
  'invalid-query': 'Invalid Langfuse query or filter. Check the query definition.',
  'url-too-long': 'The query URL is too long. Reduce filters or shorten multi-value selections.',
  'rate-limit': 'Langfuse rate limit reached. Retry manually later; no automatic retry was scheduled.',
  cancelled: 'The Langfuse request was cancelled.',
  timeout: 'The Langfuse request timed out. Reduce the time range or result limit.',
  server: 'The Langfuse server failed. Try again later or contact the server administrator.',
  network: 'Cannot reach Langfuse through the Grafana proxy. Check the URL, network, and proxy settings.',
  'malformed-response': 'Langfuse returned an incompatible response. Check server and plugin compatibility.',
  unexpected: 'The Langfuse query failed.',
};

export function queryErrorMessage(error: unknown): string {
  if (!(error instanceof LangfuseClientError)) {
    return messages.unexpected;
  }
  const message = messages[error.kind] ?? messages.unexpected;
  // Never render arbitrary upstream headers or error.message, including parser excerpts.
  const retryAfter = safeRetryAfter(error.retryAfter);
  if (error.kind === 'rate-limit') {
    return retryAfter
      ? `${message} Retry-After: ${retryAfter}.`
      : `${message} Retry timing is unavailable from the Grafana proxy.`;
  }
  return message;
}

export function connectionErrorMessage(error: unknown): string {
  if (
    error instanceof LangfuseClientError &&
    ['unauthorized', 'forbidden', 'v4-required', 'configuration'].includes(error.kind)
  ) {
    return queryErrorMessage(error);
  }
  return 'Cannot validate the Langfuse data source.';
}

export function safeRetryAfter(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (/^\d{1,10}$/.test(value)) {
    return `${Number(value)} seconds`;
  }
  // Only accept the HTTP-date wire format, not permissive Date.parse inputs.
  if (
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      value
    )
  ) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toUTCString() : undefined;
  }
  return undefined;
}

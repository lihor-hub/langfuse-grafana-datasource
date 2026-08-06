export type LangfuseClientErrorKind =
  'unauthorized' | 'v4-required' | 'cancelled' | 'timeout' | 'network' | 'unexpected';

export class LangfuseClientError extends Error {
  constructor(
    readonly kind: LangfuseClientErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'LangfuseClientError';
  }
}

export function connectionErrorMessage(error: unknown): string {
  if (error instanceof LangfuseClientError) {
    switch (error.kind) {
      case 'unauthorized':
        return 'Invalid Langfuse credentials. Check the public and secret keys.';
      case 'v4-required':
        return 'Langfuse v4 is required; the Observations v2 endpoint is unavailable.';
      case 'unexpected':
      case 'cancelled':
      case 'timeout':
      case 'network':
        break;
    }
  }

  return 'Cannot validate the Langfuse data source.';
}

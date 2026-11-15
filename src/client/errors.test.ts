import { connectionErrorMessage, LangfuseClientError, queryErrorMessage } from './errors';

describe('safe query error messages', () => {
  it.each([
    ['configuration', /configure|configuration/i],
    ['unauthorized', /credentials/i],
    ['forbidden', /permission/i],
    ['v4-required', /v4/i],
    ['invalid-query', /query|filter/i],
    ['url-too-long', /shorten|reduce/i],
    ['rate-limit', /rate limit/i],
    ['timeout', /timed out/i],
    ['cancelled', /cancelled/i],
    ['server', /server/i],
    ['network', /network|proxy/i],
    ['malformed-response', /incompatible/i],
    ['unexpected', /failed/i],
  ] as const)('renders %s without trusting an upstream message', (kind, expected) => {
    const error = new LangfuseClientError(kind, 'Authorization: synthetic-secret input=private-payload');
    expect(queryErrorMessage(error)).toMatch(expected);
    expect(queryErrorMessage(error)).not.toMatch(/synthetic-secret|private-payload|Authorization/);
  });

  it('does not trust a caller-supplied Retry-After string', () => {
    expect(
      queryErrorMessage(new LangfuseClientError('rate-limit', 'synthetic-secret', 429, 'synthetic-secret'))
    ).not.toContain('synthetic-secret');
  });

  it('does not echo unknown errors, even JSON parser excerpts', () => {
    expect(queryErrorMessage(new SyntaxError('private-payload'))).toBe('The Langfuse query failed.');
    expect(queryErrorMessage({ message: 'synthetic-secret' })).toBe('The Langfuse query failed.');
    expect(connectionErrorMessage(new Error('synthetic-secret'))).toBe('Cannot validate the Langfuse data source.');
  });
});

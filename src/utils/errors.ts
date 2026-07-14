export function getUserFacingError(
  error: unknown,
  fallbackMessage: string,
  allowedMessages: readonly string[],
): string {
  if (
    error instanceof Error &&
    allowedMessages.some((message) => error.message.startsWith(message))
  ) {
    return error.message;
  }

  console.error(error);
  return fallbackMessage;
}

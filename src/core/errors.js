// UserError marks a message that is safe and useful to show to the user.
// Anything else (library stack traces, internal errors) is replaced by a
// generic message in web responses so internals never leak.
export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
    this.safe = true;
  }
}

export function safeMessage(err) {
  if (err && err.safe) return err.message;
  return 'Something went wrong on the server. Check the server logs for details.';
}

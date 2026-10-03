// Put external API calls and other side effects in activities. Make them
// idempotent because Temporal may retry them after failures.
export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

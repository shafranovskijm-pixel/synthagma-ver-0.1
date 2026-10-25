/** Keep guest calls anonymous even when the SDK's public key differs from the Edge alias.
 * An explicit empty header survives FunctionsClient merging and fetchWithAuth.
 * Authenticated calls keep the SDK's original user bearer and its strict failures.
 */
export function supportChatInvocationHeaders(hasAuthenticatedUser: boolean): Record<string, string> | undefined {
  return hasAuthenticatedUser ? undefined : { Authorization: '' };
}

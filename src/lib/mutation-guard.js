import "server-only";

import { enforceSameOriginForMutation } from "@/lib/request-security";

export { enforceSameOriginForMutation as guardMutationRequest } from "@/lib/request-security";

/**
 * Run CSRF guard before handler body; returns a Response to short-circuit or null.
 */
export function applyMutationCsrfGuard(request) {
  return enforceSameOriginForMutation(request);
}

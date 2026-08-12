import { NextResponse } from 'next/server'

/**
 * The one error shape every `/api/v1` handler returns (MOBILE_APP_PLAN D8).
 *
 * Clients branch on `code` and never on prose — a client forced to match on wording
 * has turned our copy into API, and we could then never reword it. Keeping the
 * envelope here rather than inline in each handler is the point: the set of codes is
 * published contract, and a contract scattered across route files drifts.
 *
 * `retryable` was in D8's first draft and is deliberately absent. It reads as
 * obviously useful and is ambiguous in practice — a 401 is retryable after
 * re-authenticating and not before — so it would have to encode *when*, which is the
 * client's call. Retryability is derivable from the status class.
 */

/**
 * Published contract. Adding a member is additive; renaming or removing one is a
 * breaking change, so extend deliberately rather than inventing codes at call sites.
 */
export type ApiErrorCode =
  /** Body was not parseable JSON. */
  | 'invalid_request_body'
  /** Body parsed, but a required field was missing or the wrong type. */
  | 'invalid_request'
  /** Email/password did not match. Deliberately not distinguishable from unknown email. */
  | 'invalid_credentials'
  /** No `Authorization: Bearer <token>` header, or it was malformed. */
  | 'missing_bearer_token'
  /** A session is required and none was presented, or it was expired/unknown. */
  | 'not_authenticated'

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode
    /** Written for the person who will read it, not the developer. */
    message: string
    /** Optional affordance the client can offer, e.g. 'update_token'. */
    action?: string
  }
}

/** Builds a `/api/v1` error response. The only way handlers should report failure. */
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  action?: string
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message, ...(action && { action }) } }, { status })
}

// The errors `wf` maps to exit codes (spec *Verbs*, all verbs): 1 when an invariant is violated,
// 2 for usage or environment errors. Anything else that escapes is a bug and also exits 2.

export const EXIT = Object.freeze({ OK: 0, INVARIANT: 1, USAGE: 2 })

export class WfError extends Error {
  constructor(code, message, { details = [], warnings = [] } = {}) {
    super(message)
    this.name = "WfError"
    this.code = code
    this.details = details
    // Printed even though the verb failed (a stale lock it broke before refusing).
    this.warnings = warnings
  }
}

export const usageError = (message, opts) => new WfError(EXIT.USAGE, message, opts)

/**
 * An invariant the verb refuses to break (exit 1). The message states the invariant; `fix` is the
 * command (or commands, best first) that makes the verb possible.
 */
export const invariantError = (message, { fix = [] } = {}) =>
  new WfError(EXIT.INVARIANT, message, {
    details: [fix].flat().filter(Boolean).map((f, i) => `${i === 0 ? "fix" : "or"}: ${f}`),
  })

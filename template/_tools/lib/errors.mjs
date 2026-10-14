// The errors `wf` maps to exit codes (spec *Verbs*, all verbs): 1 when an invariant is violated,
// 2 for usage or environment errors. Anything else that escapes is a bug and also exits 2.

export const EXIT = Object.freeze({ OK: 0, INVARIANT: 1, USAGE: 2 })

export class WfError extends Error {
  constructor(code, message, { details = [] } = {}) {
    super(message)
    this.name = "WfError"
    this.code = code
    this.details = details
  }
}

export const usageError = (message, opts) => new WfError(EXIT.USAGE, message, opts)

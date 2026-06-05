// Test-environment shim (loaded via vitest.config setupFiles).
//
// On Windows, Vitest can raise `write EPIPE` while tearing down its concurrent
// worker processes: a buffered stdout/stderr write lands after the IPC pipe has
// closed. It surfaces as an uncaughtException (not a stream "error" event) and,
// left unhandled, makes the whole run exit non-zero even though every test passed.
//
// This is purely a harness artifact — the product never runs under Vitest — so we
// swallow that one specific error and rethrow anything else so real failures still
// crash the run.
const ignoreEpipe = (err: NodeJS.ErrnoException): void => {
  if (err.code !== "EPIPE") throw err;
};

process.stdout.on("error", ignoreEpipe);
process.stderr.on("error", ignoreEpipe);
process.on("uncaughtException", ignoreEpipe);

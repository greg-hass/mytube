/**
 * Minimal server-side logger.
 * Keeps production logging auditable without console.log littering the codebase.
 *
 * ast-grep-ignore: no-console-except-error-js (logger is the approved console wrapper)
 */
const logger = {
	info: (...args) => console.log(...args),
	error: (...args) => console.error(...args),
	warn: (...args) => console.warn(...args),
};

module.exports = logger;

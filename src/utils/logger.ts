/**
 * RblxLogger provides simple logging utilities for the RblxEcs framework.
 *
 * Features:
 * - Conditional logging based on debug mode.
 * - Automatic timestamping of messages.
 * - Custom formatting for easier identification in output.
 *
 * Usage:
 * Enable or disable debug output by modifying `inDebugMode`.
 * Use `log` to print formatted messages to the console.
 */
export namespace RblxLogger {
    export namespace Configuration {
        export let inDebugMode: boolean = false;
    }

    /**
     * Logs a formatted message to the console if debug mode is enabled.
     *
     * @param context - A string indicating the source or context of the log message.
     * @param message - The log message to output.
     * 
     * Example output:
     * [12:34:56:AM] [LOG] [MyContext] — Initialization succeeded.
     */
    export function logOutput(context: string, message: string) {
        if (Configuration.inDebugMode) {
            const timestamp = os.date("%I:%M:%S %p");
            print(`[${timestamp}] [LOG] [${context}] — ${message}`);
        }
    }

    /**
     * Logs a formatted warning message to the console if debug mode is enabled.
     *
     * @param context - A string indicating the source or context of the warning.
     * @param message - The warning message to output.
     * 
     * Example output:
     * [12:34:56:AM] [WARN] [MyContext] — Unexpected value detected.
     */
    export function warnOutput(context: string, message: string) {
        if (Configuration.inDebugMode) {
            const timestamp = os.date("%I:%M:%S:%p");
            print(`[${timestamp}] [WARN] [${context}] — ${message}`);
        }
    }

    /**
     * Logs a formatted error message to the console if debug mode is enabled.
     *
     * @param context - A string indicating the source or context of the error.
     * @param message - The error message to output.
     * 
     * Example output:
     * [12:34:56:AM] [ERROR] [MyContext] — Failed to load asset.
     */
    export function errorOutput(context: string, message: string) {
        if (Configuration.inDebugMode) {
            const timestamp = os.date("%I:%M:%S:%p");
            print(`[${timestamp}] [ERROR] [${context}] — ${message}`);
        }
    }
}
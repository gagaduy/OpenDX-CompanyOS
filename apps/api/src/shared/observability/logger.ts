// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "pretty" | "json";

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const levelOrder = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} satisfies Record<LogLevel, number>;
const sensitiveKeys =
  /secret|token|cookie|csrf|password|authorization|email|phone|address|payload|objectKey/i;

export function createLogger(options: {
  readonly format: LogFormat;
  readonly level: LogLevel;
  readonly sink?: (line: string) => void;
}): Logger {
  const sink = options.sink ?? ((line) => console.log(line));

  function write(
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> = {},
  ): void {
    if (levelOrder[level] < levelOrder[options.level]) return;
    const safeFields = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        sensitiveKeys.test(key) ? "[REDACTED]" : value,
      ]),
    );
    sink(
      options.format === "json"
        ? JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            ...safeFields,
          })
        : `${level.toUpperCase()} ${message}`,
    );
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}

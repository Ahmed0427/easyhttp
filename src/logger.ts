export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, context?: string): void {
  const prefix = context ? `[${context}]` : "";
  const line = `${timestamp()} [${level}]${prefix} ${message}`;
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, context?: string) => log("INFO", message, context),
  warn: (message: string, context?: string) => log("WARN", message, context),
  error: (message: string, context?: string) => log("ERROR", message, context),
  debug: (message: string, context?: string) => log("DEBUG", message, context),
};

import fs from "fs";
import os from "os";
import path from "path";

// Path for storing debug log
export const debugLogPath = path.join(os.tmpdir(), "untun-mcp-debug.log");

// Path for storing tunnel information
export const tunnelStoragePath = path.join(os.tmpdir(), "untun-tunnels.json");

// Helper function for logging to stderr instead of stdout
export const log = (...args: any[]): void => console.error(...args);

// Function to log messages to debug file
export const debugLog = (message: string): void => {
  fs.appendFileSync(debugLogPath, `${new Date().toISOString()}: ${message}\n`);
};

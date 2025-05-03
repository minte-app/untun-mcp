import { exec, execSync } from "child_process";
import { log, debugLog } from "./logger.js";
import { ProcessInfo } from "./types.js";

/**
 * Finds all PIDs of processes matching a pattern
 */
export const findPidsByPattern = (pattern: string): string[] => {
  try {
    // Use different grep commands for macOS vs Linux
    const grepCmd =
      process.platform === "darwin"
        ? `ps aux | grep "${pattern}" | grep -v grep | awk '{print $2}'`
        : `ps aux | grep "${pattern}" | grep -v grep | awk '{print $2}'`;

    const output = execSync(grepCmd).toString().trim();
    return output.split("\n").filter(Boolean);
  } catch (e) {
    return [];
  }
};

/**
 * Kills a process by PID
 */
export const killPid = (pid: string, signal = "TERM"): boolean => {
  try {
    log(`Killing PID ${pid} with signal ${signal}`);
    execSync(`kill -${signal} ${pid}`, { stdio: "ignore" });
    return true;
  } catch (e) {
    const error = e as Error;
    log(`Failed to kill PID ${pid}: ${error.message}`);
    return false;
  }
};

/**
 * Gets all cloudflared processes with details
 */
export const getCloudflaredDetails = (): ProcessInfo[] => {
  try {
    const cmd = "ps aux | grep cloudflared | grep -v grep";
    const output = execSync(cmd).toString().trim();

    // Parse the output to get PID and full command line
    return output.split("\n").map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[1];
      // Reconstruct the command part (joining all elements from index 10 to the end)
      const command = parts.slice(10).join(" ");
      const user = parts[0];

      return { pid, command, user, line };
    });
  } catch (e) {
    return [];
  }
};

/**
 * Forcefully kills all tunnel processes
 */
export const killTunnelProcesses = (): string => {
  log("Forcefully killing all tunnel processes");
  debugLog("Forcefully killing all tunnel processes");

  const results: string[] = [];

  // Find all cloudflared processes
  const cloudflaredDetails = getCloudflaredDetails();

  // Filter to get only cloudflared processes that were launched by untun
  // They typically have 'node-untun' in the path and/or '--url http://' in the command
  const untunCloudflaredProcesses = cloudflaredDetails.filter((proc) => {
    return (
      (proc.command.includes("node-untun") ||
        proc.command.includes("--url http") ||
        proc.command.match(/tunnel --url/i)) &&
      !proc.command.includes("--token")
    ); // Exclude processes using an authentication token
  });

  if (untunCloudflaredProcesses.length > 0) {
    results.push(
      `Found ${untunCloudflaredProcesses.length} untun-managed cloudflared processes`,
    );

    // Log the processes we found for debugging
    untunCloudflaredProcesses.forEach((proc) => {
      results.push(
        `Will terminate: PID ${proc.pid} (${proc.command.slice(0, 50)}...)`,
      );
    });

    // Try to kill each PID with SIGTERM first
    untunCloudflaredProcesses.forEach((proc) => {
      const killed = killPid(proc.pid, "TERM");
      results.push(
        `Kill TERM PID ${proc.pid}: ${killed ? "Success" : "Failed"}`,
      );
    });

    // Wait a moment for processes to terminate
    try {
      execSync("sleep 0.5");
    } catch (e) {}

    // Find which ones remain and use SIGKILL
    const remainingDetails = getCloudflaredDetails();
    const remainingPids = untunCloudflaredProcesses
      .map((proc) => proc.pid)
      .filter((pid) => remainingDetails.some((p) => p.pid === pid));

    if (remainingPids.length > 0) {
      results.push(
        `${remainingPids.length} cloudflared processes still running after SIGTERM`,
      );

      // Force kill each remaining process
      remainingPids.forEach((pid) => {
        const killed = killPid(pid, "KILL");
        results.push(`Kill KILL PID ${pid}: ${killed ? "Success" : "Failed"}`);
      });
    }
  } else {
    results.push("No untun-managed cloudflared processes found to kill");
  }

  // Also try to kill untun processes directly
  try {
    const untunPids = findPidsByPattern("untun tunnel");
    if (untunPids.length > 0) {
      results.push(`Found ${untunPids.length} untun tunnel processes`);
      untunPids.forEach((pid) => {
        const killed = killPid(pid, "TERM");
        results.push(
          `Kill TERM untun PID ${pid}: ${killed ? "Success" : "Failed"}`,
        );
      });

      // Force kill if TERM didn't work
      try {
        execSync("sleep 0.3");
        const remainingUntunPids = findPidsByPattern("untun tunnel");
        remainingUntunPids.forEach((pid) => {
          const killed = killPid(pid, "KILL");
          results.push(
            `Kill KILL untun PID ${pid}: ${killed ? "Success" : "Failed"}`,
          );
        });
      } catch (e) {}
    } else {
      results.push("No untun processes found");
    }
  } catch (e) {
    const error = e as Error;
    results.push(`Error killing untun processes: ${error.message}`);
  }

  // Final check to see if our cloudflared processes are gone
  try {
    const finalUntunCloudflared = getCloudflaredDetails().filter((proc) => {
      return (
        (proc.command.includes("node-untun") ||
          proc.command.includes("--url http") ||
          proc.command.match(/tunnel --url/i)) &&
        !proc.command.includes("--token")
      );
    });

    if (finalUntunCloudflared.length > 0) {
      const details = finalUntunCloudflared
        .map((p) => `PID ${p.pid}: ${p.command.slice(0, 30)}...`)
        .join("\n");
      results.push(
        `WARNING: ${finalUntunCloudflared.length} untun cloudflared processes still running:\n${details}`,
      );
    } else {
      results.push("All untun cloudflared processes successfully terminated");
    }
  } catch (e) {
    // No processes found is good
    const error = e as Error;
    results.push(`Error in final check: ${error.message}`);
  }

  return results.join("\n");
};

/**
 * Helper function to close a specific tunnel by URL without affecting others
 */
export const closeSpecificTunnel = async (
  url: string,
  pid?: number,
): Promise<string> => {
  const results: string[] = [];

  log(`Attempting to close specific tunnel for URL: ${url}, PID: ${pid}`);

  // Function to kill a specific process
  const killProcess = (targetPid: string, signal = "TERM"): boolean => {
    try {
      log(`Killing specific PID ${targetPid} with signal ${signal}`);
      execSync(`kill -${signal} ${targetPid}`, { stdio: "ignore" });
      results.push(`✓ Killed process ${targetPid} with ${signal}`);
      return true;
    } catch (e) {
      const error = e as Error;
      results.push(`✗ Failed to kill process ${targetPid}: ${error.message}`);
      return false;
    }
  };

  // Kill the main untun process if PID is provided
  let mainProcessKilled = false;
  if (pid) {
    try {
      // Check if process exists first
      try {
        execSync(`ps -p ${pid}`);
        mainProcessKilled = killProcess(pid.toString());
      } catch (e) {
        results.push(`Process ${pid} not found (might have exited already)`);
      }
    } catch (error) {
      const err = error as Error;
      results.push(`Error checking/killing main process: ${err.message}`);
    }

    // Only look for cloudflared processes with the specific parent PID
    // This ensures we only kill the exact cloudflared process associated with this tunnel
    try {
      // Find the child processes of the main process
      const pgrep = `pgrep -P ${pid}`;
      let childPids: string[] = [];

      try {
        const childPidsOutput = execSync(pgrep).toString().trim();
        if (childPidsOutput) {
          childPids = childPidsOutput.split("\n").filter(Boolean);
        }
      } catch (e) {
        // No child processes found, which might be normal
        results.push(`No child processes found for PID ${pid}`);
      }

      // If we found child processes, check which ones are cloudflared
      if (childPids.length > 0) {
        results.push(
          `Found ${childPids.length} child processes for PID ${pid}`,
        );

        for (const childPid of childPids) {
          try {
            // Check if this process is a cloudflared process
            const psCmd = `ps -p ${childPid} -o command=`;
            const processCmd = execSync(psCmd).toString().trim();

            if (processCmd.includes("cloudflared")) {
              results.push(`Found cloudflared child process: ${childPid}`);
              killProcess(childPid);
            }
          } catch (e) {
            // Process might have exited already
          }
        }
      }

      return results.join("\n");
    } catch (error) {
      const err = error as Error;
      results.push(`Error finding/killing child processes: ${err.message}`);
    }
  } else {
    // If no PID is provided, fall back to URL-based matching but with a warning
    results.push(
      "Warning: No PID provided, trying to match by URL which may affect other tunnels",
    );

    try {
      // Clean the URL for matching (remove protocol, only use host:port)
      const cleanUrl = url.replace(/^https?:\/\//, "");

      // Find cloudflared processes that match this URL
      const cmd = `ps aux | grep cloudflared | grep "${cleanUrl}" | grep -v grep`;
      let matchingProcesses: Array<{ pid: string; cmd: string }> = [];

      try {
        const output = execSync(cmd).toString().trim();
        if (output) {
          matchingProcesses = output
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const parts = line.trim().split(/\s+/);
              return { pid: parts[1], cmd: parts.slice(10).join(" ") };
            });
        }
      } catch (e) {
        // If grep returns non-zero (no matches), that's fine
        results.push("No matching cloudflared processes found");
      }

      // Kill each matching cloudflared process
      if (matchingProcesses.length > 0) {
        results.push(
          `Found ${matchingProcesses.length} cloudflared processes for URL ${cleanUrl}`,
        );

        for (const proc of matchingProcesses) {
          results.push(
            `Attempting to kill cloudflared process ${proc.pid} (${proc.cmd.slice(0, 30)}...)`,
          );
          killProcess(proc.pid);
        }
      }
    } catch (error) {
      const err = error as Error;
      results.push(
        `Error finding/killing cloudflared processes: ${err.message}`,
      );
    }
  }

  return results.join("\n");
};

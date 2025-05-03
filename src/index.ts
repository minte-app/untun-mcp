#!/usr/bin/env node

import os from "os";
import { exec, execSync } from "child_process";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Import our modules
import {
  log,
  debugLog,
  debugLogPath,
  tunnelStoragePath,
} from "./lib/logger.js";
import { killTunnelProcesses, closeSpecificTunnel } from "./lib/processes.js";
import { activeTunnels, saveTunnels, loadTunnels } from "./lib/tunnels.js";
import { TunnelInfo } from "./lib/types.js";

// Log the debug file location
log(`Debug logs available at: ${debugLogPath}`);
log(`Tunnel storage file: ${tunnelStoragePath}`);
debugLog("MCP Server started");

// Load existing tunnels when starting
loadTunnels();

// Create MCP server instance
const server = new McpServer(
  {
    name: "Untun Tunnel Manager",
    version: "1.0.1",
    description: "Create and manage secure tunnels to local servers with ease.",
  },
  {
    capabilities: {
      logging: {},
      tools: {
        tunnel_management: {},
        process_monitoring: {},
      },
    },
  },
);

// Define 'start_tunnel' tool
server.tool(
  "start_tunnel",
  `Creates a secure tunnel from a public internet address to your local server.
  
  This tool will:
  - Start an untun tunnel process connecting to your specified local URL
  - Return a public URL that can be used to access your local server
  - Allow you to name your tunnel for easier management
  
  After starting a tunnel, wait a few seconds and use 'list_tunnels' to check its status and get the public URL.`,
  {
    url: z
      .string()
      .url()
      .describe("The local URL to expose (e.g., http://localhost:3000)"),
    name: z
      .string()
      .optional()
      .describe(
        "Optional custom name for the tunnel. If not provided, 'default' will be used.",
      ),
  },
  async ({ url, name = "default" }) => {
    // Check if tunnel with this name already exists
    if (activeTunnels.has(name)) {
      return {
        content: [
          {
            type: "text",
            text: `Tunnel with name "${name}" is already running. Please stop it first or use a different name.`,
          },
        ],
      };
    }

    try {
      log(`Starting tunnel to ${url} with name "${name}"`);
      debugLog(`Starting tunnel to ${url} with name "${name}"`);

      // Start the tunnel process immediately (non-blocking)
      const command = `npx untun tunnel ${url}`;
      log(`Executing command: ${command}`);

      const tunnelProcess = exec(command);
      let output = "";
      let tunnelUrl: string | null = null;

      // URL detection regex
      const urlRegex =
        /Tunnel ready at (https?:\/\/[^\s]+)|https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

      // Track when we set the URL
      let urlResolved = false;

      // Create the tunnel object
      const tunnel = {
        url: null,
        process: tunnelProcess,
        close: async () => {
          log(`Closing tunnel to ${url}`);
          debugLog(`Closing tunnel to ${url}`);

          // Try normal kill first
          try {
            tunnelProcess.kill();
          } catch (e) {
            const error = e as Error;
            log(`Error killing process: ${error.message}`);
          }

          // Get information about this specific tunnel
          const tunnelInfo = activeTunnels.get(name);

          // Close the specific tunnel using its URL and PID
          if (tunnelInfo?.url) {
            await closeSpecificTunnel(tunnelInfo.url, tunnelInfo.pid);
          }

          return true;
        },
      };

      // Store tunnel information immediately with hostname
      activeTunnels.set(name, {
        tunnel,
        url,
        publicUrl: null,
        created: new Date(),
        output,
        pid: tunnelProcess.pid,
        hostId: os.hostname(), // Add hostname to identify the origin
      });

      // Save to file immediately
      saveTunnels();

      // Setup stdout for URL detection (will continue after we respond)
      tunnelProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        output += text;

        // Look for tunnel URL in output
        if (!tunnelUrl) {
          const match = text.match(urlRegex);
          if (match) {
            tunnelUrl = match[1] || match[0];
            log(`Detected tunnel URL: ${tunnelUrl}`);
            debugLog(`Detected tunnel URL: ${tunnelUrl}`);

            // Update the stored tunnel information
            const tunnelInfo = activeTunnels.get(name);
            if (tunnelInfo) {
              tunnelInfo.publicUrl = tunnelUrl;
              tunnelInfo.tunnel.url = tunnelUrl;
              tunnelInfo.output = output;
              urlResolved = true;

              // Save to file when URL is resolved
              saveTunnels();
            }
          }
        }

        // Log to stderr and debug file
        text
          .split("\n")
          .filter(Boolean)
          .forEach((line: string) => {
            log(`[untun stdout]: ${line}`);
            debugLog(`[untun stdout]: ${line}`);
          });
      });

      // Setup stderr handler
      tunnelProcess.stderr?.on("data", (data) => {
        const text = data.toString();
        output += text;

        // Log to stderr and debug file
        text
          .split("\n")
          .filter(Boolean)
          .forEach((line: string) => {
            log(`[untun stderr]: ${line}`);
            debugLog(`[untun stderr]: ${line}`);
          });

        // Update the stored output
        const tunnelInfo = activeTunnels.get(name);
        if (tunnelInfo) {
          tunnelInfo.output = output;
        }
      });

      // Handle process exit
      tunnelProcess.on("exit", (code) => {
        log(`Tunnel process exited with code ${code}`);
        debugLog(`Tunnel process exited with code ${code}`);

        // If we never got a URL and the process exited, remove the tunnel
        if (!urlResolved) {
          activeTunnels.delete(name);
          saveTunnels();
        }
      });

      // Return success immediately - don't wait for the URL
      return {
        content: [
          {
            type: "text",
            text: `✅ Tunnel process started successfully!\n\nName: ${name}\nLocal URL: ${url}\nPublic URL: will be available shortly...\n\nUse 'list_tunnels' in a few seconds to check the status and get the public URL.`,
          },
        ],
      };
    } catch (error) {
      const err = error as Error;
      const errorMsg = `Error starting tunnel: ${err.message || error}`;
      log(errorMsg);
      debugLog(errorMsg);
      return {
        content: [
          {
            type: "text",
            text: errorMsg,
          },
        ],
      };
    }
  },
);

// Define 'stop_tunnel' tool
server.tool(
  "stop_tunnel",
  `Stops a running tunnel or all local tunnels.
  
  This tool will:
  - Stop a specific tunnel identified by name (if provided)
  - Stop all local tunnels (if no name is provided)
  - Only affects tunnels running on the current machine
  - Will not affect tunnels running on other machines
  
  After stopping tunnels, you can use 'list_tunnels' to confirm they've been terminated.`,
  {
    name: z
      .string()
      .optional()
      .describe(
        "Optional name of a specific tunnel to stop. If not provided, all local tunnels will be stopped.",
      ),
  },
  async ({ name }) => {
    try {
      // If name is provided, stop specific tunnel
      if (name) {
        if (!activeTunnels.has(name)) {
          return {
            content: [
              {
                type: "text",
                text: `No active tunnel found with name "${name}".`,
              },
            ],
          };
        }

        const tunnelInfo = activeTunnels.get(name);

        // Check if this is a remote tunnel
        if (tunnelInfo?.isRemote) {
          return {
            content: [
              {
                type: "text",
                text: `Tunnel "${name}" is running on a different host (${tunnelInfo.hostId}) and cannot be stopped from this instance. Please stop it from the originating host.`,
              },
            ],
          };
        }

        log(`==== STOPPING SPECIFIC TUNNEL: ${name} ====`);
        log(
          `Tunnel details: URL=${tunnelInfo?.url}, PID=${tunnelInfo?.pid || "unknown"}, Public URL=${tunnelInfo?.publicUrl || "unknown"}`,
        );
        debugLog(
          `Stopping specific tunnel: ${name} (PID: ${tunnelInfo?.pid || "unknown"})`,
        );

        let killResults: string[] = [];

        if (tunnelInfo?.url) {
          const result = await closeSpecificTunnel(
            tunnelInfo.url,
            tunnelInfo.pid,
          );
          killResults = result.split("\n");
        }

        // Remove from active tunnels
        log(`Removing tunnel ${name} from registry`);
        activeTunnels.delete(name);

        // Save updated tunnels to file
        saveTunnels();

        const killResultsText = killResults.join("\n");
        log(`Kill results:\n${killResultsText}`);
        log(`==== FINISHED STOPPING TUNNEL: ${name} ====`);

        return {
          content: [
            {
              type: "text",
              text: `Tunnel "${name}" stopped.\n\nDetails:\n${killResultsText}`,
            },
          ],
        };
      }
      // No name provided, stop all local tunnels
      else {
        log(`==== STOPPING ALL LOCAL TUNNELS ====`);

        // Use killTunnelProcesses to forcefully kill all untun processes
        const results = killTunnelProcesses();

        // Get the count of local tunnels before cleaning
        const entries = Array.from(activeTunnels.entries());
        const localTunnels = entries.filter((entry) => {
          // Type assertion for entry
          const [_, info] = entry as [string, TunnelInfo];
          return !info.isRemote;
        });
        const localCount = localTunnels.length;

        if (localCount === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No local tunnels to stop. Remote tunnels are not affected.",
              },
            ],
          };
        }

        // Remove all local tunnels from the registry
        for (const [tunnelName, _] of localTunnels) {
          activeTunnels.delete(tunnelName);
        }

        // Save updated tunnels to file
        saveTunnels();

        log(`==== FINISHED STOPPING ALL TUNNELS ====`);

        return {
          content: [
            {
              type: "text",
              text: `Stopped ${localCount} local tunnels. Remote tunnels were not affected.\n\nDetails:\n${results}`,
            },
          ],
        };
      }
    } catch (error) {
      const err = error as Error;
      const errorMsg = `Error stopping tunnel(s): ${err.message || error}`;
      log(errorMsg);
      debugLog(errorMsg);

      return {
        content: [
          {
            type: "text",
            text: errorMsg,
          },
        ],
      };
    }
  },
);

// Define 'list_tunnels' tool
server.tool(
  "list_tunnels",
  `Lists all active tunnels including their status and details.
  
  This tool will:
  - Show all tunnels in the registry
  - Auto-detect any running tunnels not in the registry
  - Display tunnel status, name, URLs, and runtime information
  - Indicate whether tunnels are local or running on remote machines
  
  Use this tool to check the status of your tunnels and get their public URLs.`,
  {},
  async () => {
    // Reload tunnels from file to get updated information
    loadTunnels();

    // Get process info for verification and detect active tunnels
    let processInfo = "";
    let detectedTunnels: Array<{
      name: string;
      url: string;
      publicUrl: string | null;
      pid: string;
      hostId: string;
      created: Date;
      isDetected: boolean;
    }> = [];

    try {
      // Get cloudflared processes - handle the case when none are found
      let cloudflaredLines: string[] = [];
      let cloudflaredCount = 0;
      try {
        const cloudflaredCmd = "ps aux | grep cloudflared | grep -v grep";
        const cloudflaredProcessOutput = execSync(cloudflaredCmd)
          .toString()
          .trim();
        cloudflaredLines = cloudflaredProcessOutput.split("\n").filter(Boolean);
        cloudflaredCount = cloudflaredLines.length;
      } catch (e) {
        // No processes found, which is fine
        cloudflaredCount = 0;
      }

      // Get untun processes - handle the case when none are found
      let untunLines: string[] = [];
      let untunCount = 0;
      try {
        const untunCmd = "ps aux | grep 'untun tunnel' | grep -v grep";
        const untunProcessOutput = execSync(untunCmd).toString().trim();
        untunLines = untunProcessOutput.split("\n").filter(Boolean);
        untunCount = untunLines.length;
      } catch (e) {
        // No processes found, which is fine
        untunCount = 0;
      }

      processInfo = `\nSystem status: ${cloudflaredCount} cloudflared processes, ${untunCount} untun processes`;

      // Try to extract information from running processes
      if (cloudflaredCount > 0 || untunCount > 0) {
        // Extract local URLs from cloudflared processes
        cloudflaredLines.forEach((line) => {
          // Looking for patterns like "--url http://localhost:3000" or similar
          const urlMatch = line.match(/--url\s+(https?:\/\/[^\s]+)/i);
          if (urlMatch) {
            const localUrl = urlMatch[1];
            // Also try to find the public URL in the command line
            let publicUrl = null;
            const publicUrlMatch = line.match(
              /(https?:\/\/[a-z0-9-]+\.trycloudflare\.com)/i,
            );
            if (publicUrlMatch) {
              publicUrl = publicUrlMatch[1];
            }

            // Extract PID
            const parts = line.trim().split(/\s+/);
            const pid = parts[1];

            // Add to detected tunnels
            detectedTunnels.push({
              name: `auto-detected-${detectedTunnels.length + 1}`,
              url: localUrl,
              publicUrl: publicUrl,
              pid: pid,
              hostId: os.hostname(),
              created: new Date(),
              isDetected: true,
            });
          }
        });

        // Extract information from untun processes if available
        untunLines.forEach((line) => {
          const urlMatch = line.match(/untun\s+tunnel\s+(https?:\/\/[^\s]+)/i);
          if (urlMatch) {
            const localUrl = urlMatch[1];

            // Extract PID
            const parts = line.trim().split(/\s+/);
            const pid = parts[1];

            // Check if this URL already exists in detectedTunnels
            const exists = detectedTunnels.some((t) => t.url === localUrl);
            if (!exists) {
              detectedTunnels.push({
                name: `auto-detected-${detectedTunnels.length + 1}`,
                url: localUrl,
                publicUrl: null, // We can't easily detect the public URL from untun process
                pid: pid,
                hostId: os.hostname(),
                created: new Date(),
                isDetected: true,
              });
            }
          }
        });

        // Add detected tunnels to activeTunnels if they're not already there
        detectedTunnels.forEach((tunnel) => {
          // Check if we already have a tunnel with this URL
          const tunnelsArray = Array.from(
            activeTunnels.values(),
          ) as TunnelInfo[];
          const existingTunnel = tunnelsArray.find((t) => t.url === tunnel.url);

          if (!existingTunnel) {
            // Create a dummy tunnel object for detected tunnels
            activeTunnels.set(tunnel.name, {
              ...tunnel,
              pid: parseInt(tunnel.pid), // Convert string pid to number
              tunnel: {
                close: async () => {
                  log(`Closing detected tunnel to ${tunnel.url}`);
                  // Try to kill the process
                  try {
                    const result = await closeSpecificTunnel(
                      tunnel.url,
                      parseInt(tunnel.pid),
                    );
                    return result;
                  } catch (e) {
                    const error = e as Error;
                    log(`Error killing process: ${error.message}`);
                    return false;
                  }
                },
              },
            });
          } else if (existingTunnel.publicUrl === null && tunnel.publicUrl) {
            // Update existing tunnel with public URL if available
            existingTunnel.publicUrl = tunnel.publicUrl;
          }
        });

        // Save updated tunnels to file
        saveTunnels();
      }
    } catch (e) {
      // Only log actual errors
      const error = e as Error;
      processInfo = `\nError checking processes: ${error.message}`;
      log(`Error in list_tunnels: ${error.message}`);
      debugLog(`Error in list_tunnels: ${error.message}`);
    }

    // If no tunnels in activeTunnels but we detected some
    if (activeTunnels.size === 0 && detectedTunnels.length > 0) {
      const detectedInfo = detectedTunnels
        .map(
          (t) =>
            `- Auto-detected: ${t.url} ${t.publicUrl ? `→ ${t.publicUrl}` : "(public URL unknown)"} (PID: ${t.pid})`,
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `No tunnels found in registry, but detected ${detectedTunnels.length} running tunnel processes.${processInfo}\n\n${detectedInfo}\n\nThese tunnels have been added to the registry for easier management.`,
          },
        ],
      };
    }

    if (activeTunnels.size === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No active tunnels found.${processInfo}`,
          },
        ],
      };
    }

    const currentHostname = os.hostname();
    const tunnelEntries = Array.from(activeTunnels.entries());
    const tunnelList = tunnelEntries
      .map((entry) => {
        const [name, info] = entry as [string, TunnelInfo];
        const createdDate =
          info.created instanceof Date ? info.created : new Date(info.created);
        const runtime = Math.round(
          (new Date().getTime() - createdDate.getTime()) / 1000,
        );
        const status = info.publicUrl
          ? `✅ READY at ${info.publicUrl}`
          : "⏳ STARTING (URL not yet available)";

        // Check if process is still running (only for local tunnels)
        let processStatus = "";
        if (!info.isRemote && info.pid) {
          try {
            execSync(`ps -p ${info.pid}`);
            processStatus = "✓ Process running";
          } catch (e) {
            processStatus = "⚠️ Process not found";
          }
        } else if (info.isRemote) {
          processStatus = "Remote tunnel";
        }

        const hostInfo =
          info.hostId === currentHostname
            ? "(local)"
            : `(remote: ${info.hostId})`;

        const detectedInfo = info.isDetected ? " [auto-detected]" : "";

        return `- ${name}${detectedInfo}: ${info.url} → ${status} (running for ${runtime}s) ${hostInfo}\n  ${processStatus} ${!info.isRemote ? `(PID: ${info.pid || "unknown"})` : ""}`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Active tunnels:${processInfo}\n\n${tunnelList}\n\nTunnel information is shared via: ${tunnelStoragePath}`,
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Untun Tunnel Manager started and ready to receive commands.");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

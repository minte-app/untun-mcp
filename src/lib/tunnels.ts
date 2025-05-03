import fs from "fs";
import os from "os";
import { log, debugLog, tunnelStoragePath } from "./logger.js";
import { TunnelInfo } from "./types.js";
import { closeSpecificTunnel } from "./processes.js";

// Store active tunnels to manage them later
export const activeTunnels = new Map<string, TunnelInfo>();

/**
 * Function to save tunnels to a file
 */
export const saveTunnels = (): void => {
  try {
    // Convert Map to a serializable object
    const tunnelsData = Array.from(activeTunnels.entries()).map(
      ([name, info]) => {
        // Create a serializable version of the tunnel info
        return {
          name,
          url: info.url,
          publicUrl: info.publicUrl,
          created: info.created.toISOString(),
          pid: info.pid,
          hostId: os.hostname(), // Add hostname to identify the host
        };
      },
    );

    fs.writeFileSync(tunnelStoragePath, JSON.stringify(tunnelsData, null, 2));
    log(`Saved ${tunnelsData.length} tunnel(s) to ${tunnelStoragePath}`);
    debugLog(`Saved tunnels to storage file`);
  } catch (error) {
    const err = error as Error;
    log(`Error saving tunnels to file: ${err.message}`);
    debugLog(`Error saving tunnels: ${err.message}`);
  }
};

/**
 * Function to load tunnels from file
 */
export const loadTunnels = (): void => {
  try {
    if (!fs.existsSync(tunnelStoragePath)) {
      log(`No tunnel storage file found at ${tunnelStoragePath}`);
      return;
    }

    const data = fs.readFileSync(tunnelStoragePath, "utf8");
    const tunnelsData = JSON.parse(data);

    // Process each tunnel
    tunnelsData.forEach((tunnelData: any) => {
      // Skip if tunnel is already loaded
      if (activeTunnels.has(tunnelData.name)) return;

      // Check if this is a remote tunnel or a local one
      const isRemoteTunnel = tunnelData.hostId !== os.hostname();

      // Create a tunnel object with appropriate properties based on type
      activeTunnels.set(tunnelData.name, {
        url: tunnelData.url,
        publicUrl: tunnelData.publicUrl,
        created: new Date(tunnelData.created),
        pid: tunnelData.pid,
        hostId: tunnelData.hostId,
        isRemote: isRemoteTunnel,
        tunnel: {
          // Remote tunnels cannot be closed from this instance
          // Local tunnels can be closed via processes
          close: async () => {
            if (isRemoteTunnel) {
              log(
                `Cannot close remote tunnel "${tunnelData.name}" from this host`,
              );
              return false;
            } else {
              log(`Closing local tunnel "${tunnelData.name}"`);
              return closeSpecificTunnel(tunnelData.url, tunnelData.pid);
            }
          },
        },
      });
    });

    log(`Loaded ${tunnelsData.length} tunnel(s) from storage file`);
    debugLog(`Loaded tunnels from storage file`);
  } catch (error) {
    const err = error as Error;
    log(`Error loading tunnels from file: ${err.message}`);
    debugLog(`Error loading tunnels: ${err.message}`);
  }
};

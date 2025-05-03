import { ChildProcess } from "child_process";

// Interface for tunnel information
export interface TunnelInfo {
  url: string;
  publicUrl: string | null;
  created: Date;
  pid?: number;
  hostId: string;
  isRemote?: boolean;
  output?: string;
  isDetected?: boolean;
  tunnel: {
    url?: string | null;
    process?: ChildProcess;
    close: () => Promise<boolean | string>;
  };
}

// Interface for detected process
export interface ProcessInfo {
  pid: string;
  command: string;
  user?: string;
  line?: string;
}

// Interface for cloudflared matching process
export interface MatchingProcess {
  pid: string;
  cmd: string;
}

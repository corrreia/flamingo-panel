export interface AllocationLimits {
  id: string;
  userId: string;
  cpu: number;
  memory: number;
  disk: number;
  servers: number;
  databases: number;
  backups: number;
  allocations: number;
  allowOverprovision: number;
}

export interface PortRange {
  id: string;
  userId: string;
  nodeId: number;
  startPort: number;
  endPort: number;
}

export interface AllocationResponse {
  limits: AllocationLimits | null;
  usage: {
    servers: number;
    cpu: number;
    memory: number;
    disk: number;
  };
  portRanges: PortRange[];
}

export interface AllocationLimits {
  allocations: number;
  allowOverprovision: number;
  backups: number;
  cpu: number;
  databases: number;
  disk: number;
  id: string;
  memory: number;
  servers: number;
  userId: string;
}

export interface PortRange {
  endPort: number;
  id: string;
  nodeId: number;
  startPort: number;
  userId: string;
}

export interface AllocationResponse {
  limits: AllocationLimits | null;
  portRanges: PortRange[];
  usage: {
    servers: number;
    cpu: number;
    memory: number;
    disk: number;
  };
}

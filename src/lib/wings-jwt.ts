import { SignJWT } from "jose";

const encoder = new TextEncoder();

export interface WebsocketTokenPayload {
  permissions: string[];
  server_uuid: string;
  user_uuid: string;
}

export function signWingsWebsocketToken(
  payload: WebsocketTokenPayload,
  nodeToken: string,
  expiresInSeconds = 600
): Promise<string> {
  return new SignJWT({
    user_uuid: payload.user_uuid,
    server_uuid: payload.server_uuid,
    permissions: payload.permissions,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(encoder.encode(nodeToken));
}

// Permission constants matching Wings expectations
export const WS_PERMISSIONS = {
  CONNECT: "websocket.connect",
  SEND_COMMAND: "control.console",
  POWER_START: "control.start",
  POWER_STOP: "control.stop",
  POWER_RESTART: "control.restart",
  ADMIN_ERRORS: "admin.websocket.errors",
  ADMIN_INSTALL: "admin.websocket.install",
  ADMIN_TRANSFER: "admin.websocket.transfer",
  BACKUP_READ: "backup.read",
} as const;

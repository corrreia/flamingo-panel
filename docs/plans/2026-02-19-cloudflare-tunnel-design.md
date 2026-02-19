# Cloudflare Tunnel Integration Design

**Goal:** Use Cloudflare Tunnel (cloudflared) for all Panel→Wings communication, eliminating the need for TLS certificates, public IPs, or open ports on Wings nodes.

**Architecture:** Each Wings machine runs cloudflared creating an outbound-only tunnel. The Panel Worker reaches Wings via standard fetch() to the tunnel hostname. Cloudflare terminates TLS on the edge, cloudflared delivers plain HTTP to Wings on localhost.

```
Browser → Cloudflare Worker (Flamingo Panel)
                ↓ fetch("https://wings-node1.example.com/api/system")
          Cloudflare Edge (TLS terminated here)
                ↓ routed through tunnel
          cloudflared on Wings machine
                ↓ http://localhost:8080/api/system
          Wings daemon (plain HTTP, no certs)
```

## What Changes

- `nodes.fqdn` stores the tunnel hostname (e.g., `wings-abc123.cfargotunnel.com`)
- `nodes.scheme` always `https` (Worker → Cloudflare edge)
- Wings client simplifies: just fetch tunnel hostname, no scheme/port construction
- Node creation UI: single "Tunnel Hostname" input
- Bearer token auth remains (tunnel = transport, not auth)

## What Stays the Same

- All Wings API endpoints and payloads
- WebSocket protocol (JWT auth events, console relay)
- Everything else in the implementation plan

## Node Setup UX

Manual: admin runs cloudflared on the Wings machine, creates a tunnel, enters the tunnel hostname in the panel. Docs explain the setup steps.

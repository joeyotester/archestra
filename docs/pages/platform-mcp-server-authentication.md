---
title: "Using MCP Servers with Authentication"
category: MCP Gateway
subcategory: Authentication
order: 5
description: "How Archestra handles authentication for MCP servers like GitHub, Atlassian, and ServiceNow"
lastUpdated: 2026-02-10
---

<!--
Check ../docs_writer_prompt.md before changing this file.

This document covers how Archestra manages credentials for MCP servers. Include:
- Two-token model (Token A: client to gateway, Token B: gateway to upstream)
- Hosted vs passthrough servers
- Per-user dynamic credentials
- Missing credential handling
- OAuth flow for upstream servers
-->

MCP servers that connect to services like GitHub, Atlassian, or ServiceNow need credentials. Archestra manages this with a two-token model:

- **Token A** — authenticates the client (Cursor, Open WebUI, agent app) to the Archestra gateway. See [MCP Gateway](/docs/platform-mcp-gateway) for connection details.
- **Token B** — authenticates the Archestra gateway to the upstream MCP server. This page covers how Token B works.

The client sends Token A. Archestra resolves Token B at runtime. The client never sees upstream credentials.

## Terminology

- **Hosted servers** — MCP servers running in Archestra's K8s cluster (containers managed by the [orchestrator](/docs/platform-orchestrator))
- **Passthrough servers** — Remote third-party MCP servers (GitHub, Atlassian, etc.) that Archestra proxies to

## Architecture

```mermaid
graph LR
    subgraph Clients
        C1["Cursor / IDE"]
        C2["Open WebUI"]
        C3["Agent Application"]
    end

    subgraph Archestra["Archestra Platform"]
        GW["MCP Gateway<br/>/v1/mcp/:profileId"]
        CR["Credential<br/>Resolution"]
        GW --> CR
    end

    subgraph Passthrough["Passthrough Servers"]
        U1["GitHub"]
        U2["Atlassian"]
        U3["ServiceNow"]
    end

    subgraph Hosted["Hosted MCP Servers"]
        H1["Custom Server"]
        H2["Internal Tool"]
    end

    C1 -- "Token A" --> GW
    C2 -- "Token A" --> GW
    C3 -- "Token A" --> GW
    CR -- "Token B" --> U1
    CR -- "Token B" --> U2
    CR -- "Token B" --> U3
    CR -- "stdio" --> H1
    CR -- "stdio" --> H2

    style GW fill:#e6f3ff,stroke:#0066cc,stroke-width:2px
    style CR fill:#fff,stroke:#0066cc,stroke-width:1px
```

## Upstream Credentials

Credentials for upstream MCP servers are set during installation from the MCP Catalog:

- **Static secrets** — API keys, PATs. Set once at install time.
- **OAuth tokens** — Obtained via OAuth flow against the upstream provider during installation. Access and refresh tokens stored.

For **passthrough** servers: `Authorization: Bearer` header over HTTP.
For **hosted** servers: stdio transport within K8s — no auth headers needed.

Stored in the secrets backend (database by default, [external secrets manager](/docs/platform-secrets-management) for enterprise).

### Per-User Credentials

Default: one credential per MCP server installation, shared by all callers.

With "Resolve at call time" enabled: Archestra resolves the credential dynamically based on the caller's identity. This enables multi-tenant setups — each developer uses their own GitHub PAT, each team member their own Jira access.

```mermaid
flowchart TD
    A["Tool call arrives<br/>with Token A"] --> B{Dynamic credentials<br/>enabled?}
    B -- No --> C["Use server's<br/>pre-configured credential"]
    B -- Yes --> D{Caller has<br/>personal credential?}
    D -- Yes --> E["Use caller's credential"]
    D -- No --> F{Team member<br/>has credential?}
    F -- Yes --> G["Use team member's<br/>credential"]
    F -- No --> J["Return error +<br/>install link"]

    style E fill:#d4edda,stroke:#28a745
    style G fill:#d4edda,stroke:#28a745
    style J fill:#f8d7da,stroke:#dc3545
```

Priority order:
1. Calling user's own credential (highest)
2. Team member's credential
3. Error with install link

### Missing Credentials

When no credential is found, the gateway returns an actionable error:

> Authentication required for "GitHub MCP Server".
> No credentials found for your account (user: alice@company.com).
> Set up credentials: https://archestra.company.com/mcp-catalog/registry?install=abc-123

The user installs the MCP server with their credentials and retries. In chat, this appears as a message with a clickable link.

## OAuth for Upstream Servers

For servers using OAuth (not static keys), Archestra runs the full OAuth flow at installation time:

```mermaid
sequenceDiagram
    participant User as Admin (Browser)
    participant A as Archestra
    participant P as Provider<br/>(GitHub, Atlassian, etc.)

    User->>A: Install from MCP Catalog
    A->>P: Discover endpoints + register client
    A-->>User: Redirect to provider login
    User->>P: Authorize
    P-->>A: Auth code
    A->>P: Exchange for tokens
    P-->>A: access_token + refresh_token
    A->>A: Store in secrets backend
    Note over A: Auto-refresh on 401
```

Key behaviors:
- **Auto-refresh**: On 401, Archestra uses the refresh token to get a new access token and retries. No user intervention.
- **Refresh failures**: Tracked per server. Visible in the MCP server status.

See [MCP Authentication](/docs/mcp-authentication) for details on discovery, PKCE, and DCR.

## Related

- [MCP Authentication](/docs/mcp-authentication) — OAuth 2.1, discovery, DCR vs CIMD
- [Building MCP Servers with Authentication](/docs/platform-building-mcp-server-auth) — Auth patterns for server developers
- [MCP Gateway](/docs/platform-mcp-gateway) — Gateway setup
- [Secrets Management](/docs/platform-secrets-management) — Vault integration

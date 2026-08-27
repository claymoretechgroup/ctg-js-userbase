export type timestamp = number;

export interface SessionState {
    access_token: string | null;
    claims: Claims | null;
}

export interface Claims {
    iss: string;
    aud: string;
    sub: string;
    permissions: string[];
    scoped_permissions: string[];
    group_ids: number[];
    scope: string;
    iat: timestamp;
    exp: timestamp;
    jti: string;
}

export interface Profile {
    id: string;
    email: string;
    name: string | null;
    roles: string[];
    group_ids: number[];
    totp_enabled: boolean;
    email_verified: boolean;
}

export interface Authenticated {
    mfa_required?: false;
    user: Profile;
    access_token: string;
    access_expires_at: timestamp;
}

export interface MFAChallenge {
    mfa_required: true;
    mfa_token: string;
    mfa_expires_at: timestamp;
}

export type LoginResult = MFAChallenge | Authenticated;

export interface SessionSummary {
    id: string;
    ip: string | null;
    user_agent: string | null;
    created_at: timestamp;
    last_used_at: timestamp | null;
    current: boolean;
}

export interface RoleEntry {
    name: string;
    permissions: string[];
    scoped: boolean;
    reserved: boolean;
}

export interface PermissionEntry {
    id: string;
    name: string;
    reserved: boolean;
}

export interface GroupEntry {
    id: number;
    name: string;
    roles: string[];
}

export interface Request {
    method: HTTPMethod;
    url: string;
    headers: Record<string, string>;
    body: string | null;
    credentials: "include";
}

export interface Response {
    status: number;
    headers: Record<string, string>;
    body: string;
}

export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Credential = "session" | "none" | string;

export interface Config {
    base_url?: string;
    transport: Transport;
    clock: Clock;
}

export interface Transport {
    send(request: Request): Promise<Response>;
}

export interface Clock {
    now(): timestamp;
}

declare class Buffer extends Uint8Array {
    toString(encoding?: string): string;

    static alloc(size: number): Buffer;
    static from(value: string | readonly number[] | ArrayBuffer | Uint8Array): Buffer;
}

type TestClaims = Partial<import("../../src/core/types.js").Claims> & Record<string, unknown>;
type TestRequest = import("../../src/core/types.js").Request;
type TestResponse = import("../../src/core/types.js").Response;
type TestScriptEntry = import("./ScriptedTransport.js").ScriptEntry;
type TestScriptedTransport = import("./ScriptedTransport.js").default;
type TestPromise = Promise<unknown>;

interface TestSentRequest {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string | null;
    credentials?: string;
    current?: boolean;
}

interface TestRecord {
    [key: string]: unknown;
    access_token?: string;
    access_expires_at?: number;
    accept?: string;
    authorization?: string;
    bearer?: string;
    body?: string;
    claims?: TestClaims;
    cookie?: string;
    count?: number;
    credentials?: string;
    expected?: string;
    expectedAuthorization?: string;
    email?: string;
    hasContentType?: boolean;
    id?: string;
    mfa_expires_at?: number;
    mfa_required?: boolean;
    mfa_token?: string;
    method?: string;
    message?: string;
    name?: string;
    password?: string;
    preview?: string;
    recovery_code?: string;
    recovery_codes?: string[];
    result: TestRecord & TestRecord[];
    secret?: string;
    sent?: TestSentRequest;
    setCookie?: string;
    signedIn?: boolean;
    status?: number | string;
    success?: boolean;
    text?: string;
    token?: string;
    type?: string;
    url?: string;
    user?: TestRecord;
}

interface TestErrorShape {
    type?: unknown;
    service_type?: unknown;
    status?: unknown;
    details?: Record<string, unknown> | null;
    fields?: unknown;
    message?: unknown;
    refresh_token?: unknown;
    refreshToken?: unknown;
}

interface LiveFetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    bearer?: string;
    cookie?: string | null;
    credentials?: RequestCredentials;
}

interface LiveSentRequest {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
}

interface LiveWireResponse {
    status: number;
    body: TestRecord;
    text: string;
    setCookie: string[];
    sent: LiveSentRequest;
}

interface LiveCredentials {
    email: string;
    password: string;
    totp_secret?: string;
}

interface LiveTotpAccount extends LiveCredentials {
    secret: string;
    recovery_codes: string[];
}

interface LiveFixture {
    user: LiveCredentials;
    totp_user: LiveCredentials;
}

declare module "node:crypto" {
    interface Hmac {
        update(data: Buffer): Hmac;
        digest(): Buffer;
    }

    export function createHmac(algorithm: string, key: Buffer): Hmac;
    export function randomUUID(): string;
}

declare module "node:fs" {
    export function existsSync(path: string | URL): boolean;
    export function readFileSync(path: string | URL, encoding: BufferEncoding): string;
    export function writeFileSync(path: string | URL, data: string): void;
}

declare module "node:path" {
    export function resolve(...paths: string[]): string;

    const path: {
        dirname(path: string): string;
        join(...paths: string[]): string;
        resolve(...paths: string[]): string;
    };

    export default path;
}

declare module "node:url" {
    export function fileURLToPath(url: string | URL): string;
}

type BufferEncoding = "utf8" | "utf-8" | "base64" | "base64url" | string;

declare const process: {
    env: Record<string, string | undefined>;
    cwd(): string;
};

declare module "react" {
    export type ComponentType<Props = Record<string, unknown>> = (
        (props: Props) => ReactElement | null
    ) | (new (props: Props) => Component<Props>);

    export interface ErrorInfo {
        componentStack?: string | null;
    }

    export class Component<Props = Record<string, unknown>, State = Record<string, unknown>> {
        readonly props: Readonly<Props>;
        state: Readonly<State>;

        constructor(props: Props);

        setState(state: Partial<State> | ((state: Readonly<State>, props: Readonly<Props>) => Partial<State>)): void;

        render(): ReactNode;
    }
}

declare module "react-dom/test-utils" {
    export function act<Result>(callback: () => Result | Promise<Result>): Promise<Awaited<Result>>;
}

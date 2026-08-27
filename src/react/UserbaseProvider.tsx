// Dependency: React context, state, effect, and renderable node types.
import { createContext, useEffect, useState, type ReactElement, type ReactNode } from "react";
// Dependency: public client error for presentation configuration failures.
import ClientError from "../core/ClientError.js";
// Dependency: userbase client class.
import CTGUserbaseClient from "../core/CTGUserbaseClient.js";
// Dependency: public session state structure.
import type { SessionState } from "../core/types.js";

export type Content = ReactNode;
export type RenderedContent = ReactElement | null;

export interface UserbaseProviderProps {
    client: CTGUserbaseClient;
    children: Content;
}

export interface UserbaseContextValue {
    client: CTGUserbaseClient;
    session: SessionState;
}

export const UserbaseContext = createContext<UserbaseContextValue | null>(null);

// Provides the current userbase client and session to React children.
export default function UserbaseProvider({ client, children }: UserbaseProviderProps): RenderedContent {
    if (client === undefined || client === null) {
        const error = new ClientError("CONFIGURATION_INVALID");
        (error as ClientError & { details: Record<string, unknown> }).details = { field: "client" };
        throw error;
    }

    const [session, setSession] = useState<SessionState>(() => client.session());

    useEffect(() => {
        setSession(client.session());
        return client.subscribe((nextSession) => setSession(nextSession));
    }, [client]);

    return (
        <UserbaseContext.Provider value={{ client, session }}>
            {children}
        </UserbaseContext.Provider>
    );
}

export { UserbaseProvider };

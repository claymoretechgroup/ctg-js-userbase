// Dependency: React context access.
import { useContext } from "react";
// Dependency: public client error for missing provider failures.
import ClientError from "../core/ClientError.js";
// Dependency: userbase client class.
import CTGUserbaseClient from "../core/CTGUserbaseClient.js";
// Dependency: public session state structure.
import type { SessionState } from "../core/types.js";
// Dependency: provider context shared with presentation hooks.
import { UserbaseContext } from "./UserbaseProvider.js";

export interface UserbaseExposure {
    client: CTGUserbaseClient;
    session: SessionState;
    authenticated: boolean;
}

// HOOK :: VOID -> UserbaseExposure
// Returns the nearest userbase client, session, and authentication flag.
export default function useUserbase(): UserbaseExposure {
    const context = useContext(UserbaseContext);

    if (context === null) {
        const error = new ClientError("CONFIGURATION_INVALID");
        (error as ClientError & { details: Record<string, unknown> }).details = { field: "provider" };
        throw error;
    }

    return {
        client: context.client,
        session: context.session,
        authenticated: context.session.claims !== null,
    };
}

export { useUserbase };

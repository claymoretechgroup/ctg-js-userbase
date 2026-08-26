// Dependency: React context access.
import { useContext } from "react";
// Dependency: public client error for missing provider failures.
import ClientError from "../core/ClientError.js";
// Dependency: provider context shared with presentation hooks.
import { UserbaseContext } from "./UserbaseProvider.jsx";

// HOOK :: VOID -> UserbaseExposure
// Returns the nearest userbase client, session, and authentication flag.
export default function useUserbase() {
    const context = useContext(UserbaseContext);

    if (context === null) {
        const error = new ClientError("CONFIGURATION_INVALID");
        error.details = { field: "provider" };
        throw error;
    }

    return {
        client: context.client,
        session: context.session,
        authenticated: context.session.claims !== null
    };
}

export { useUserbase };

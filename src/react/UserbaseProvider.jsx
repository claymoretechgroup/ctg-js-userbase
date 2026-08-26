// Dependency: React context, state, and effect primitives.
import React, { createContext, useEffect, useState } from "react";
// Dependency: public client error for presentation configuration failures.
import ClientError from "../core/ClientError.js";

export const UserbaseContext = createContext(null);

// Provides the current userbase client and session to React children.
export default function UserbaseProvider({ client, children }) {
    if (client === undefined || client === null) {
        const error = new ClientError("CONFIGURATION_INVALID");
        error.details = { field: "client" };
        throw error;
    }

    const [session, setSession] = useState(() => client.session());

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

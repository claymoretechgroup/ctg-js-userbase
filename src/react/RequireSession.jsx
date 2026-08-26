// Dependency: provider-backed session exposure.
import useUserbase from "./useUserbase.js";

// Renders children only when a session's claims are present.
export default function RequireSession({ children, fallback = null }) {
    const { authenticated } = useUserbase();

    return authenticated ? children : fallback;
}

export { RequireSession };

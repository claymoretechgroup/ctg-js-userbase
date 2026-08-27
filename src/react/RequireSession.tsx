// Dependency: provider-backed session exposure.
import useUserbase from "./useUserbase.js";
// Dependency: public renderable content types.
import type { Content, RenderedContent } from "./UserbaseProvider.js";

export interface RequireSessionProps {
    children: Content;
    fallback?: Content;
}

// Renders children only when a session's claims are present.
export default function RequireSession({ children, fallback = null }: RequireSessionProps): RenderedContent {
    const { authenticated } = useUserbase();

    return (authenticated ? children : fallback) as RenderedContent;
}

export { RequireSession };

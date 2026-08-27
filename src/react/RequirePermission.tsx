// Dependency: permission hook over the current provider session.
import usePermission from "./usePermission.js";
// Dependency: public renderable content types.
import type { Content, RenderedContent } from "./UserbaseProvider.js";

export interface RequirePermissionProps {
    permission: string;
    target_group_ids?: number[];
    children: Content;
    fallback?: Content;
    targetGroupIds?: number[];
}

// Renders children only when a permission predicate passes.
export default function RequirePermission({
    permission,
    target_group_ids = undefined,
    targetGroupIds = undefined,
    children,
    fallback = null,
}: RequirePermissionProps): RenderedContent {
    const effectiveTargetGroupIds = target_group_ids === undefined ? targetGroupIds : target_group_ids;
    const allowed = usePermission(permission, effectiveTargetGroupIds);

    return (allowed ? children : fallback) as RenderedContent;
}

export { RequirePermission };

// Dependency: permission hook over the current provider session.
import usePermission from "./usePermission.js";

// Renders children only when a permission predicate passes.
export default function RequirePermission({ permission, target_group_ids = undefined, targetGroupIds = undefined, children, fallback = null }) {
    const effectiveTargetGroupIds = target_group_ids === undefined ? targetGroupIds : target_group_ids;
    const allowed = usePermission(permission, effectiveTargetGroupIds);

    return allowed ? children : fallback;
}

export { RequirePermission };

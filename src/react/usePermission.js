// Dependency: pure authorization predicates.
import Authorization from "../core/Authorization.js";
// Dependency: provider-backed session exposure.
import useUserbase from "./useUserbase.js";

// HOOK :: STRING, [INT]? -> BOOL
// Evaluates the current session claims against a permission predicate.
export default function usePermission(permission, targetGroupIds = undefined) {
    const { session } = useUserbase();
    const authorization = Authorization.init();

    if (targetGroupIds === undefined) {
        return authorization.hasPermission(session.claims, permission);
    }

    return authorization.hasPermissionOver(session.claims, permission, targetGroupIds);
}

export { usePermission };

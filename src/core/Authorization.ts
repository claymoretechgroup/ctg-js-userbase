// Dependency: public claims structure.
import type { Claims } from "./types.js";

// Evaluates permission predicates over supplied claims without client state.
export default class Authorization {

    // CONSTRUCTOR :: VOID -> this
    // Creates a stateless authorization predicate set.
    constructor() {}

    /**
     *
     * Instance Methods
     *
     */

    // :: Claims|NULL, STRING -> BOOLEAN
    // Checks only the global permission list for an exact permission.
    hasPermission(claims: Claims | null, permission: string): boolean {
        const claimMap = claims as (Partial<Claims> & Record<string, unknown>) | null;

        return Array.isArray(claimMap?.permissions) && claimMap.permissions.includes(permission);
    }

    // :: Claims|NULL, STRING -> BOOLEAN
    // Checks global and scoped permission lists for an exact permission.
    hasPermissionInAnyForm(claims: Claims | null, permission: string): boolean {
        const claimMap = claims as (Partial<Claims> & Record<string, unknown>) | null;

        return this.hasPermission(claims, permission) ||
            (Array.isArray(claimMap?.scoped_permissions) && claimMap.scoped_permissions.includes(permission));
    }

    // :: Claims|NULL, STRING, [NUMBER] -> BOOLEAN
    // Checks global authority or scoped authority over intersecting groups.
    hasPermissionOver(claims: Claims | null, permission: string, targetGroupIds: number[]): boolean {
        const claimMap = claims as (Partial<Claims> & Record<string, unknown>) | null;

        if (this.hasPermission(claims, permission)) {
            return true;
        }

        if (!Array.isArray(claimMap?.scoped_permissions) || !claimMap.scoped_permissions.includes(permission)) {
            return false;
        }

        if (!Array.isArray(claimMap?.group_ids) || !Array.isArray(targetGroupIds)) {
            return false;
        }

        if (claimMap.group_ids.length === 0 || targetGroupIds.length === 0) {
            return false;
        }

        return targetGroupIds.some((id) => claimMap.group_ids?.includes(id) === true);
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: VOID -> Authorization
    // Creates a stateless authorization predicate set.
    static init(): Authorization {
        return new this();
    }
}

export { Authorization };

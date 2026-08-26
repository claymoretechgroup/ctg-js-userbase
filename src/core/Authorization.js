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

    // :: Claims|NULL, STRING -> BOOL
    // Checks only the global permission list for an exact permission.
    hasPermission(claims, permission) {
        return Array.isArray(claims?.permissions) && claims.permissions.includes(permission);
    }

    // :: Claims|NULL, STRING -> BOOL
    // Checks global and scoped permission lists for an exact permission.
    hasPermissionInAnyForm(claims, permission) {
        return this.hasPermission(claims, permission) ||
            (Array.isArray(claims?.scoped_permissions) && claims.scoped_permissions.includes(permission));
    }

    // :: Claims|NULL, STRING, [INT] -> BOOL
    // Checks global authority or scoped authority over intersecting groups.
    hasPermissionOver(claims, permission, targetGroupIds) {
        if (this.hasPermission(claims, permission)) {
            return true;
        }

        if (!Array.isArray(claims?.scoped_permissions) || !claims.scoped_permissions.includes(permission)) {
            return false;
        }

        if (!Array.isArray(claims?.group_ids) || !Array.isArray(targetGroupIds)) {
            return false;
        }

        if (claims.group_ids.length === 0 || targetGroupIds.length === 0) {
            return false;
        }

        return targetGroupIds.some((id) => claims.group_ids.includes(id));
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: VOID -> Authorization
    // Creates a stateless authorization predicate set.
    static init() {
        return new this();
    }
}

export { Authorization };

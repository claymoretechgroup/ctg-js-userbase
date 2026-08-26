// Applies administration endpoint operations to a CTG user client.
export default class Administration {

    _client;

    // CONSTRUCTOR :: CTGUserClient -> this
    // Creates administration operations over one client.
    constructor(client) {
        this._client = client;
    }

    /**
     *
     * Instance Methods
     *
     */

    // :: {secret:STRING, email:STRING, password:STRING} -> PROMISE(Profile)
    // Bootstraps the first administrator without sending a bearer credential.
    bootstrapAdmin(args = {}) {
        return this._client.request("POST", "/admin/bootstrap", undefined, pick(args, ["secret", "email", "password"]), "none");
    }

    // :: {limit?:INT, offset?:INT} -> PROMISE([Profile])
    // Lists users with optional paging query fields.
    adminListUsers(args = {}) {
        return this._client.request("GET", "/admin/users", pick(args, ["limit", "offset"]));
    }

    // :: {id:STRING} -> PROMISE(Profile)
    // Reads an administrative user record.
    adminGetUser(args = {}) {
        return this._client.request("GET", "/admin/user", pick(args, ["id"]));
    }

    // :: {email:STRING, password:STRING, name?:STRING|NULL, roles?:[STRING], status?:STRING, email_verified?:BOOL} -> PROMISE(Profile)
    // Creates a user administratively.
    adminCreateUser(args = {}) {
        return this._client.request(
            "POST",
            "/admin/users",
            undefined,
            pick(args, ["email", "password", "name", "roles", "status", "email_verified"])
        );
    }

    // :: {id:STRING, name?:STRING|NULL, status?:STRING, roles?:[STRING]} -> PROMISE(Profile)
    // Updates a user by query id.
    adminUpdateUser(args = {}) {
        return this._client.request("PATCH", "/admin/user", pick(args, ["id"]), pick(args, ["name", "status", "roles"]));
    }

    // :: {id:STRING} -> PROMISE(VOID)
    // Deletes a user by query id.
    adminDeleteUser(args = {}) {
        return this._client.request("DELETE", "/admin/user", pick(args, ["id"]));
    }

    // :: VOID -> PROMISE([RoleEntry])
    // Lists roles.
    listRoles() {
        return this._client.request("GET", "/admin/roles");
    }

    // :: {name:STRING, permissions:[STRING], scoped:BOOL} -> PROMISE(RoleEntry)
    // Creates a role.
    createRole(args = {}) {
        return this._client.request("POST", "/admin/roles", undefined, pick(args, ["name", "permissions", "scoped"]));
    }

    // :: {name:STRING, permissions:[STRING], scoped:BOOL} -> PROMISE(RoleEntry)
    // Updates a role by query name.
    updateRole(args = {}) {
        return this._client.request("PUT", "/admin/role", pick(args, ["name"]), pick(args, ["permissions", "scoped"]));
    }

    // :: {name:STRING} -> PROMISE(VOID)
    // Deletes a role by query name.
    deleteRole(args = {}) {
        return this._client.request("DELETE", "/admin/role", pick(args, ["name"]));
    }

    // :: VOID -> PROMISE([PermissionEntry])
    // Lists permissions.
    listPermissions() {
        return this._client.request("GET", "/admin/permissions");
    }

    // :: {name:STRING} -> PROMISE(PermissionEntry)
    // Creates a permission.
    createPermission(args = {}) {
        return this._client.request("POST", "/admin/permissions", undefined, pick(args, ["name"]));
    }

    // :: {name:STRING, new_name:STRING} -> PROMISE(PermissionEntry)
    // Updates a permission by query name.
    updatePermission(args = {}) {
        return this._client.request("PUT", "/admin/permission", pick(args, ["name"]), pick(args, ["new_name"]));
    }

    // :: {name:STRING} -> PROMISE(VOID)
    // Deletes a permission by query name.
    deletePermission(args = {}) {
        return this._client.request("DELETE", "/admin/permission", pick(args, ["name"]));
    }

    // :: VOID -> PROMISE([GroupEntry])
    // Lists groups.
    listGroups() {
        return this._client.request("GET", "/admin/groups");
    }

    // :: {id:INT} -> PROMISE(GroupEntry)
    // Reads a group by query id.
    getGroup(args = {}) {
        return this._client.request("GET", "/admin/group", pick(args, ["id"]));
    }

    // :: {name:STRING, roles?:[STRING]} -> PROMISE(GroupEntry)
    // Creates a group.
    createGroup(args = {}) {
        return this._client.request("POST", "/admin/groups", undefined, pick(args, ["name", "roles"]));
    }

    // :: {id:INT, name?:STRING, roles?:[STRING]} -> PROMISE(GroupEntry)
    // Updates a group by query id.
    updateGroup(args = {}) {
        return this._client.request("PATCH", "/admin/group", pick(args, ["id"]), pick(args, ["name", "roles"]));
    }

    // :: {id:INT} -> PROMISE(VOID)
    // Deletes a group by query id.
    deleteGroup(args = {}) {
        return this._client.request("DELETE", "/admin/group", pick(args, ["id"]));
    }

    // :: {id:INT, user_id:STRING} -> PROMISE({status:STRING})
    // Adds a member to a group.
    addGroupMember(args = {}) {
        return this._client.request("POST", "/admin/group/member", pick(args, ["id", "user_id"]));
    }

    // :: {id:INT, user_id:STRING} -> PROMISE(VOID)
    // Removes a member from a group.
    removeGroupMember(args = {}) {
        return this._client.request("DELETE", "/admin/group/member", pick(args, ["id", "user_id"]));
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: CTGUserClient -> Administration
    // Creates administration operations over one client.
    static init(client) {
        return new this(client);
    }
}

// :: OBJECT, [STRING] -> OBJECT
// Copies named present fields in listed order.
const pick = (source, names) => {
    const result = {};

    for (const name of names) {
        if (source?.[name] !== undefined) {
            result[name] = source[name];
        }
    }

    return result;
};

export { Administration };

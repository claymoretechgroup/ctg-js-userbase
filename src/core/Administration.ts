// Dependency: shared client request primitive.
import CTGUserbaseClient from "./CTGUserbaseClient.js";
// Dependency: string id args shared from account operations.
import type { IdStringArgs } from "./AccountManagement.js";
// Dependency: public administration result types.
import type { GroupEntry, PermissionEntry, Profile, RoleEntry } from "./types.js";

export interface BootstrapAdminArgs {
    secret: string;
    email: string;
    password: string;
}

export interface AdminListUsersArgs {
    limit?: number;
    offset?: number;
}

export interface AdminCreateUserArgs {
    email: string;
    password: string;
    name?: string | null;
    roles?: string[];
    status?: string;
    email_verified?: boolean;
}

export interface AdminUpdateUserArgs {
    id: string;
    name?: string | null;
    status?: string;
    roles?: string[];
}

export interface RoleArgs {
    name: string;
    permissions: string[];
    scoped: boolean;
}

export interface NameArgs {
    name: string;
}

export interface UpdatePermissionArgs {
    name: string;
    new_name: string;
}

export interface IdNumberArgs {
    id: number;
}

export interface CreateGroupArgs {
    name: string;
    roles?: string[];
}

export interface UpdateGroupArgs {
    id: number;
    name?: string;
    roles?: string[];
}

export interface GroupMemberArgs {
    id: number;
    user_id: string;
}

// Applies administration endpoint operations to a CTG userbase client.
export default class Administration {

    /* Instance Fields */
    private readonly _client: CTGUserbaseClient;

    // CONSTRUCTOR :: CTGUserbaseClient -> this
    // Creates administration operations over one client.
    constructor(client: CTGUserbaseClient) {
        this._client = client;
    }

    /**
     *
     * Instance Methods
     *
     */

    // :: {secret:STRING, email:STRING, password:STRING} -> PROMISE(Profile)
    // Bootstraps the first administrator without sending a bearer credential.
    bootstrapAdmin(args: BootstrapAdminArgs): Promise<Profile> {
        return this._client.request(
            "POST",
            "/admin/bootstrap",
            undefined,
            pick(args, ["secret", "email", "password"]),
            "none",
        ) as Promise<Profile>;
    }

    // :: {limit?:NUMBER, offset?:NUMBER} -> PROMISE([Profile])
    // Lists users with optional paging query fields.
    adminListUsers(args: AdminListUsersArgs): Promise<Profile[]> {
        return this._client.request("GET", "/admin/users", pick(args, ["limit", "offset"])) as Promise<Profile[]>;
    }

    // :: {id:STRING} -> PROMISE(Profile)
    // Reads an administrative user record.
    adminGetUser(args: IdStringArgs): Promise<Profile> {
        return this._client.request("GET", "/admin/user", pick(args, ["id"])) as Promise<Profile>;
    }

    // :: {email:STRING, password:STRING, name?:STRING|NULL, roles?:[STRING], status?:STRING, email_verified?:BOOLEAN} -> PROMISE(Profile)
    // Creates a user administratively.
    adminCreateUser(args: AdminCreateUserArgs): Promise<Profile> {
        return this._client.request(
            "POST",
            "/admin/users",
            undefined,
            pick(args, ["email", "password", "name", "roles", "status", "email_verified"]),
        ) as Promise<Profile>;
    }

    // :: {id:STRING, name?:STRING|NULL, status?:STRING, roles?:[STRING]} -> PROMISE(Profile)
    // Updates a user by query id.
    adminUpdateUser(args: AdminUpdateUserArgs): Promise<Profile> {
        return this._client.request("PATCH", "/admin/user", pick(args, ["id"]), pick(args, ["name", "status", "roles"])) as Promise<Profile>;
    }

    // :: {id:STRING} -> PROMISE(VOID)
    // Deletes a user by query id.
    adminDeleteUser(args: IdStringArgs): Promise<void> {
        return this._client.request("DELETE", "/admin/user", pick(args, ["id"])) as Promise<void>;
    }

    // :: VOID -> PROMISE([RoleEntry])
    // Lists roles.
    listRoles(): Promise<RoleEntry[]> {
        return this._client.request("GET", "/admin/roles") as Promise<RoleEntry[]>;
    }

    // :: {name:STRING, permissions:[STRING], scoped:BOOLEAN} -> PROMISE(RoleEntry)
    // Creates a role.
    createRole(args: RoleArgs): Promise<RoleEntry> {
        return this._client.request("POST", "/admin/roles", undefined, pick(args, ["name", "permissions", "scoped"])) as Promise<RoleEntry>;
    }

    // :: {name:STRING, permissions:[STRING], scoped:BOOLEAN} -> PROMISE(RoleEntry)
    // Updates a role by query name.
    updateRole(args: RoleArgs): Promise<RoleEntry> {
        return this._client.request("PUT", "/admin/role", pick(args, ["name"]), pick(args, ["permissions", "scoped"])) as Promise<RoleEntry>;
    }

    // :: {name:STRING} -> PROMISE(VOID)
    // Deletes a role by query name.
    deleteRole(args: NameArgs): Promise<void> {
        return this._client.request("DELETE", "/admin/role", pick(args, ["name"])) as Promise<void>;
    }

    // :: VOID -> PROMISE([PermissionEntry])
    // Lists permissions.
    listPermissions(): Promise<PermissionEntry[]> {
        return this._client.request("GET", "/admin/permissions") as Promise<PermissionEntry[]>;
    }

    // :: {name:STRING} -> PROMISE(PermissionEntry)
    // Creates a permission.
    createPermission(args: NameArgs): Promise<PermissionEntry> {
        return this._client.request("POST", "/admin/permissions", undefined, pick(args, ["name"])) as Promise<PermissionEntry>;
    }

    // :: {name:STRING, new_name:STRING} -> PROMISE(PermissionEntry)
    // Updates a permission by query name.
    updatePermission(args: UpdatePermissionArgs): Promise<PermissionEntry> {
        return this._client.request("PUT", "/admin/permission", pick(args, ["name"]), pick(args, ["new_name"])) as Promise<PermissionEntry>;
    }

    // :: {name:STRING} -> PROMISE(VOID)
    // Deletes a permission by query name.
    deletePermission(args: NameArgs): Promise<void> {
        return this._client.request("DELETE", "/admin/permission", pick(args, ["name"])) as Promise<void>;
    }

    // :: VOID -> PROMISE([GroupEntry])
    // Lists groups.
    listGroups(): Promise<GroupEntry[]> {
        return this._client.request("GET", "/admin/groups") as Promise<GroupEntry[]>;
    }

    // :: {id:NUMBER} -> PROMISE(GroupEntry)
    // Reads a group by query id.
    getGroup(args: IdNumberArgs): Promise<GroupEntry> {
        return this._client.request("GET", "/admin/group", pick(args, ["id"])) as Promise<GroupEntry>;
    }

    // :: {name:STRING, roles?:[STRING]} -> PROMISE(GroupEntry)
    // Creates a group.
    createGroup(args: CreateGroupArgs): Promise<GroupEntry> {
        return this._client.request("POST", "/admin/groups", undefined, pick(args, ["name", "roles"])) as Promise<GroupEntry>;
    }

    // :: {id:NUMBER, name?:STRING, roles?:[STRING]} -> PROMISE(GroupEntry)
    // Updates a group by query id.
    updateGroup(args: UpdateGroupArgs): Promise<GroupEntry> {
        return this._client.request("PATCH", "/admin/group", pick(args, ["id"]), pick(args, ["name", "roles"])) as Promise<GroupEntry>;
    }

    // :: {id:NUMBER} -> PROMISE(VOID)
    // Deletes a group by query id.
    deleteGroup(args: IdNumberArgs): Promise<void> {
        return this._client.request("DELETE", "/admin/group", pick(args, ["id"])) as Promise<void>;
    }

    // :: {id:NUMBER, user_id:STRING} -> PROMISE({status:STRING})
    // Adds a member to a group.
    addGroupMember(args: GroupMemberArgs): Promise<{ status: "member_added" }> {
        return this._client.request("POST", "/admin/group/member", pick(args, ["id", "user_id"])) as Promise<{ status: "member_added" }>;
    }

    // :: {id:NUMBER, user_id:STRING} -> PROMISE(VOID)
    // Removes a member from a group.
    removeGroupMember(args: GroupMemberArgs): Promise<void> {
        return this._client.request("DELETE", "/admin/group/member", pick(args, ["id", "user_id"])) as Promise<void>;
    }

    /**
     *
     * Static Methods
     *
     */

    // Static Factory Method :: CTGUserbaseClient -> Administration
    // Creates administration operations over one client.
    static init(client: CTGUserbaseClient): Administration {
        return new this(client);
    }
}

// :: OBJECT, [STRING] -> OBJECT
// Copies named present fields in listed order.
const pick = (source: object | undefined, names: string[]): Record<string, unknown> => {
    const sourceMap = source as Record<string, unknown> | undefined;
    const result: Record<string, unknown> = {};

    for (const name of names) {
        if (sourceMap?.[name] !== undefined) {
            result[name] = sourceMap[name];
        }
    }

    return result;
};

export { Administration };

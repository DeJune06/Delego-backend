import type { PermissionGrant } from "@delego/types";

/** Soroban permissions contract interface — TODO: Implement contract calls */
export interface PermissionsService {
  grant(grant: PermissionGrant): Promise<string>;
  revoke(contractId: string, spender: string): Promise<void>;
  list(owner: string): Promise<PermissionGrant[]>;
}

export const permissionsService: PermissionsService = {
  async grant(_grant: PermissionGrant): Promise<string> {
    throw new Error("Not implemented — TODO: Soroban permissions contract");
  },
  async revoke(_contractId: string, _spender: string): Promise<void> {
    throw new Error("Not implemented");
  },
  async list(_owner: string): Promise<PermissionGrant[]> {
    return [];
  },
};

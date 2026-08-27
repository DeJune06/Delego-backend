/**
 * Sequelize models for Social Guardian Account Recovery
 * Issue #43
 */
import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";
import type {
  GuardianType,
  RecoveryStatus,
  RecoveryApproval,
} from "./types.js";

// ---------------------------------------------------------------------------
// GuardianModel
// ---------------------------------------------------------------------------

export class GuardianModel extends Model {
  public id!: string;
  public walletAddress!: string;
  public type!: GuardianType;
  public identifier!: string;
  public identifierEncrypted!: string;
  public verified!: boolean;
  public verificationCode!: string | null;
  public verificationExpiresAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

GuardianModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    walletAddress: {
      type: DataTypes.STRING(56),
      allowNull: false,
      field: "wallet_address",
    },
    type: {
      type: DataTypes.ENUM("email", "phone", "wallet"),
      allowNull: false,
    },
    identifier: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    identifierEncrypted: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "identifier_encrypted",
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    verificationCode: {
      type: DataTypes.STRING(12),
      allowNull: true,
      field: "verification_code",
    },
    verificationExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "verification_expires_at",
    },
  },
  {
    sequelize,
    modelName: "Guardian",
    tableName: "recovery_guardians",
    timestamps: true,
    underscored: true,
  },
);

// ---------------------------------------------------------------------------
// RecoveryRequestModel
// ---------------------------------------------------------------------------

export class RecoveryRequestModel extends Model {
  public id!: string;
  public walletAddress!: string;
  public initiatedBy!: string;
  public expiresAt!: Date;
  public status!: RecoveryStatus;
  public approvals!: RecoveryApproval[];
  public requiredApprovals!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

RecoveryRequestModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    walletAddress: {
      type: DataTypes.STRING(56),
      allowNull: false,
      field: "wallet_address",
    },
    initiatedBy: {
      type: DataTypes.STRING(56),
      allowNull: false,
      field: "initiated_by",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "expires_at",
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "approved",
        "rejected",
        "expired",
        "completed",
      ),
      allowNull: false,
      defaultValue: "pending",
    },
    approvals: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    requiredApprovals: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: "required_approvals",
    },
  },
  {
    sequelize,
    modelName: "RecoveryRequest",
    tableName: "recovery_requests",
    timestamps: true,
    underscored: true,
  },
);

// ---------------------------------------------------------------------------
// RecoveryAuditLogModel
// ---------------------------------------------------------------------------

export class RecoveryAuditLogModel extends Model {
  public id!: string;
  public walletAddress!: string;
  public eventType!: string;
  public payload!: Record<string, unknown>;
  public readonly createdAt!: Date;
}

RecoveryAuditLogModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    walletAddress: {
      type: DataTypes.STRING(56),
      allowNull: false,
      field: "wallet_address",
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "event_type",
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: "RecoveryAuditLog",
    tableName: "recovery_audit_logs",
    timestamps: true,
    underscored: true,
    updatedAt: false,
  },
);

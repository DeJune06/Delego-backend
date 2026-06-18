import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class PermissionLevel extends Model {
  public id!: string;
  public delegationId!: string;
  public level!: "VIEW_ONLY" | "AUTO_APPROVE" | "SIGNER" | "ADMIN";
  public description!: string | null;
  public canSign!: boolean;
  public canMutatePolicy!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PermissionLevel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    delegationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "delegations",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    level: {
      type: DataTypes.ENUM("VIEW_ONLY", "AUTO_APPROVE", "SIGNER", "ADMIN"),
      defaultValue: "VIEW_ONLY",
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    canSign: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    canMutatePolicy: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "PermissionLevel",
    tableName: "permission_levels",
    timestamps: true,
    underscored: true,
  }
);

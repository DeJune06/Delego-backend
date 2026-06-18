import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class SpendLimit extends Model {
  public id!: string;
  public userId!: string;
  public walletId!: string | null;
  public delegationId!: string | null;
  public limitPerTransaction!: string | null; // using string for BIGINT in JS
  public limitDaily!: string | null;
  public limitWeekly!: string | null;
  public limitLifetime!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SpendLimit.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "wallets",
        key: "id",
      },
      onDelete: "SET NULL",
    },
    delegationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "delegations",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    limitPerTransaction: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    limitDaily: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    limitWeekly: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    limitLifetime: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "SpendLimit",
    tableName: "spend_limits",
    timestamps: true,
    underscored: true,
  }
);

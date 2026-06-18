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
      field: "user_id",
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "wallet_id",
    },
    delegationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "delegation_id",
    },
    limitPerTransaction: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "limit_per_transaction",
    },
    limitDaily: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "limit_daily",
    },
    limitWeekly: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "limit_weekly",
    },
    limitLifetime: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "limit_lifetime",
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

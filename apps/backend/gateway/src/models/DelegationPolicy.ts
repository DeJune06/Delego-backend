import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class DelegationPolicy extends Model {
  public id!: string;
  public delegationId!: string;
  public restrictedMerchants!: string[];
  public restrictedCategories!: string[];
  public allowedMerchants!: string[];
  public allowedCategories!: string[];
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

DelegationPolicy.init(
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
    restrictedMerchants: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      allowNull: false,
    },
    restrictedCategories: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      allowNull: false,
    },
    allowedMerchants: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      allowNull: false,
    },
    allowedCategories: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "DelegationPolicy",
    tableName: "delegation_policies",
    timestamps: true,
    underscored: true,
  }
);

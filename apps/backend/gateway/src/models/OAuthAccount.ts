import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class OAuthAccount extends Model {
  public id!: string;
  public userId!: string;
  public provider!: string;
  public providerUserId!: string;
  public email!: string | null;
  public displayName!: string | null;
  public avatarUrl!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

OAuthAccount.init(
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
    provider: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    providerUserId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "OAuthAccount",
    tableName: "oauth_accounts",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["provider", "provider_user_id"],
      },
      {
        fields: ["user_id"],
      },
    ],
  }
);

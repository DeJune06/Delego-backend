import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class Wallet extends Model {
  public id!: string;
  public userId!: string;
  public stellarAddress!: string;
  public publicKey!: string;
  public encryptedPrivateKey!: string | null;
  public network!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Wallet.init(
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
    stellarAddress: {
      type: DataTypes.STRING(56),
      allowNull: false,
      unique: true,
    },
    publicKey: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    encryptedPrivateKey: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    network: {
      type: DataTypes.STRING(20),
      defaultValue: "testnet",
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Wallet",
    tableName: "wallets",
    timestamps: true,
    underscored: true,
  }
);

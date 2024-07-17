const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('friendship', {
    friendship_id: {
      type: DataTypes.STRING(35),
      allowNull: false,
      primaryKey: true
    },
    friendship_status: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    user_id: {
      type: DataTypes.STRING(15),
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'user',
        key: 'user_id'
      }
    },
    user_friend_id: {
      type: DataTypes.STRING(15),
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'user',
        key: 'user_id'
      }
    }
  }, {
    sequelize,
    tableName: 'friendship',
    timestamps: true,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "friendship_id" },
          { name: "user_id" },
          { name: "user_friend_id" },
        ]
      },
      {
        name: "friendship_id_UNIQUE",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "friendship_id" },
        ]
      },
      {
        name: "fk_friendship_user1_idx",
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
      {
        name: "fk_friendship_user2_idx",
        using: "BTREE",
        fields: [
          { name: "user_friend_id" },
        ]
      },
    ]
  });
};

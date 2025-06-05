// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.5;

import "./BlindAuction.sol";

/// @title 盲拍工厂合约
/// @notice 用于创建和管理多个盲拍合约
contract BlindAuctionFactory {
    // 事件：新拍卖合约创建
    event AuctionCreated(
        address indexed auctionAddress,
        address indexed beneficiary,
        uint biddingStart,
        uint biddingEnd,
        uint revealEnd,
        string metadata
    );

    // 用户创建的拍卖列表
    mapping(address => address[]) public userAuctions;

    // 所有创建的拍卖列表
    address[] public allAuctions;

    /// @notice 创建新的盲拍合约
    /// @param startTime 竞标开始时间（时间戳）
    /// @param biddingTime 竞标阶段的持续时间（秒）
    /// @param revealTime 披露阶段的持续时间（秒）
    /// @param metadata 拍卖物品的元数据（JSON字符串）
    /// @return 新创建的盲拍合约地址
    function createAuction(
        uint startTime,
        uint biddingTime,
        uint revealTime,
        string memory metadata
    ) external returns (address) {
        // 创建新的盲拍合约
        BlindAuction newAuction = new BlindAuction(
            startTime,
            biddingTime,
            revealTime,
            payable(msg.sender)
        );

        address auctionAddress = address(newAuction);

        // 记录用户创建的拍卖
        userAuctions[msg.sender].push(auctionAddress);

        // 添加到所有拍卖列表
        allAuctions.push(auctionAddress);

        // 触发事件
        emit AuctionCreated(
            auctionAddress,
            msg.sender,
            startTime,
            startTime + biddingTime,
            startTime + biddingTime + revealTime,
            metadata
        );

        return auctionAddress;
    }

    /// @notice 获取用户创建的所有拍卖
    /// @param user 用户地址
    /// @return 该用户创建的所有盲拍合约地址数组
    function getUserAuctions(address user) external view returns (address[] memory) {
        return userAuctions[user];
    }

    /// @notice 获取所有创建的拍卖数量
    /// @return 拍卖总数
    function getAuctionCount() external view returns (uint) {
        return allAuctions.length;
    }

    /// @notice 分页获取所有拍卖
    /// @param offset 起始索引
    /// @param limit 每页数量
    /// @return 拍卖地址数组
    function getAuctions(uint offset, uint limit) external view returns (address[] memory) {
        uint totalCount = allAuctions.length;

        // 调整limit，确保不会越界
        if (offset >= totalCount) {
            return new address[](0);
        }

        uint actualLimit = limit;
        if (offset + limit > totalCount) {
            actualLimit = totalCount - offset;
        }

        address[] memory result = new address[](actualLimit);
        for (uint i = 0; i < actualLimit; i++) {
            result[i] = allAuctions[offset + i];
        }

        return result;
    }
}
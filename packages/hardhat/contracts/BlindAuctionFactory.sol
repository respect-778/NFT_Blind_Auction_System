// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.5;

import "./BlindAuction.sol";
import "./AuctionNFT.sol";

/// @title 盲拍工厂合约
/// @notice 用于创建和管理多个盲拍合约，支持NFT铸造和二级市场
contract BlindAuctionFactory {
    // NFT合约引用
    AuctionNFT public nftContract;
    
    // 事件：新拍卖合约创建
    event AuctionCreated(
        address indexed auctionAddress,
        address indexed beneficiary,
        uint biddingStart,
        uint biddingEnd,
        uint revealEnd,
        string metadata,
        uint256 nftTokenId
    );
    
    // 事件：NFT重新拍卖
    event NFTResaleCreated(
        address indexed auctionAddress,
        address indexed seller,
        uint256 indexed nftTokenId,
        uint256 minPrice
    );

    // 用户创建的拍卖列表
    mapping(address => address[]) public userAuctions;

    // 所有创建的拍卖列表
    address[] public allAuctions;
    
    // NFT ID 到拍卖合约的映射
    mapping(uint256 => address) public nftToAuction;
    
    constructor(address _nftContract) {
        nftContract = AuctionNFT(_nftContract);
    }

    /// @notice 创建NFT拍卖（铸造新NFT并创建拍卖）
    /// @param startTime 竞标开始时间（时间戳）
    /// @param biddingTime 竞标阶段的持续时间（秒）
    /// @param revealTime 披露阶段的持续时间（秒）
    /// @param metadata 拍卖元数据（JSON字符串）
    /// @param nftMetadata NFT元数据
    /// @return auctionAddress 新创建的盲拍合约地址
    /// @return nftTokenId 新铸造的NFT ID
    function createNFTAuction(
        uint startTime,
        uint biddingTime,
        uint revealTime,
        string memory metadata,
        NFTCreationData memory nftMetadata
    ) external returns (address auctionAddress, uint256 nftTokenId) {
        // 首先创建新的盲拍合约（临时使用 nftTokenId = 0）
        BlindAuction newAuction = new BlindAuction(
            startTime,
            biddingTime,
            revealTime,
            payable(msg.sender),
            0, // 临时设置，稍后更新
            address(nftContract)
        );

        auctionAddress = address(newAuction);

        // 然后铸造NFT直接给拍卖合约
        nftTokenId = nftContract.mintAuctionNFT(
            auctionAddress, // 直接铸造给拍卖合约
            nftMetadata.name,
            nftMetadata.description,
            nftMetadata.imageHash,
            nftMetadata.minPrice,
            nftMetadata.tokenURI
        );
        
        // 更新拍卖合约中的NFT ID
        newAuction.setNFTTokenId(nftTokenId);
        
        // 标记NFT已进入拍卖
        nftContract.markAsAuctioned(nftTokenId, auctionAddress);

        // 记录用户创建的拍卖
        userAuctions[msg.sender].push(auctionAddress);

        // 添加到所有拍卖列表
        allAuctions.push(auctionAddress);
        
        // 记录NFT到拍卖的映射
        nftToAuction[nftTokenId] = auctionAddress;

        // 触发事件
        emit AuctionCreated(
            auctionAddress,
            msg.sender,
            startTime,
            startTime + biddingTime,
            startTime + biddingTime + revealTime,
            metadata,
            nftTokenId
        );

        return (auctionAddress, nftTokenId);
    }
    
    /// @notice NFT二级市场：重新拍卖现有NFT
    /// @param nftTokenId NFT ID
    /// @param startTime 竞标开始时间
    /// @param biddingTime 竞标阶段持续时间
    /// @param revealTime 披露阶段持续时间
    /// @param minPrice 最低出价
    /// @return auctionAddress 新创建的拍卖合约地址
    function resellNFT(
        uint256 nftTokenId,
        uint startTime,
        uint biddingTime, 
        uint revealTime,
        uint256 minPrice
    ) external returns (address auctionAddress) {
        // 验证调用者是NFT所有者
        require(nftContract.ownerOf(nftTokenId) == msg.sender, "Not NFT owner");
        
        // 创建新的拍卖合约（二次销售）
        BlindAuction newAuction = new BlindAuction(
            startTime,
            biddingTime,
            revealTime,
            payable(msg.sender), // 当前NFT所有者为受益人
            nftTokenId,
            address(nftContract)
        );
        
        auctionAddress = address(newAuction);
        
        // 将NFT转移给拍卖合约托管
        nftContract.transferFrom(msg.sender, auctionAddress, nftTokenId);
        
        // 标记NFT已拍卖并更新最低价格
        nftContract.markAsAuctionedWithPrice(nftTokenId, auctionAddress, minPrice);
        
        // 记录拍卖信息
        userAuctions[msg.sender].push(auctionAddress);
        allAuctions.push(auctionAddress);
        nftToAuction[nftTokenId] = auctionAddress;
        
        emit NFTResaleCreated(auctionAddress, msg.sender, nftTokenId, minPrice);
        
        return auctionAddress;
    }

    /// @notice 创建传统拍卖（不铸造NFT，向后兼容）
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
        // 创建新的盲拍合约（传统模式，不涉及NFT）
        BlindAuction newAuction = new BlindAuction(
            startTime,
            biddingTime,
            revealTime,
            payable(msg.sender),
            0, // nftTokenId = 0 表示传统拍卖
            address(0) // 不使用NFT合约
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
            metadata,
            0 // 传统拍卖没有NFT
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

    /// @notice 获取所有拍卖地址
    /// @param start 起始索引
    /// @param count 获取数量
    /// @return 拍卖地址数组
    function getAuctions(uint256 start, uint256 count) external view returns (address[] memory) {
        // 如果没有拍卖，直接返回空数组
        if (allAuctions.length == 0) {
            return new address[](0);
        }
        
        // 如果起始索引超出范围，返回空数组
        if (start >= allAuctions.length) {
            return new address[](0);
        }
        
        uint256 end = start + count;
        if (end > allAuctions.length) {
            end = allAuctions.length;
        }
        
        address[] memory result = new address[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = allAuctions[i];
        }
        
        return result;
    }
    
    /// @notice 获取NFT对应的拍卖合约
    /// @param nftTokenId NFT ID
    /// @return 拍卖合约地址
    function getNFTAuction(uint256 nftTokenId) external view returns (address) {
        return nftToAuction[nftTokenId];
    }

    /// @notice 拍卖结束通知函数（由拍卖合约调用）
    /// @param nftTokenId NFT ID
    /// @param winner 拍卖获胜者地址
    function notifyAuctionEnded(uint256 nftTokenId, address winner) external {
        // 验证调用者是有效的拍卖合约
        require(nftToAuction[nftTokenId] == msg.sender, "Invalid auction contract");
        
        // 更新NFT状态为不再拍卖
        nftContract.markAsNotAuctioned(nftTokenId, winner);
    }
}

// NFT创建数据结构
struct NFTCreationData {
    string name;
    string description;
    string imageHash;
    uint256 minPrice;
    string tokenURI;
}
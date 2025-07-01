// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/// @title 拍卖NFT合约
/// @notice 管理拍卖物品的NFT化，每个拍卖物品都是唯一的NFT
contract AuctionNFT is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

    // NFT计数器
    Counters.Counter private _tokenIdCounter;
    
    // NFT元数据结构
    struct NFTMetadata {
        string name;           // 物品名称
        string description;    // 物品描述
        string imageHash;      // IPFS图片哈希
        uint256 minPrice;      // 最低出价
        address creator;       // 创建者
        bool isAuctioned;      // 是否已拍卖
        address auctionContract; // 关联的拍卖合约地址
        uint256 createTime;    // 创建时间
    }
    
    // NFT元数据映射
    mapping(uint256 => NFTMetadata) public nftMetadata;
    
    // 创建者的NFT列表
    mapping(address => uint256[]) public creatorNFTs;
    
    // 拍卖工厂合约地址（只有工厂合约可以铸造NFT）
    address public factoryContract;
    
    // 事件
    event NFTMinted(uint256 indexed tokenId, address indexed creator, string name);
    event NFTAuctioned(uint256 indexed tokenId, address indexed auctionContract);
    event NFTAuctionEnded(uint256 indexed tokenId, address indexed winner);
    
    constructor() ERC721("AuctionNFT", "ANFT") {}
    
    /// @notice 设置工厂合约地址
    /// @param _factoryContract 工厂合约地址
    function setFactoryContract(address _factoryContract) external onlyOwner {
        factoryContract = _factoryContract;
    }
    
    modifier onlyFactory() {
        require(msg.sender == factoryContract, "Only factory can call this function");
        _;
    }
    
    /// @notice 公开的NFT铸造函数（用户可直接调用）
    /// @param name 物品名称
    /// @param description 物品描述
    /// @param imageHash IPFS图片哈希
    /// @param minPrice 最低出价
    /// @param metadataURI NFT元数据URI
    /// @return tokenId 新铸造的NFT ID
    function mintNFT(
        string memory name,
        string memory description, 
        string memory imageHash,
        uint256 minPrice,
        string memory metadataURI
    ) external returns (uint256) {
        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();
        
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);
        
        // 设置NFT元数据
        nftMetadata[tokenId] = NFTMetadata({
            name: name,
            description: description,
            imageHash: imageHash,
            minPrice: minPrice,
            creator: msg.sender,
            isAuctioned: false,
            auctionContract: address(0),
            createTime: block.timestamp
        });
        
        // 添加到创建者列表
        creatorNFTs[msg.sender].push(tokenId);
        
        emit NFTMinted(tokenId, msg.sender, name);
        
        return tokenId;
    }
    
    /// @notice 铸造NFT（只能由工厂合约调用）
    /// @param to NFT接收者
    /// @param name 物品名称
    /// @param description 物品描述
    /// @param imageHash IPFS图片哈希
    /// @param minPrice 最低出价
    /// @param metadataURI NFT元数据URI
    /// @return tokenId 新铸造的NFT ID
    function mintAuctionNFT(
        address to,
        string memory name,
        string memory description, 
        string memory imageHash,
        uint256 minPrice,
        string memory metadataURI
    ) external onlyFactory returns (uint256) {
        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);
        
        // 设置NFT元数据
        nftMetadata[tokenId] = NFTMetadata({
            name: name,
            description: description,
            imageHash: imageHash,
            minPrice: minPrice,
            creator: to,
            isAuctioned: false,
            auctionContract: address(0),
            createTime: block.timestamp
        });
        
        // 添加到创建者列表
        creatorNFTs[to].push(tokenId);
        
        emit NFTMinted(tokenId, to, name);
        
        return tokenId;
    }
    
    /// @notice 标记NFT已拍卖（只能由工厂合约调用）
    /// @param tokenId NFT ID
    /// @param auctionContract 拍卖合约地址
    function markAsAuctioned(uint256 tokenId, address auctionContract) external onlyFactory {
        require(_exists(tokenId), "NFT does not exist");
        nftMetadata[tokenId].isAuctioned = true;
        nftMetadata[tokenId].auctionContract = auctionContract;
        
        emit NFTAuctioned(tokenId, auctionContract);
    }
    
    /// @notice 标记NFT已拍卖并更新最低价格（只能由工厂合约调用）
    /// @param tokenId NFT ID
    /// @param auctionContract 拍卖合约地址
    /// @param newMinPrice 新的最低价格
    function markAsAuctionedWithPrice(uint256 tokenId, address auctionContract, uint256 newMinPrice) external onlyFactory {
        require(_exists(tokenId), "NFT does not exist");
        nftMetadata[tokenId].isAuctioned = true;
        nftMetadata[tokenId].auctionContract = auctionContract;
        nftMetadata[tokenId].minPrice = newMinPrice;
        
        emit NFTAuctioned(tokenId, auctionContract);
    }
    
    /// @notice 标记NFT拍卖已结束，恢复为可出售状态（只能由工厂合约调用）
    /// @param tokenId NFT ID
    /// @param winner 拍卖获胜者地址
    function markAsNotAuctioned(uint256 tokenId, address winner) external onlyFactory {
        require(_exists(tokenId), "NFT does not exist");
        nftMetadata[tokenId].isAuctioned = false;
        nftMetadata[tokenId].auctionContract = address(0);
        
        emit NFTAuctionEnded(tokenId, winner);
    }
    
    /// @notice 获取用户拥有的所有NFT
    /// @param user 用户地址
    /// @return tokenIds NFT ID数组
    function getUserNFTs(address user) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(user);
        uint256[] memory tokenIds = new uint256[](balance);
        uint256 index = 0;
        
        for (uint256 i = 1; i <= _tokenIdCounter.current(); i++) {
            if (_exists(i) && ownerOf(i) == user) {
                tokenIds[index] = i;
                index++;
            }
        }
        
        return tokenIds;
    }
    
    /// @notice 获取用户创建的所有NFT
    /// @param creator 创建者地址
    /// @return tokenIds NFT ID数组
    function getCreatedNFTs(address creator) external view returns (uint256[] memory) {
        return creatorNFTs[creator];
    }
    
    /// @notice 获取总NFT数量
    /// @return 总数量
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter.current();
    }
    
    // 重写必要的函数
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
} 
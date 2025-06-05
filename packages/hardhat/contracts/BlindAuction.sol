// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

/// @title 盲拍（Blind Auction）智能合约
/// @notice 该合约允许用户进行匿名竞标，之后再披露出价，保障竞标的公平性    
contract BlindAuction {
    // 结构体：表示一个盲拍出价，包含加密后的出价和押金
    struct Bid {
        bytes32 blindedBid; // 使用 keccak256(value, fake, secret) 生成的哈希值
        uint deposit;       // 随出价一同发送的押金
    }

    address payable public beneficiary; // 拍卖受益人，最终收到最高出价金额的人
    uint public biddingStart;           // 竞标开始时间（时间戳）
    uint public biddingEnd;             // 竞标结束时间（时间戳）
    uint public revealEnd;              // 披露阶段结束时间（时间戳）
    bool public ended;                  // 拍卖是否已结束

    mapping(address => Bid[]) public bids; // 每个地址对应的出价列表

    address public highestBidder; // 当前最高出价者
    uint public highestBid;       // 当前最高出价金额

    // 可取回的竞标押金（如果不是最高出价）
    mapping(address => uint) pendingReturns;

    // 拍卖结束事件
    event AuctionEnded(address winner, uint highestBid);
    // 增加竞标事件便于前端监听
    event BidSubmitted(address bidder, uint deposit);
    // 披露竞标结果事件
    event BidRevealed(address bidder, uint value, bool success);

    // 自定义错误信息（gas 优化方式）
    error TooEarly(uint time);             // 函数调用过早
    error TooLate(uint time);              // 函数调用过晚
    error AuctionEndAlreadyCalled();       // auctionEnd 函数已被调用过

    /// 修饰符：要求当前时间小于指定时间，主要用于限制 bid 阶段调用
    modifier onlyBefore(uint time) {
        if (block.timestamp >= time) revert TooLate(time);
        _;
    }

    /// 修饰符：要求当前时间大于指定时间，主要用于 reveal 和 auctionEnd
    modifier onlyAfter(uint time) {
        if (block.timestamp <= time) revert TooEarly(time);
        _;
    }

    /// 构造函数，初始化受益人、竞标开始时间和各阶段时长
    /// @param startTime 竞标开始时间（时间戳）
    /// @param biddingTime 竞标阶段的持续时间（秒）
    /// @param revealTime 披露阶段的持续时间（秒）
    /// @param beneficiaryAddress 受益人地址
    constructor(
        uint startTime,
        uint biddingTime,
        uint revealTime,
        address payable beneficiaryAddress
    ) {
        beneficiary = beneficiaryAddress;
        biddingStart = startTime;
        biddingEnd = startTime + biddingTime;
        revealEnd = biddingEnd + revealTime;
    }

    /// 用户提交盲拍（加密的出价）
    /// @param blindedBid 加密后的出价值（keccak256(value, fake, secret)）
    function bid(bytes32 blindedBid)
        external
        payable
        onlyAfter(biddingStart)  // 只能在竞标开始后调用
        onlyBefore(biddingEnd)   // 只能在竞标阶段调用
    {
        // 将出价加入当前用户的出价列表
        bids[msg.sender].push(Bid({
            blindedBid: blindedBid,
            deposit: msg.value
        }));
        
        // 触发竞标事件
        emit BidSubmitted(msg.sender, msg.value);
    }

    /// 披露阶段：用户公开其盲拍的真实数据
    /// @param values 出价金额数组
    /// @param fakes 是否为假出价（true 表示该出价为虚假）
    /// @param secrets 每个出价对应的私密值
    function reveal(
        uint[] calldata values,
        bool[] calldata fakes,
        bytes32[] calldata secrets
    )
        external
        onlyAfter(biddingEnd)    // 只能在竞标结束后调用
        onlyBefore(revealEnd)    // 且必须在披露阶段结束前
    {
        uint length = bids[msg.sender].length;
        require(values.length == length, "Array lengths do not match");
        require(fakes.length == length, "Array lengths do not match");
        require(secrets.length == length, "Array lengths do not match");

        uint refund = 0; // 最终需要退还的金额

        for (uint i = 0; i < length; i++) {
            Bid storage bidToCheck = bids[msg.sender][i];

            // 拿到用户的披露数据
            (uint value, bool fake, bytes32 secret) =
                    (values[i], fakes[i], secrets[i]);

            // 校验 hash 是否一致，验证盲拍的合法性
            if (bidToCheck.blindedBid != keccak256(abi.encodePacked(value, fake, secret))) {
                // 如果不一致，则该出价作废，不退还押金
                continue;
            }

            refund += bidToCheck.deposit; // 押金暂时计入退款

            // 如果不是假出价，并且押金大于等于出价金额
            if (!fake && bidToCheck.deposit >= value) {
                // 尝试将其设置为当前最高出价
                if (placeBid(msg.sender, value)) {
                    refund -= value; // 成为最高出价则不能退还该部分
                    emit BidRevealed(msg.sender, value, true);
                } else {
                    emit BidRevealed(msg.sender, value, false);
                }
            } else {
                emit BidRevealed(msg.sender, 0, false);
            }

            // 重置该出价，防止重复认领
            bidToCheck.blindedBid = bytes32(0);
        }

        // 将应退还金额返还给用户
        if (refund > 0) {
            payable(msg.sender).transfer(refund);
        }
    }

    /// 用户取回未成功的竞标所冻结的押金
    function withdraw() external {
        uint amount = pendingReturns[msg.sender];
        if (amount > 0) {
            // 防止重入攻击：先置 0
            pendingReturns[msg.sender] = 0;
            payable(msg.sender).transfer(amount);
        }
    }

    /// 结束拍卖：只能调用一次，将最高出价金额转给受益人
    function auctionEnd()
        external
        onlyAfter(revealEnd) // 只能在披露阶段后调用
    {
        if (ended) revert AuctionEndAlreadyCalled();

        emit AuctionEnded(highestBidder, highestBid); // 触发拍卖结束事件

        ended = true;

        beneficiary.transfer(highestBid); // 转账给受益人
    }

    /// 内部函数：尝试设置新的最高出价
    /// @param bidder 出价人地址
    /// @param value 出价金额
    function placeBid(address bidder, uint value) internal
            returns (bool success)
    {
        if (value <= highestBid) {
            return false; // 不是最高出价，忽略
        }

        // 如果已有最高出价者，则先退还之前的出价
        if (highestBidder != address(0)) {
            pendingReturns[highestBidder] += highestBid;
        }

        // 设置新的最高出价者和出价
        highestBid = value;
        highestBidder = bidder;
        return true;
    }
    
    /// 查询竞标开始剩余时间
    function biddingStartTimeLeft() public view returns (uint) {
        if (block.timestamp >= biddingStart) return 0;
        return biddingStart - block.timestamp;
    }
    
    /// 查询竞标阶段剩余时间
    function biddingTimeLeft() public view returns (uint) {
        if (block.timestamp >= biddingEnd) return 0;
        return biddingEnd - block.timestamp;
    }
    
    /// 查询披露阶段剩余时间
    function revealTimeLeft() public view returns (uint) {
        if (block.timestamp <= biddingEnd) return 0;
        if (block.timestamp >= revealEnd) return 0;
        return revealEnd - block.timestamp;
    }
    
    /// 获取用户的出价数量
    function getBidCount(address bidder) public view returns (uint) {
        return bids[bidder].length;
    }
    
    /// 获取竞标阶段状态
    /// @return 0-未开始 1-竞标阶段 2-披露阶段 3-拍卖结束
    function getAuctionPhase() public view returns (uint) {
        if (block.timestamp < biddingStart) return 0; // 未开始
        if (block.timestamp < biddingEnd) return 1;   // 竞标阶段
        if (block.timestamp < revealEnd) return 2;    // 披露阶段
        return 3; // 拍卖结束
    }
} 
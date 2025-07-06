"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { MetaHeader } from "~~/components/MetaHeader";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { useRouter } from "next/navigation";
import { formatEther, parseEther } from 'viem';
import MeteorRain from "../../components/MeteorRain";
import { useWriteContract } from "wagmi";
import { OptimizedImage } from "~~/components/OptimizedImage";
import { ConnectButton } from "@rainbow-me/rainbowkit";

type AuctionTab = "created" | "participated" | "nfts";
type AuctionData = {
  address: `0x${string}`;
  metadata: {
    name: string;
    description: string;
    image: string;
    minPrice: string;
  };
  beneficiary: `0x${string}`;
  biddingStart?: bigint;
  biddingEnd: bigint;
  revealEnd: bigint;
  ended: boolean;
  state: "pending" | "bidding" | "revealing" | "ended";
};

type NFTData = {
  tokenId: number;
  name: string;
  description: string;
  image: string;
  creator: string;
  owner: string;
  isAuctioned: boolean;
  auctionContract?: string;
};

const MyAssets = () => {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<AuctionTab>("created");
  const [loading, setLoading] = useState(false);
  const [createdAuctions, setCreatedAuctions] = useState<AuctionData[]>([]);
  const [participatedAuctions, setParticipatedAuctions] = useState<AuctionData[]>([]);
  const [myNFTs, setMyNFTs] = useState<NFTData[]>([]);
  const router = useRouter();

  // 钩子
  const { writeContractAsync } = useWriteContract();

  // 获取合约信息
  const { data: factoryContractData } = useDeployedContractInfo("BlindAuctionFactory");
  const { data: blindAuctionData } = useDeployedContractInfo("BlindAuction");
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });

  // 加载用户的拍卖数据
  useEffect(() => {
    if (!address || !factoryContractData || !blindAuctionData || !nftContractData || !publicClient) return;

    const loadUserAuctions = async () => {
      setLoading(true);
      try {
        console.log("开始获取用户拍卖数据...");
        console.log("当前用户地址:", address);
        console.log("工厂合约地址:", factoryContractData.address);

        // 首先尝试通过事件日志获取用户创建的拍卖（更可靠的方法）
        let userAuctions: `0x${string}`[] = [];

        try {
          console.log("通过事件日志获取用户创建的拍卖...");
          const createdLogs = await publicClient.getContractEvents({
            address: factoryContractData.address,
            abi: factoryContractData.abi,
            eventName: 'AuctionCreated',
            args: {
              beneficiary: address
            },
            fromBlock: BigInt(0),
          });

          console.log("通过事件日志找到的拍卖创建记录:", createdLogs);

          if (createdLogs.length > 0) {
            // 从事件日志中提取拍卖地址
            const auctionAddressesFromLogs = createdLogs.map(log => log.args?.auctionAddress).filter(Boolean) as `0x${string}`[];
            console.log("从事件日志提取的拍卖地址:", auctionAddressesFromLogs);
            userAuctions = auctionAddressesFromLogs;
          }
        } catch (logError) {
          console.error("通过事件日志查找拍卖失败:", logError);
        }

        // 如果事件日志方法失败或没有结果，尝试getUserAuctions方法
        if (userAuctions.length === 0) {
          try {
            console.log("事件日志方法无结果，尝试getUserAuctions方法...");
            const contractUserAuctions = await publicClient.readContract({
              address: factoryContractData.address,
              abi: factoryContractData.abi,
              functionName: 'getUserAuctions',
              args: [address],
            }) as `0x${string}`[];

            console.log("工厂合约getUserAuctions返回:", contractUserAuctions);
            userAuctions = contractUserAuctions;
          } catch (contractError) {
            console.error("getUserAuctions调用失败:", contractError);
          }
        }

        console.log("最终确定的用户拍卖列表:", userAuctions);
        console.log("用户拍卖数量:", userAuctions.length);

        // 获取每个拍卖的详细信息，直接从链上获取
        const fetchedCreatedAuctions = await Promise.all(
          userAuctions.map(async (auctionAddress) => {
            try {
              // 首先验证合约地址是否有效
              const contractCode = await publicClient.getBytecode({ address: auctionAddress });
              if (!contractCode || contractCode === '0x') {
                console.warn(`拍卖地址 ${auctionAddress} 不是有效的合约地址，跳过`);
                return null;
              }

              // 获取拍卖基本信息
              const [beneficiary, biddingStart, biddingEnd, revealEnd, ended] = await Promise.all([
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'beneficiary',
                }),
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'biddingStart',
                }),
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'biddingEnd',
                }),
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'revealEnd',
                }),
                publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'ended',
                }),
              ]) as [`0x${string}`, bigint, bigint, bigint, boolean];

              // 尝试获取拍卖元数据
              let metadata = {
                name: "未命名拍卖",
                description: "无描述",
                image: "",
                minPrice: "0",
              };

              try {
                // 首先尝试检查是否为NFT拍卖
                const isNFTAuction = await publicClient.readContract({
                  address: auctionAddress,
                  abi: blindAuctionData.abi,
                  functionName: 'isNFTAuction',
                }) as boolean;

                console.log(`创建的拍卖 ${auctionAddress} 是否为NFT拍卖:`, isNFTAuction);

                if (isNFTAuction && nftContractData) {
                  // 获取NFT Token ID和合约地址
                  const [nftTokenId, nftContractAddress] = await Promise.all([
                    publicClient.readContract({
                      address: auctionAddress,
                      abi: blindAuctionData.abi,
                      functionName: 'nftTokenId',
                    }) as Promise<bigint>,
                    publicClient.readContract({
                      address: auctionAddress,
                      abi: blindAuctionData.abi,
                      functionName: 'nftContract',
                    }) as Promise<`0x${string}`>
                  ]);

                  console.log(`创建的NFT拍卖 - Token ID: ${nftTokenId}, 合约地址: ${nftContractAddress}`);

                  if (nftContractAddress && nftTokenId > 0n) {
                    try {
                      // 从NFT合约获取元数据
                      const nftMetadata = await publicClient.readContract({
                        address: nftContractAddress,
                        abi: nftContractData.abi,
                        functionName: 'nftMetadata',
                        args: [nftTokenId],
                      }) as readonly [string, string, string, bigint, `0x${string}`, boolean, `0x${string}`, bigint];

                      const [name, description, imageHash, minPriceWei] = nftMetadata;

                      // 构建图片URL
                      let imageUrl = "";
                      if (imageHash) {
                        if (imageHash.startsWith('http')) {
                          imageUrl = imageHash;
                        } else if (imageHash.startsWith('ipfs://')) {
                          const hash = imageHash.replace('ipfs://', '');
                          imageUrl = `https://ipfs.io/ipfs/${hash}`;
                        } else if (imageHash.trim()) {
                          imageUrl = `https://ipfs.io/ipfs/${imageHash}`;
                        }
                      }

                      // 转换价格
                      const minPriceValue = minPriceWei ? (Number(minPriceWei) / 10 ** 18).toString() : "0";

                      metadata = {
                        name: name || `NFT #${Number(nftTokenId)}`,
                        description: description || "无描述",
                        image: imageUrl,
                        minPrice: minPriceValue,
                      };

                      console.log("从NFT合约获取到创建拍卖的元数据:", metadata);
                    } catch (nftError) {
                      console.error("从NFT合约获取创建拍卖元数据失败:", nftError);
                    }
                  }
                }

                // 如果从NFT合约获取失败或不是NFT拍卖，尝试从事件日志获取
                if (!metadata.image) {
                  console.log("尝试从事件日志获取创建拍卖的元数据...");
                  // 通过过滤区块日志方式获取创建事件
                  const logs = await publicClient.getContractEvents({
                    address: factoryContractData.address,
                    abi: factoryContractData.abi,
                    eventName: 'AuctionCreated',
                    args: {
                      auctionAddress: auctionAddress
                    },
                    fromBlock: BigInt(0),
                  });

                  if (logs && logs.length > 0 && logs[0].args) {
                    const metadataStr = logs[0].args.metadata as string;
                    if (metadataStr) {
                      try {
                        const parsedMetadata = JSON.parse(metadataStr);
                        metadata = {
                          ...parsedMetadata,
                          // 确保图片URL正确格式化
                          image: parsedMetadata.imageHash
                            ? `https://ipfs.io/ipfs/${parsedMetadata.imageHash}`
                            : parsedMetadata.image || ""
                        };
                        console.log("从事件日志获取到创建拍卖的元数据:", metadata);
                      } catch (e) {
                        console.error("解析创建拍卖元数据字符串失败:", e);
                      }
                    }
                  }
                }
              } catch (error) {
                console.error("获取创建拍卖元数据失败:", error);
              }

              // 确定拍卖状态
              let state: "pending" | "bidding" | "revealing" | "ended" = "bidding";
              const now = BigInt(Math.floor(Date.now() / 1000));

              if (ended) {
                state = "ended";
              } else if (now > revealEnd) {
                // 如果揭示阶段已过但合约的ended状态还没更新，仍然标记为已结束
                state = "ended";
              } else if (now > biddingEnd) {
                state = "revealing";
              } else if (now < biddingStart) {
                // 如果当前时间早于竞拍开始时间，标记为未开始
                state = "pending";
              } else {
                // 当前时间在竞拍开始和结束之间
                state = "bidding";
              }

              const auctionData: AuctionData = {
                address: auctionAddress,
                metadata,
                beneficiary,
                biddingStart,
                biddingEnd,
                revealEnd,
                ended,
                state,
              };

              // 移除缓存逻辑，直接返回拍卖数据
              return auctionData;
            } catch (error) {
              console.error(`获取拍卖 ${auctionAddress} 信息失败:`, error);
              return null;
            }
          })
        );

        // 设置创建的拍卖数据
        setCreatedAuctions(fetchedCreatedAuctions.filter(Boolean) as AuctionData[]);

        // 从本地存储获取用户参与过的拍卖
        try {
          // 从localStorage获取用户的竞拍记录 - 使用标准化的地址格式
          const normalizedAddress = address.toLowerCase();
          const storedBids = localStorage.getItem(`bids_${normalizedAddress}`);
          console.log("从localStorage读取的竞拍记录:", storedBids);

          if (storedBids) {
            const parsedBids = JSON.parse(storedBids);
            console.log("解析后的竞拍记录:", parsedBids);

            // 获取用户参与过的拍卖地址
            const participatedAddresses = new Set<string>();
            parsedBids.forEach((bid: any) => {
              if (bid.auctionAddress) {
                participatedAddresses.add(bid.auctionAddress);
                console.log("添加参与的拍卖地址:", bid.auctionAddress);
              }
            });

            console.log("用户参与的拍卖地址总数:", participatedAddresses.size);
            console.log("用户参与的拍卖地址:", Array.from(participatedAddresses));

            // 获取这些拍卖的详细信息，直接从链上获取
            const fetchedParticipatedData = await Promise.all(
              Array.from(participatedAddresses).map(async (auctionAddress) => {
                try {
                  // 首先验证合约地址是否有效
                  const contractCode = await publicClient.getBytecode({ address: auctionAddress as `0x${string}` });
                  if (!contractCode || contractCode === '0x') {
                    console.warn(`拍卖地址 ${auctionAddress} 不是有效的合约地址，跳过`);
                    return null;
                  }

                  // 重用上面的拍卖信息获取逻辑
                  const [beneficiary, biddingStart, biddingEnd, revealEnd, ended] = await Promise.all([
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'beneficiary',
                    }),
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'biddingStart',
                    }),
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'biddingEnd',
                    }),
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'revealEnd',
                    }),
                    publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'ended',
                    }),
                  ]) as [`0x${string}`, bigint, bigint, bigint, boolean];

                  // 尝试获取拍卖元数据
                  let metadata = {
                    name: "未命名拍卖",
                    description: "无描述",
                    image: "",
                    minPrice: "0",
                  };

                  try {
                    // 首先尝试检查是否为NFT拍卖
                    const isNFTAuction = await publicClient.readContract({
                      address: auctionAddress as `0x${string}`,
                      abi: blindAuctionData.abi,
                      functionName: 'isNFTAuction',
                    }) as boolean;

                    console.log(`参与的拍卖 ${auctionAddress} 是否为NFT拍卖:`, isNFTAuction);

                    if (isNFTAuction && nftContractData) {
                      // 获取NFT Token ID和合约地址
                      const [nftTokenId, nftContractAddress] = await Promise.all([
                        publicClient.readContract({
                          address: auctionAddress as `0x${string}`,
                          abi: blindAuctionData.abi,
                          functionName: 'nftTokenId',
                        }) as Promise<bigint>,
                        publicClient.readContract({
                          address: auctionAddress as `0x${string}`,
                          abi: blindAuctionData.abi,
                          functionName: 'nftContract',
                        }) as Promise<`0x${string}`>
                      ]);

                      console.log(`参与的NFT拍卖 - Token ID: ${nftTokenId}, 合约地址: ${nftContractAddress}`);

                      if (nftContractAddress && nftTokenId > 0n) {
                        try {
                          // 从NFT合约获取元数据
                          const nftMetadata = await publicClient.readContract({
                            address: nftContractAddress,
                            abi: nftContractData.abi,
                            functionName: 'nftMetadata',
                            args: [nftTokenId],
                          }) as readonly [string, string, string, bigint, `0x${string}`, boolean, `0x${string}`, bigint];

                          const [name, description, imageHash, minPriceWei] = nftMetadata;

                          // 构建图片URL
                          let imageUrl = "";
                          if (imageHash) {
                            if (imageHash.startsWith('http')) {
                              imageUrl = imageHash;
                            } else if (imageHash.startsWith('ipfs://')) {
                              const hash = imageHash.replace('ipfs://', '');
                              imageUrl = `https://ipfs.io/ipfs/${hash}`;
                            } else if (imageHash.trim()) {
                              imageUrl = `https://ipfs.io/ipfs/${imageHash}`;
                            }
                          }

                          // 转换价格
                          const minPriceValue = minPriceWei ? (Number(minPriceWei) / 10 ** 18).toString() : "0";

                          metadata = {
                            name: name || `NFT #${Number(nftTokenId)}`,
                            description: description || "无描述",
                            image: imageUrl,
                            minPrice: minPriceValue,
                          };

                          console.log("从NFT合约获取到参与拍卖的元数据:", metadata);
                        } catch (nftError) {
                          console.error("从NFT合约获取参与拍卖元数据失败:", nftError);
                        }
                      }
                    }

                    // 如果从NFT合约获取失败或不是NFT拍卖，尝试从事件日志获取
                    if (!metadata.image && factoryContractData) {
                      console.log("尝试从事件日志获取参与拍卖的元数据...");
                      const logs = await publicClient.getContractEvents({
                        address: factoryContractData.address,
                        abi: factoryContractData.abi,
                        eventName: 'AuctionCreated',
                        args: {
                          auctionAddress: auctionAddress as `0x${string}`
                        },
                        fromBlock: BigInt(0),
                      });

                      if (logs && logs.length > 0 && logs[0].args) {
                        const metadataStr = logs[0].args.metadata as string;
                        if (metadataStr) {
                          try {
                            const parsedMetadata = JSON.parse(metadataStr);
                            metadata = {
                              ...parsedMetadata,
                              // 确保图片URL正确格式化
                              image: parsedMetadata.imageHash
                                ? `https://ipfs.io/ipfs/${parsedMetadata.imageHash}`
                                : parsedMetadata.image || ""
                            };
                            console.log("从事件日志获取到参与拍卖的元数据:", metadata);
                          } catch (e) {
                            console.error("解析参与拍卖元数据字符串失败:", e);
                          }
                        }
                      }
                    }
                  } catch (error) {
                    console.error("获取参与拍卖元数据失败:", error);
                  }

                  // 确定拍卖状态
                  let state: "pending" | "bidding" | "revealing" | "ended" = "bidding";
                  const now = BigInt(Math.floor(Date.now() / 1000));

                  if (ended) {
                    state = "ended";
                  } else if (now > revealEnd) {
                    // 如果揭示阶段已过但合约的ended状态还没更新，仍然标记为已结束
                    state = "ended";
                  } else if (now > biddingEnd) {
                    state = "revealing";
                  } else if (now < biddingStart) {
                    // 如果当前时间早于竞拍开始时间，标记为未开始
                    state = "pending";
                  } else {
                    // 当前时间在竞拍开始和结束之间
                    state = "bidding";
                  }

                  const auctionData: AuctionData = {
                    address: auctionAddress as `0x${string}`,
                    metadata,
                    beneficiary,
                    biddingStart,
                    biddingEnd,
                    revealEnd,
                    ended,
                    state,
                  };

                  return auctionData;
                } catch (error) {
                  console.error(`获取拍卖 ${auctionAddress} 信息失败:`, error);
                  return null;
                }
              })
            );

            // 设置参与的拍卖数据
            setParticipatedAuctions(fetchedParticipatedData.filter(Boolean) as AuctionData[]);
          }
        } catch (error) {
          console.error("加载参与的拍卖失败:", error);
        }

        // 获取用户的NFT（如果存在NFT合约）
        if (nftContractData) {
          try {
            console.log("开始获取用户NFT...");
            console.log("NFT合约地址:", nftContractData.address);
            console.log("用户地址:", address);

            // 首先检查NFT合约是否正确部署
            const contractCode = await publicClient.getBytecode({ address: nftContractData.address });
            if (!contractCode || contractCode === '0x') {
              console.error("NFT合约未正确部署");
              return;
            }

            // 获取用户拥有的NFT token ID列表
            const userNFTs = await publicClient.readContract({
              address: nftContractData.address,
              abi: nftContractData.abi,
              functionName: 'getUserNFTs',
              args: [address],
            }) as bigint[];

            console.log("用户NFT token IDs:", userNFTs);
            console.log("NFT数量:", userNFTs.length);

            if (userNFTs.length === 0) {
              console.log("用户没有任何NFT");
              setMyNFTs([]);
              return;
            }

            // 获取每个NFT的详细信息
            const nftDetails = await Promise.all(
              userNFTs.map(async (tokenId) => {
                try {
                  console.log(`获取NFT ${tokenId} 的详细信息...`);

                  // 检查NFT是否存在
                  try {
                    const exists = await publicClient.readContract({
                      address: nftContractData.address,
                      abi: nftContractData.abi,
                      functionName: 'ownerOf',
                      args: [tokenId],
                    });
                    if (!exists) {
                      console.log(`NFT ${tokenId} 不存在`);
                      return null;
                    }
                  } catch (ownerError) {
                    console.log(`NFT ${tokenId} 可能不存在:`, ownerError);
                    return null;
                  }

                  const [metadata, owner] = await Promise.all([
                    publicClient.readContract({
                      address: nftContractData.address,
                      abi: nftContractData.abi,
                      functionName: 'nftMetadata',
                      args: [tokenId],
                    }).catch(error => {
                      console.error(`获取NFT ${tokenId} 元数据失败:`, error);
                      return null;
                    }),
                    publicClient.readContract({
                      address: nftContractData.address,
                      abi: nftContractData.abi,
                      functionName: 'ownerOf',
                      args: [tokenId],
                    }).catch(error => {
                      console.error(`获取NFT ${tokenId} 所有者失败:`, error);
                      return null;
                    }),
                  ]);

                  if (!metadata || !owner) {
                    console.log(`NFT ${tokenId} 数据获取失败`);
                    return null;
                  }

                  const nftMetadata = metadata as any;
                  console.log(`NFT ${tokenId} 原始元数据:`, nftMetadata);

                  // 处理不同的元数据格式
                  let name = "未命名NFT";
                  let description = "无描述";
                  let imageHash = "";
                  let isAuctioned = false;
                  let auctionContract = "";

                  if (Array.isArray(nftMetadata)) {
                    // 如果是数组格式：[name, description, imageHash, minPrice, creator, isAuctioned, auctionContract, createTime]
                    [name, description, imageHash] = nftMetadata;
                    isAuctioned = nftMetadata[5] || false;
                    auctionContract = nftMetadata[6] || "";
                  } else if (typeof nftMetadata === 'object') {
                    // 如果是对象格式
                    name = nftMetadata.name || `NFT #${tokenId}`;
                    description = nftMetadata.description || "无描述";
                    imageHash = nftMetadata.imageHash || "";
                    isAuctioned = nftMetadata.isAuctioned || false;
                    auctionContract = nftMetadata.auctionContract || "";
                  }

                  // 进一步验证NFT是否真的在拍卖中
                  // 即使合约中标记为isAuctioned，也要检查拍卖是否已结束
                  if (isAuctioned && auctionContract && auctionContract !== "0x0000000000000000000000000000000000000000") {
                    try {
                      // 检查拍卖合约是否还存在且有效
                      const contractCode = await publicClient.getBytecode({ address: auctionContract as `0x${string}` });
                      if (contractCode && contractCode !== '0x') {
                        // 检查拍卖是否已结束
                        const auctionEnded = await publicClient.readContract({
                          address: auctionContract as `0x${string}`,
                          abi: blindAuctionData.abi,
                          functionName: 'ended',
                        }) as boolean;

                        // 如果拍卖已结束，则NFT应该不再是拍卖状态
                        if (auctionEnded) {
                          isAuctioned = false;
                          auctionContract = "";
                          console.log(`NFT ${tokenId} 的拍卖已结束，状态应为可出售`);
                        }
                      } else {
                        // 拍卖合约不存在，NFT应该是可出售状态
                        isAuctioned = false;
                        auctionContract = "";
                        console.log(`NFT ${tokenId} 的拍卖合约不存在，状态应为可出售`);
                      }
                    } catch (error) {
                      console.log(`检查NFT ${tokenId} 拍卖状态失败，默认为可出售:`, error);
                      isAuctioned = false;
                      auctionContract = "";
                    }
                  }

                  console.log(`NFT ${tokenId} 解析后数据:`, { name, description, imageHash, isAuctioned });

                  // 构建图片URL
                  let imageUrl = "";
                  if (imageHash) {
                    if (imageHash.startsWith('ipfs://')) {
                      const hash = imageHash.replace('ipfs://', '');
                      imageUrl = `https://ipfs.io/ipfs/${hash}`;
                    } else if (imageHash.startsWith('http')) {
                      imageUrl = imageHash;
                    } else if (imageHash.trim()) {
                      imageUrl = `https://ipfs.io/ipfs/${imageHash}`;
                    }
                  }

                  console.log(`NFT ${tokenId} 最终图片URL:`, imageUrl);

                  const nftData = {
                    tokenId: Number(tokenId),
                    name: name || `NFT #${tokenId}`,
                    description: description || "无描述",
                    image: imageUrl,
                    creator: nftMetadata.creator || nftMetadata[4] || "",
                    owner: owner as string,
                    isAuctioned: isAuctioned,
                    auctionContract: auctionContract,
                  };

                  console.log(`NFT ${tokenId} 完整数据:`, nftData);
                  return nftData;
                } catch (error) {
                  console.error(`获取NFT ${tokenId} 详情失败:`, error);
                  return null;
                }
              })
            );

            const validNFTs = nftDetails.filter(Boolean) as NFTData[];
            console.log("最终有效的NFT数据:", validNFTs);
            console.log("有效NFT数量:", validNFTs.length);

            setMyNFTs(validNFTs);

            // 将NFT数据缓存到localStorage以保持状态
            if (validNFTs.length > 0) {
              const cacheKey = `user_nfts_${address.toLowerCase()}`;
              localStorage.setItem(cacheKey, JSON.stringify({
                data: validNFTs,
                timestamp: Date.now()
              }));
              console.log("NFT数据已缓存到localStorage");
            } else {
              // 如果没有NFT，也显示调试信息
              console.log("用户确实没有任何NFT，检查以下可能的原因：");
              console.log("1. 用户尚未铸造任何NFT");
              console.log("2. NFT合约地址可能不正确");
              console.log("3. 当前网络上没有部署NFT合约");
              console.log("4. getUserNFTs函数可能有问题");
            }

          } catch (error) {
            console.error("获取用户NFT失败:", error);

            // 如果链上获取失败，尝试从缓存中恢复
            try {
              const cacheKey = `user_nfts_${address.toLowerCase()}`;
              const cached = localStorage.getItem(cacheKey);
              if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                // 如果缓存不超过5分钟，使用缓存数据
                if (Date.now() - timestamp < 5 * 60 * 1000) {
                  setMyNFTs(data);
                  console.log("从缓存恢复NFT数据:", data);
                  notification.info("从缓存加载NFT数据");
                }
              }
            } catch (cacheError) {
              console.error("恢复NFT缓存失败:", cacheError);
            }
          }
        } else {
          console.log("NFT合约数据不可用");
        }

      } catch (error) {
        console.error("加载用户拍卖列表失败:", error);
        notification.error("加载拍卖列表失败，请刷新页面重试");
      } finally {
        setLoading(false);
      }
    };

    loadUserAuctions();
  }, [address, factoryContractData, blindAuctionData, nftContractData, publicClient]);

  // 格式化时间显示
  const formatTimeLeft = (auction: any) => {
    const now = Math.floor(Date.now() / 1000);
    if (auction.state === "pending") {
      const timeLeft = Number(auction.biddingStart) - now;
      if (timeLeft <= 0) return "竞拍即将开始";
      return new Date(Number(auction.biddingStart) * 1000).toLocaleString();
    } else if (auction.state === "bidding") {
      const timeLeft = Number(auction.biddingEnd) - now;
      if (timeLeft <= 0) return "竞拍已结束";
      return new Date(Number(auction.biddingEnd) * 1000).toLocaleString();
    } else if (auction.state === "revealing") {
      const timeLeft = Number(auction.revealEnd) - now;
      if (timeLeft <= 0) return "揭示已结束";
      return new Date(Number(auction.revealEnd) * 1000).toLocaleString();
    } else {
      return "拍卖已结束";
    }
  };

  // 获取状态样式类
  const getStatusClass = (state: string) => {
    switch (state) {
      case "pending":
        return "bg-blue-600/30 border border-blue-500/50 text-blue-300";
      case "bidding":
        return "bg-green-600/30 border border-green-500/50 text-green-300";
      case "revealing":
        return "bg-yellow-600/30 border border-yellow-500/50 text-yellow-300";
      case "ended":
        return "bg-red-600/30 border border-red-500/50 text-red-300";
      default:
        return "bg-slate-600/30 border border-slate-500/50 text-slate-300";
    }
  };

  // 获取状态文本
  const getStatusText = (state: string) => {
    switch (state) {
      case "pending":
        return "未开始";
      case "bidding":
        return "竞拍中";
      case "revealing":
        return "揭示中";
      case "ended":
        return "已结束";
      default:
        return "未知";
    }
  };

  // 复制地址到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        notification.success("地址已复制到剪贴板");
      },
      (err) => {
        console.error("无法复制地址: ", err);
        notification.error("复制地址失败");
      }
    );
  };

  // 查看结果或提取资金
  const handleWithdraw = (auctionAddress: string) => {
    router.push(`/results?address=${auctionAddress}`);
  };

  // 处理出售NFT
  const handleSellNFT = (nft: NFTData) => {
    // 直接跳转到创建拍卖页面，传递NFT的tokenId
    router.push(`/create-auction?nftId=${nft.tokenId}`);
  };

  // 设置加载状态
  const isLoading = loading;

  // 添加清除所有缓存的函数
  const handleClearAllCache = () => {
    try {
      // 清除所有用户相关的localStorage数据
      if (address) {
        const normalizedAddress = address.toLowerCase();

        // 清除竞拍相关缓存
        localStorage.removeItem(`bids_${normalizedAddress}`);
        localStorage.removeItem(`revealed_bids_${normalizedAddress}`);
        localStorage.removeItem(`withdraw_${normalizedAddress}`);

        // 清除NFT缓存
        localStorage.removeItem(`user_nfts_${normalizedAddress}`);

        console.log("已清除用户相关的所有localStorage数据");
      }

      // 清除全局缓存
      localStorage.removeItem('auction_analytics_cache');

      // 清除所有以特定前缀开头的缓存
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('bids_') ||
          key.startsWith('revealed_bids_') ||
          key.startsWith('withdraw_') ||
          key.startsWith('user_nfts_') ||
          key.includes('auction') ||
          key.includes('cache')
        )) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`已清除缓存: ${key}`);
      });

      notification.success("所有缓存已清除！页面将自动刷新");

      // 延迟刷新页面，让用户看到成功消息
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("清除缓存失败:", error);
      notification.error("清除缓存失败，请手动刷新页面");
    }
  };

  // 修改格式化时间的函数
  const formatEndTime = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(/\//g, '-');
  };

  // 修改显示拍卖状态的函数
  const getAuctionTimeDisplay = (auction: AuctionData) => {
    if (auction.state === "ended") {
      return formatEndTime(auction.revealEnd);
    } else if (auction.state === "revealing") {
      const timeLeft = Number(auction.revealEnd) - Math.floor(Date.now() / 1000);
      if (timeLeft > 0) {
        return formatTimeLeft(timeLeft);
      } else {
        return formatEndTime(auction.revealEnd);
      }
    } else if (auction.state === "bidding") {
      const timeLeft = Number(auction.biddingEnd) - Math.floor(Date.now() / 1000);
      if (timeLeft > 0) {
        return formatTimeLeft(timeLeft);
      } else {
        return formatEndTime(auction.biddingEnd);
      }
    } else {
      return formatEndTime(auction.biddingStart || BigInt(0));
    }
  };

  return (
    <>
      <MetaHeader
        title="我的资产 | 区块链盲拍平台"
        description="查看您参与和创建的所有盲拍拍卖"
      />
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#020033] via-[#030045] to-[#020033]">
        {/* 高级背景效果 */}
        <div className="absolute inset-0">
          {/* 主要光晕 */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full filter blur-[100px] animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full filter blur-[100px] animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full filter blur-[120px] animate-pulse delay-500"></div>

          {/* 次要光效 */}
          <div className="absolute top-20 right-20 w-32 h-32 bg-cyan-500/15 rounded-full filter blur-[60px] animate-pulse delay-700"></div>
          <div className="absolute bottom-20 left-20 w-40 h-40 bg-pink-500/15 rounded-full filter blur-[80px] animate-pulse delay-300"></div>
        </div>

        {/* 科技网格背景 */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

        {/* 动态光线效果 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent animate-pulse"></div>
          <div className="absolute bottom-0 right-0 w-1 h-full bg-gradient-to-t from-purple-500/30 via-transparent to-transparent animate-pulse delay-500"></div>
        </div>

        {/* 流星雨特效 */}
        <MeteorRain count={12} minDuration={8} maxDuration={16} />

        <div className="relative z-10 w-full px-4 py-8">
          <div className="max-w-7xl mx-auto">
            {/* 现代化页面标题 */}
            <div className="text-center mb-12">
              <div className="relative inline-block">
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight neon-text">
                  我的资产
                </h1>
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-purple-600/20 blur-lg -z-10"></div>
              </div>
              <div className="mt-6 flex justify-center">
                <div className="h-1 w-32 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-full relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full blur-sm"></div>
                </div>
              </div>
              <p className="mt-6 text-slate-300/80 text-lg max-w-2xl mx-auto leading-relaxed">
                管理您的拍卖作品集，追踪竞拍进展，探索区块链盲拍的无限可能
              </p>
            </div>

            {!address ? (
              <div className="relative max-w-2xl mx-auto">
                <div className="bg-slate-900/40 backdrop-blur-xl rounded-3xl p-12 border border-slate-700/30 shadow-2xl relative overflow-hidden">
                  {/* 背景光效 */}
                  <div className="absolute inset-0">
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/5 via-purple-600/5 to-cyan-600/5 rounded-3xl"></div>
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full filter blur-3xl"></div>
                    <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/10 rounded-full filter blur-3xl"></div>
                  </div>

                  {/* 顶部装饰线 */}
                  <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>

                  <div className="relative z-10 text-center">
                    {/* 图标 */}
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl mb-8 relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl"></div>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>

                    <h3 className="text-3xl font-bold text-white mb-4">连接您的钱包</h3>
                    <p className="text-slate-300/70 text-lg mb-8 leading-relaxed">
                      连接您的以太坊钱包以访问个人拍卖仪表板，<br />
                      查看您的创作和竞拍历史
                    </p>

                    {/* 特性列表 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
                      <div className="flex items-center space-x-3 p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                        <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm">创建拍卖记录</span>
                      </div>
                      <div className="flex items-center space-x-3 p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                        <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm">竞拍活动追踪</span>
                      </div>
                      <div className="flex items-center space-x-3 p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                        <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm">收益统计分析</span>
                      </div>
                      <div className="flex items-center space-x-3 p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                        <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm">实时状态监控</span>
                      </div>
                    </div>

                    <ConnectButton.Custom>
                      {({ account, chain, openConnectModal, mounted }) => {
                        const connected = mounted && account && chain;

                        return (
                          <button
                            onClick={openConnectModal}
                            className="relative inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-2xl shadow-lg hover:shadow-blue-500/25 transition-all duration-300 transform hover:scale-105 group overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/20 to-purple-400/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="relative z-10">连接钱包开始</span>
                          </button>
                        );
                      }}
                    </ConnectButton.Custom>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* 高级统计仪表板 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  {/* 我创建的拍卖 */}
                  <div className="relative group">
                    <div className="bg-slate-900/40 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/30 shadow-xl hover:shadow-purple-500/10 transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-pink-600/5 rounded-2xl"></div>
                      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>

                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold text-white">{createdAuctions.length}</div>
                            <div className="text-xs text-slate-400 mt-1">创建的拍卖</div>
                          </div>
                        </div>
                        <div className="h-1 w-full bg-gradient-to-r from-purple-500/30 to-pink-500/10 rounded-full">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full w-4/5"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 参与的拍卖 */}
                  <div className="relative group">
                    <div className="bg-slate-900/40 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/30 shadow-xl hover:shadow-emerald-500/10 transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 to-cyan-600/5 rounded-2xl"></div>
                      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>

                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold text-white">{participatedAuctions.length}</div>
                            <div className="text-xs text-slate-400 mt-1">参与的拍卖</div>
                          </div>
                        </div>
                        <div className="h-1 w-full bg-gradient-to-r from-emerald-500/30 to-cyan-500/10 rounded-full">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full w-2/3"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 我的NFT */}
                  <div className="relative group">
                    <div className="bg-slate-900/40 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/30 shadow-xl hover:shadow-amber-500/10 transition-all duration-500 transform hover:-translate-y-2 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-amber-600/5 to-orange-600/5 rounded-2xl"></div>
                      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"></div>

                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold text-white">{myNFTs.length}</div>
                            <div className="text-xs text-slate-400 mt-1">我的NFT</div>
                          </div>
                        </div>
                        <div className="h-1 w-full bg-gradient-to-r from-amber-500/30 to-orange-500/10 rounded-full">
                          <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full w-1/2"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 标签页切换 */}
                <div className="flex justify-center mb-8">
                  <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-2 border border-slate-700/50">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setActiveTab("created")}
                        className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${activeTab === "created"
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                          }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        我创建的拍卖
                      </button>
                      <button
                        onClick={() => setActiveTab("participated")}
                        className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${activeTab === "participated"
                          ? "bg-gradient-to-r from-purple-600 to-cyan-600 text-white shadow-lg shadow-purple-500/25"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                          }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        我参与的拍卖
                      </button>
                      <button
                        onClick={() => setActiveTab("nfts")}
                        className={`px-6 py-3 rounded-xl font-medium transition-all duration-300 ${activeTab === "nfts"
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                          }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        我的NFT
                      </button>
                    </div>
                  </div>
                </div>

                {/* 标签页内容 */}
                {activeTab === "created" && (
                  <div className="bg-slate-900/70 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700/60 shadow-xl relative">
                    {/* 装饰光效 */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
                    <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-blue-500/30 via-transparent to-transparent"></div>

                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 flex justify-between items-center">
                      <h2 className="text-xl font-semibold text-white flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        我创建的拍卖
                      </h2>

                      <Link href="/create-auction" className="btn btn-sm bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/30 text-white">
                        创建新拍卖
                      </Link>
                    </div>

                    <div className="p-6">
                      {createdAuctions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {createdAuctions
                            .sort((a, b) => {
                              // 首先按状态排序：bidding > pending > revealing > ended
                              const stateOrder = { 'bidding': 1, 'pending': 2, 'revealing': 3, 'ended': 4 };
                              const stateComparison = stateOrder[a.state] - stateOrder[b.state];

                              if (stateComparison !== 0) {
                                return stateComparison;
                              }

                              // 同状态内按结束时间排序（最新的在前）
                              return Number(b.biddingEnd) - Number(a.biddingEnd);
                            })
                            .map((auction, index) => (
                              <div key={index} className="bg-slate-800/50 rounded-xl border border-slate-700/60 shadow-md hover:shadow-blue-500/10 transition-all overflow-hidden hover:-translate-y-1 hover:border-blue-500/50 group relative">
                                {/* 卡片内光效 */}
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
                                  <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-blue-500/30 via-transparent to-transparent"></div>
                                </div>

                                <div className="relative h-40 bg-slate-700/50 overflow-hidden">
                                  {auction.metadata.image ? (
                                    <OptimizedImage
                                      src={auction.metadata.image}
                                      alt={auction.metadata.name}
                                      className="w-full h-full transform group-hover:scale-105 transition-transform duration-500"
                                      quality={85}
                                      objectFit="cover"
                                      rounded="rounded-none"
                                      onLoad={() => {
                                        console.log(`创建的拍卖 ${auction.address} 图片加载成功`);
                                      }}
                                      onError={(error) => {
                                        console.error(`创建的拍卖 ${auction.address} 图片加载失败:`, error);
                                      }}
                                    />
                                  ) : (
                                    <div className="flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                    </div>
                                  )}
                                  <div className={`absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-semibold ${getStatusClass(auction.state)}`}>
                                    {getStatusText(auction.state)}
                                  </div>
                                </div>
                                <div className="p-4">
                                  <h3 className="text-lg font-semibold text-white mb-2 truncate group-hover:text-blue-400 transition-colors">
                                    {auction.metadata.name || "未命名拍卖"}
                                  </h3>
                                  <p className="text-slate-400 text-sm mb-3 line-clamp-2 h-10">
                                    {auction.metadata.description || "无描述"}
                                  </p>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-300">起拍价:</span>
                                    <span className="text-green-400 font-medium">
                                      {typeof auction.metadata.minPrice === 'string' && auction.metadata.minPrice.includes('.')
                                        ? `${auction.metadata.minPrice} ETH`
                                        : `${formatEther(BigInt(auction.metadata.minPrice))} ETH`}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400">结束时间:</span>
                                    <span className={`${auction.state === "ended" ? "text-slate-400" : "text-blue-400"}`}>
                                      {getAuctionTimeDisplay(auction)}
                                    </span>
                                  </div>
                                  <div className="mt-4 pt-3 border-t border-slate-700/50 flex justify-between items-center">
                                    <Link
                                      href={`/auction/${auction.address}`}
                                      className="text-blue-400 hover:text-blue-300 text-sm flex items-center group-hover:translate-x-1 transition-transform"
                                    >
                                      查看详情
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </Link>
                                    <div className="flex gap-2">
                                      {auction.state === "revealing" && (
                                        <button
                                          className="btn btn-xs bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border-0 text-xs text-white shadow-md"
                                          onClick={() => handleWithdraw(auction.address)}
                                        >
                                          查看结果
                                        </button>
                                      )}
                                      <button
                                        className="btn btn-xs bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 border-0 text-xs text-white shadow-md"
                                        onClick={() => copyToClipboard(auction.address)}
                                      >
                                        复制地址
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : isLoading ? (
                        <div className="flex flex-col justify-center items-center py-16">
                          <div className="w-16 h-16 relative">
                            <div className="w-16 h-16 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-6 h-6 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin"></div>
                            </div>
                          </div>
                          <p className="mt-4 text-slate-300 animate-pulse">加载中...</p>
                        </div>
                      ) : (
                        <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50 relative overflow-hidden">
                          {/* 装饰背景 */}
                          <div className="absolute inset-0 opacity-10">
                            <div className="absolute top-0 -left-20 w-40 h-40 bg-blue-600 rounded-full filter blur-[50px]"></div>
                            <div className="absolute bottom-0 -right-20 w-40 h-40 bg-purple-600 rounded-full filter blur-[50px]"></div>
                          </div>

                          <div className="relative z-10">
                            <div className="inline-block p-4 bg-blue-500/10 rounded-full mb-4">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-white">您还没有创建任何拍卖</h3>
                            <p className="text-slate-400 mb-8 max-w-md mx-auto">
                              创建您的第一个盲拍拍卖，所有出价信息将被加密存储在区块链上。
                            </p>
                            <Link
                              href="/create-auction"
                              className="btn btn-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 border-0 text-white shadow-lg hover:shadow-blue-500/20 transition-all duration-300 relative overflow-hidden group"
                            >
                              <span className="relative z-10">创建拍卖</span>
                              <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-blue-400/30 to-purple-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "participated" && (
                  <div className="bg-slate-900/70 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700/60 shadow-xl relative">
                    {/* 装饰光效 */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                    <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-purple-500/30 via-transparent to-transparent"></div>

                    <div className="bg-gradient-to-r from-purple-600 to-cyan-600 p-4 flex justify-between items-center">
                      <h2 className="text-xl font-semibold text-white flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        我参与的拍卖
                      </h2>

                      <Link href="/all-auctions" className="btn btn-sm bg-purple-500/30 hover:bg-purple-500/50 border border-purple-400/30 text-white">
                        浏览更多拍卖
                      </Link>
                    </div>

                    <div className="p-6">
                      {participatedAuctions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {participatedAuctions.map((auction, index) => (
                            <div key={index} className="bg-slate-800/50 rounded-xl border border-slate-700/60 shadow-md hover:shadow-purple-500/10 transition-all overflow-hidden hover:-translate-y-1 hover:border-purple-500/50 group relative">
                              {/* 卡片内光效 */}
                              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                                <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-purple-500/30 via-transparent to-transparent"></div>
                              </div>

                              <div className="relative h-40 bg-slate-700/50 overflow-hidden">
                                {auction.metadata.image ? (
                                  <OptimizedImage
                                    src={auction.metadata.image}
                                    alt={auction.metadata.name}
                                    className="w-full h-full transform group-hover:scale-105 transition-transform duration-500"
                                    quality={85}
                                    objectFit="cover"
                                    rounded="rounded-none"
                                    onLoad={() => {
                                      console.log(`参与的拍卖 ${auction.address} 图片加载成功`);
                                    }}
                                    onError={(error) => {
                                      console.error(`参与的拍卖 ${auction.address} 图片加载失败:`, error);
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                )}
                                <div className={`absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-semibold ${getStatusClass(auction.state)}`}>
                                  {getStatusText(auction.state)}
                                </div>
                              </div>
                              <div className="p-4">
                                <h3 className="text-lg font-semibold text-white mb-2 truncate group-hover:text-purple-400 transition-colors">
                                  {auction.metadata.name || "未命名拍卖"}
                                </h3>
                                <p className="text-slate-400 text-sm mb-3 line-clamp-2 h-10">
                                  {auction.metadata.description || "无描述"}
                                </p>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-slate-300">起拍价:</span>
                                  <span className="text-green-400 font-medium">
                                    {typeof auction.metadata.minPrice === 'string' && auction.metadata.minPrice.includes('.')
                                      ? `${auction.metadata.minPrice} ETH`
                                      : `${formatEther(BigInt(auction.metadata.minPrice))} ETH`}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-400">结束时间:</span>
                                  <span className={`${auction.state === "ended" ? "text-slate-400" : "text-blue-400"}`}>
                                    {getAuctionTimeDisplay(auction)}
                                  </span>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-700/50 flex justify-between items-center">
                                  <Link
                                    href={`/auction/${auction.address}`}
                                    className="text-purple-400 hover:text-purple-300 text-sm flex items-center group-hover:translate-x-1 transition-transform"
                                  >
                                    查看详情
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </Link>
                                  <div className="flex gap-2">
                                    {auction.state === "bidding" && (
                                      <Link
                                        href={`/bid?address=${auction.address}`}
                                        className="btn btn-xs bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 border-0 text-xs text-white shadow-md"
                                      >
                                        出价
                                      </Link>
                                    )}
                                    {auction.state === "revealing" && (
                                      <Link
                                        href={`/reveal?address=${auction.address}`}
                                        className="btn btn-xs bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border-0 text-xs text-white shadow-md"
                                      >
                                        揭示
                                      </Link>
                                    )}
                                    {auction.state === "ended" && (
                                      <Link
                                        href={`/results?address=${auction.address}`}
                                        className="btn btn-xs bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 border-0 text-xs text-white shadow-md"
                                      >
                                        结果
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : isLoading ? (
                        <div className="flex flex-col justify-center items-center py-16">
                          <div className="w-16 h-16 relative">
                            <div className="w-16 h-16 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full border-2 border-pink-500/20 border-t-pink-500 animate-spin"></div>
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-6 h-6 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin"></div>
                            </div>
                          </div>
                          <p className="mt-4 text-slate-300 animate-pulse">加载中...</p>
                        </div>
                      ) : (
                        <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50 relative overflow-hidden">
                          {/* 装饰背景 */}
                          <div className="absolute inset-0 opacity-10">
                            <div className="absolute top-0 -left-20 w-40 h-40 bg-purple-600 rounded-full filter blur-[50px]"></div>
                            <div className="absolute bottom-0 -right-20 w-40 h-40 bg-cyan-600 rounded-full filter blur-[50px]"></div>
                          </div>

                          <div className="relative z-10">
                            <div className="inline-block p-4 bg-purple-500/10 rounded-full mb-4">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                              </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-white">您还没有参与任何拍卖</h3>
                            <p className="text-slate-400 mb-8 max-w-md mx-auto">
                              浏览可用的拍卖并参与竞拍。您的出价将被加密，只有在揭示阶段才会公开。
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center gap-4">
                              <Link
                                href="/all-auctions"
                                className="btn btn-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border-0 text-white shadow-lg hover:shadow-purple-500/20 transition-all duration-300 relative overflow-hidden group"
                              >
                                <span className="relative z-10">浏览所有拍卖</span>
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-400/0 via-purple-400/30 to-cyan-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                              </Link>
                              <Link
                                href="/my-bids"
                                className="btn btn-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border-0 text-white shadow-lg hover:shadow-cyan-500/20 transition-all duration-300 relative overflow-hidden group"
                              >
                                <span className="relative z-10">查看我的竞拍记录</span>
                                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/30 to-blue-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "nfts" && (
                  <div className="bg-slate-900/70 backdrop-blur-md rounded-xl overflow-hidden border border-slate-700/60 shadow-xl relative">
                    {/* 装饰光效 */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                    <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-purple-500/30 via-transparent to-transparent"></div>

                    <div className="bg-gradient-to-r from-purple-600 to-cyan-600 p-4 flex justify-between items-center">
                      <h2 className="text-xl font-semibold text-white flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        我的NFT
                      </h2>

                      <div className="flex gap-3">
                        <Link href="/mint-nft" className="btn btn-sm bg-purple-500/30 hover:bg-purple-500/50 border border-purple-400/30 text-white">
                          铸造新NFT
                        </Link>
                      </div>
                    </div>

                    <div className="p-6">
                      {myNFTs.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {myNFTs.map((nft, index) => (
                            <div key={index} className="bg-slate-800/50 rounded-xl border border-slate-700/60 shadow-md hover:shadow-purple-500/10 transition-all overflow-hidden hover:-translate-y-1 hover:border-purple-500/50 group relative">
                              {/* 卡片内光效 */}
                              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                                <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-purple-500/30 via-transparent to-transparent"></div>
                              </div>

                              <div className="relative h-40 bg-slate-700/50 overflow-hidden">
                                {nft.image ? (
                                  <OptimizedImage
                                    src={nft.image}
                                    alt={nft.name}
                                    className="w-full h-full transform group-hover:scale-105 transition-transform duration-500"
                                    quality={85}
                                    objectFit="cover"
                                    rounded="rounded-none"
                                    onLoad={() => {
                                      console.log(`NFT ${nft.tokenId} 图片加载成功`);
                                    }}
                                    onError={(error) => {
                                      console.error(`NFT ${nft.tokenId} 图片加载失败:`, error);
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900 flex-col">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-xs">暂无图片</span>
                                  </div>
                                )}

                                {/* Token ID 标签 */}
                                <div className="absolute top-2 right-2 bg-purple-600/80 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-semibold text-white">
                                  #{nft.tokenId}
                                </div>
                              </div>
                              <div className="p-4">
                                <h3 className="text-lg font-semibold text-white mb-2 truncate group-hover:text-purple-400 transition-colors">
                                  {nft.name || "未命名NFT"}
                                </h3>
                                <p className="text-slate-400 text-sm mb-3 line-clamp-2 h-10">
                                  {nft.description || "无描述"}
                                </p>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-slate-300">Token ID:</span>
                                  <span className="text-purple-400 font-medium">#{nft.tokenId}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm mt-1">
                                  <span className="text-slate-300">状态:</span>
                                  <span className="text-green-400 font-medium">
                                    {nft.isAuctioned ? "拍卖中" : "可出售"}
                                  </span>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-700/50 flex justify-between items-center">
                                  <Link
                                    href={`/nft/${nft.tokenId}`}
                                    className="text-purple-400 hover:text-purple-300 text-sm flex items-center group-hover:translate-x-1 transition-transform"
                                  >
                                    查看详情
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </Link>
                                  <div className="flex gap-2">
                                    {nft.isAuctioned ? (
                                      <Link
                                        href={`/auction/${nft.auctionContract}`}
                                        className="btn btn-xs bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 border-0 text-xs text-white shadow-md"
                                      >
                                        查看拍卖
                                      </Link>
                                    ) : (
                                      <button
                                        onClick={() => handleSellNFT(nft)}
                                        className="btn btn-xs bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border-0 text-xs text-white shadow-md"
                                      >
                                        出售
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : isLoading ? (
                        <div className="flex flex-col justify-center items-center py-16">
                          <div className="w-16 h-16 relative">
                            <div className="w-16 h-16 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full border-2 border-pink-500/20 border-t-pink-500 animate-spin"></div>
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-6 h-6 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin"></div>
                            </div>
                          </div>
                          <p className="mt-4 text-slate-300 animate-pulse">加载中...</p>
                        </div>
                      ) : (
                        <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50 relative overflow-hidden">
                          {/* 装饰背景 */}
                          <div className="absolute inset-0 opacity-10">
                            <div className="absolute top-0 -left-20 w-40 h-40 bg-purple-600 rounded-full filter blur-[50px]"></div>
                            <div className="absolute bottom-0 -right-20 w-40 h-40 bg-cyan-600 rounded-full filter blur-[50px]"></div>
                          </div>

                          <div className="relative z-10">
                            <div className="inline-block p-4 bg-purple-500/10 rounded-full mb-4">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                              </svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-white">您还没有任何NFT</h3>
                            <p className="text-slate-400 mb-8 max-w-md mx-auto">
                              浏览可用的NFT并参与竞拍。您的出价将被加密，只有在揭示阶段才会公开。
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center gap-4">
                              <Link
                                href="/all-nfts"
                                className="btn btn-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border-0 text-white shadow-lg hover:shadow-purple-500/20 transition-all duration-300 relative overflow-hidden group"
                              >
                                <span className="relative z-10">浏览所有NFT</span>
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-400/0 via-purple-400/30 to-cyan-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                              </Link>
                              <Link
                                href="/create-nft"
                                className="btn btn-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border-0 text-white shadow-lg hover:shadow-cyan-500/20 transition-all duration-300 relative overflow-hidden group"
                              >
                                <span className="relative z-10">创建NFT</span>
                                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/30 to-blue-400/0 opacity-0 group-hover:opacity-100 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-1000"></div>
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 导航链接 */}
            <div className="mt-8 flex justify-center space-x-6">
              <Link href="/" className="text-slate-400 hover:text-blue-400 transition-colors flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                返回首页
              </Link>
              <Link href="/all-auctions" className="text-slate-400 hover:text-purple-400 transition-colors flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                所有拍卖
              </Link>
              <Link href="/create-auction" className="text-slate-400 hover:text-cyan-400 transition-colors flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                创建拍卖
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* CSS 动画定义 */}
      <style jsx global>{`
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 10px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.3); }
          50% { text-shadow: 0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.5); }
        }
        .glow-text {
          animation: glow 2s ease-in-out infinite;
        }
        .neon-text {
          text-shadow: 0 0 10px rgba(59, 130, 246, 0.7), 0 0 20px rgba(59, 130, 246, 0.5);
        }
      `}</style>
    </>
  );
};

export default MyAssets; 
/**
 * 拍卖缓存服务
 * 用于缓存已结束的拍卖数据，减少API请求
 */

// 拍卖类型定义
type AuctionState = "pending" | "bidding" | "revealing" | "ended";
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
  ended?: boolean;
  state: AuctionState;
  cachedAt?: number;
};

// 缓存键定义
const GLOBAL_ENDED_AUCTIONS_KEY = 'global_ended_auctions';
const USER_CREATED_AUCTIONS_PREFIX = 'user_created_ended_auctions_';
const USER_PARTICIPATED_AUCTIONS_PREFIX = 'user_participated_ended_auctions_';

// 缓存有效期 (7天)
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// 最大缓存项数量
const MAX_CACHE_ITEMS = 200;

/**
 * 检查是否在浏览器环境中
 */
const isBrowser = () => typeof window !== 'undefined';

/**
 * 安全地使用localStorage获取数据
 */
const safeGetItem = (key: string): string | null => {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error("无法从localStorage获取数据:", error);
    return null;
  }
};

/**
 * 安全地使用localStorage存储数据
 */
const safeSetItem = (key: string, value: string): boolean => {
  if (!isBrowser()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error("无法保存数据到localStorage:", error);
    return false;
  }
};

/**
 * 自定义JSON序列化函数，处理BigInt类型
 */
const jsonStringify = (data: any): string => {
  return JSON.stringify(data, (_, value) => {
    // 检查是否是BigInt类型
    if (typeof value === 'bigint') {
      return { type: 'bigint', value: value.toString() };
    }
    return value;
  });
};

/**
 * 自定义JSON反序列化函数，恢复BigInt类型
 */
const jsonParse = (text: string): any => {
  return JSON.parse(text, (_, value) => {
    // 检查是否是之前序列化的BigInt对象
    if (value && typeof value === 'object' && value.type === 'bigint') {
      return BigInt(value.value);
    }
    return value;
  });
};

/**
 * 缓存已结束的全局拍卖
 */
export const cacheEndedAuction = (auction: AuctionData) => {
  console.log("尝试缓存拍卖:", auction.address, "状态:", auction.state);

  if (!isBrowser()) {
    console.log("服务器端环境，不执行缓存");
    return;
  }

  if (auction.state !== "ended") {
    console.log("拍卖未结束，不缓存:", auction.address);
    return;
  }

  try {
    // 准备存储的数据
    const storageData = {
      ...auction,
      cachedAt: Date.now()
    };

    // 获取现有缓存
    const cachedAuctionsStr = safeGetItem(GLOBAL_ENDED_AUCTIONS_KEY);
    const cachedAuctions = cachedAuctionsStr ? jsonParse(cachedAuctionsStr) : {};
    console.log("当前已缓存的拍卖数:", Object.keys(cachedAuctions).length);

    // 更新缓存
    cachedAuctions[auction.address] = storageData;

    // 存回localStorage，使用自定义序列化处理BigInt
    const saveSuccess = safeSetItem(GLOBAL_ENDED_AUCTIONS_KEY, jsonStringify(cachedAuctions));
    if (saveSuccess) {
      console.log("缓存成功, 现在缓存了", Object.keys(cachedAuctions).length, "个拍卖");
    } else {
      console.warn("缓存拍卖失败");
    }

    // 清理过期缓存
    cleanupCache();
  } catch (error) {
    console.error("缓存拍卖失败:", error);
  }
};

/**
 * 获取缓存的全局已结束拍卖
 */
export const getCachedEndedAuctions = (): Record<string, AuctionData> => {
  if (!isBrowser()) {
    console.log("服务器端环境，不读取缓存");
    return {};
  }

  try {
    const cachedAuctionsStr = safeGetItem(GLOBAL_ENDED_AUCTIONS_KEY);
    if (!cachedAuctionsStr) {
      console.log("未找到缓存的拍卖数据");
      return {};
    }

    const cache = jsonParse(cachedAuctionsStr);
    console.log("读取缓存, 找到", Object.keys(cache).length, "个已缓存的拍卖");

    // 检查缓存项是否有效
    let validCount = 0;
    Object.values(cache).forEach((auction: any) => {
      if (auction && auction.state === "ended") {
        validCount++;
      }
    });
    console.log("其中有效的已结束拍卖:", validCount, "个");

    return cache;
  } catch (error) {
    console.error("获取缓存拍卖失败:", error);
    return {};
  }
};

/**
 * 缓存用户创建的已结束拍卖
 */
export const cacheUserCreatedAuction = (userAddress: string, auction: AuctionData) => {
  if (!isBrowser()) {
    console.log("服务器端环境，不执行缓存");
    return;
  }

  if (auction.state !== "ended") {
    console.log("拍卖未结束，不缓存用户创建的拍卖:", auction.address);
    return;
  }

  try {
    const key = `${USER_CREATED_AUCTIONS_PREFIX}${userAddress}`;

    // 准备存储的数据
    const storageData = {
      ...auction,
      cachedAt: Date.now()
    };

    // 获取现有缓存
    const cachedAuctionsStr = safeGetItem(key);
    const cachedAuctions = cachedAuctionsStr ? jsonParse(cachedAuctionsStr) : {};
    console.log("用户创建的已缓存拍卖数:", Object.keys(cachedAuctions).length);

    // 更新缓存
    cachedAuctions[auction.address] = storageData;

    // 存回localStorage，使用自定义序列化处理BigInt
    const saveSuccess = safeSetItem(key, jsonStringify(cachedAuctions));
    if (saveSuccess) {
      console.log("用户创建的拍卖缓存成功:", auction.address);
    }
  } catch (error) {
    console.error("缓存用户创建的拍卖失败:", error);
  }
};

/**
 * 获取缓存的用户创建的已结束拍卖
 */
export const getCachedUserCreatedAuctions = (userAddress: string): Record<string, AuctionData> => {
  if (!isBrowser() || !userAddress) {
    return {};
  }

  try {
    const key = `${USER_CREATED_AUCTIONS_PREFIX}${userAddress}`;
    const cachedAuctionsStr = safeGetItem(key);
    if (!cachedAuctionsStr) {
      console.log("未找到用户创建的缓存拍卖");
      return {};
    }

    const cache = jsonParse(cachedAuctionsStr);
    console.log("读取用户创建的缓存拍卖, 找到", Object.keys(cache).length, "个");
    return cache;
  } catch (error) {
    console.error("获取缓存的用户创建的拍卖失败:", error);
    return {};
  }
};

/**
 * 缓存用户参与的已结束拍卖
 */
export const cacheUserParticipatedAuction = (userAddress: string, auction: AuctionData) => {
  if (!isBrowser()) {
    console.log("服务器端环境，不执行缓存");
    return;
  }

  if (auction.state !== "ended") {
    console.log("拍卖未结束，不缓存用户参与的拍卖:", auction.address);
    return;
  }

  try {
    const key = `${USER_PARTICIPATED_AUCTIONS_PREFIX}${userAddress}`;

    // 准备存储的数据
    const storageData = {
      ...auction,
      cachedAt: Date.now()
    };

    // 获取现有缓存
    const cachedAuctionsStr = safeGetItem(key);
    const cachedAuctions = cachedAuctionsStr ? jsonParse(cachedAuctionsStr) : {};

    // 更新缓存
    cachedAuctions[auction.address] = storageData;

    // 存回localStorage，使用自定义序列化处理BigInt
    const saveSuccess = safeSetItem(key, jsonStringify(cachedAuctions));
    if (saveSuccess) {
      console.log("用户参与的拍卖缓存成功:", auction.address);
    }
  } catch (error) {
    console.error("缓存用户参与的拍卖失败:", error);
  }
};

/**
 * 获取缓存的用户参与的已结束拍卖
 */
export const getCachedUserParticipatedAuctions = (userAddress: string): Record<string, AuctionData> => {
  if (!isBrowser() || !userAddress) {
    return {};
  }

  try {
    const key = `${USER_PARTICIPATED_AUCTIONS_PREFIX}${userAddress}`;
    const cachedAuctionsStr = safeGetItem(key);
    if (!cachedAuctionsStr) {
      console.log("未找到用户参与的缓存拍卖");
      return {};
    }

    const cache = jsonParse(cachedAuctionsStr);
    console.log("读取用户参与的缓存拍卖, 找到", Object.keys(cache).length, "个");
    return cache;
  } catch (error) {
    console.error("获取缓存的用户参与的拍卖失败:", error);
    return {};
  }
};

/**
 * 检查是否需要更新缓存
 * 如果缓存时间超过一定时间，则需要更新
 */
export const shouldRefreshCache = (cachedTime: number): boolean => {
  if (!cachedTime) return true;
  const age = Date.now() - cachedTime;
  const shouldRefresh = age > CACHE_EXPIRY_MS;
  if (shouldRefresh) {
    console.log("缓存已过期, 年龄:", Math.floor(age / (1000 * 60 * 60 * 24)), "天");
  }
  return shouldRefresh;
};

/**
 * 清理过期和过多的缓存
 */
const cleanupCache = () => {
  if (!isBrowser()) return;

  try {
    // 清理全局缓存
    cleanupSpecificCache(GLOBAL_ENDED_AUCTIONS_KEY);

    // 查找并清理所有用户相关的缓存
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith(USER_CREATED_AUCTIONS_PREFIX) ||
        key.startsWith(USER_PARTICIPATED_AUCTIONS_PREFIX)
      )) {
        cleanupSpecificCache(key);
      }
    }
  } catch (error) {
    console.error("清理缓存失败:", error);
  }
};

/**
 * 清理特定的缓存项
 */
const cleanupSpecificCache = (key: string) => {
  if (!isBrowser()) return;

  const cachedDataStr = safeGetItem(key);
  if (!cachedDataStr) return;

  try {
    const cachedData = jsonParse(cachedDataStr);
    const entries = Object.entries(cachedData);

    // 移除过期项
    const now = Date.now();
    let validEntries = entries.filter(([_, auction]) => {
      const auctionData = auction as AuctionData;
      return auctionData.cachedAt && (now - auctionData.cachedAt < CACHE_EXPIRY_MS);
    });

    // 如果项目数量超过限制，保留最新的N个
    if (validEntries.length > MAX_CACHE_ITEMS) {
      validEntries = validEntries
        .sort((a, b) => (b[1] as AuctionData).cachedAt! - (a[1] as AuctionData).cachedAt!)
        .slice(0, MAX_CACHE_ITEMS);
      console.log(`缓存项过多, 已限制为最新的 ${MAX_CACHE_ITEMS} 项`);
    }

    // 重建缓存对象
    const newCache: Record<string, AuctionData> = {};
    validEntries.forEach(([address, data]) => {
      newCache[address] = data as AuctionData;
    });

    // 保存回localStorage，使用自定义序列化处理BigInt
    safeSetItem(key, jsonStringify(newCache));
  } catch (error) {
    console.error("清理特定缓存失败:", error, "key:", key);
  }
};

/**
 * 从缓存中获取特定拍卖信息
 */
export const getCachedAuction = (address: string): AuctionData | null => {
  if (!isBrowser() || !address) {
    return null;
  }

  try {
    // 先检查全局缓存
    const globalCache = getCachedEndedAuctions();
    if (globalCache[address]) {
      console.log("从全局缓存中找到拍卖:", address);
      return globalCache[address];
    }

    // 再搜索所有用户缓存
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith(USER_CREATED_AUCTIONS_PREFIX) ||
        key.startsWith(USER_PARTICIPATED_AUCTIONS_PREFIX)
      )) {
        const cacheStr = safeGetItem(key);
        if (!cacheStr) continue;

        const cache = jsonParse(cacheStr);
        if (cache[address]) {
          console.log("从用户缓存中找到拍卖:", address, "缓存键:", key);
          return cache[address];
        }
      }
    }

    console.log("缓存中未找到拍卖:", address);
    return null;
  } catch (error) {
    console.error("获取缓存拍卖信息失败:", error);
    return null;
  }
};

/**
 * 手动清除所有拍卖缓存
 */
export const clearAllAuctionCache = () => {
  if (!isBrowser()) return;

  try {
    localStorage.removeItem(GLOBAL_ENDED_AUCTIONS_KEY);
    console.log("已清除全局拍卖缓存");

    // 清除所有用户缓存
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith(USER_CREATED_AUCTIONS_PREFIX) ||
        key.startsWith(USER_PARTICIPATED_AUCTIONS_PREFIX)
      )) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });

    console.log(`已清除 ${keysToRemove.length} 个用户相关的拍卖缓存`);
  } catch (error) {
    console.error("清除所有拍卖缓存失败:", error);
  }
}; 
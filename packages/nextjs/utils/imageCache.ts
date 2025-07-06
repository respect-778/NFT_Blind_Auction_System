/**
 * 图片缓存系统
 * 提供图片预加载、缓存管理和优化功能
 */

interface CachedImage {
  url: string;
  blob: Blob;
  timestamp: number;
  width?: number;
  height?: number;
}

interface ImageCacheConfig {
  maxSize: number; // 最大缓存大小（MB）
  maxAge: number; // 最大缓存时间（毫秒）
  maxItems: number; // 最大缓存项目数
}

class ImageCacheManager {
  private cache: Map<string, CachedImage> = new Map();
  private config: ImageCacheConfig;
  private totalSize: number = 0; // 当前缓存总大小（字节）

  constructor(config: Partial<ImageCacheConfig> = {}) {
    this.config = {
      maxSize: 50 * 1024 * 1024, // 50MB
      maxAge: 24 * 60 * 60 * 1000, // 24小时
      maxItems: 200,
      ...config
    };

    // 定期清理过期缓存
    setInterval(() => this.cleanExpiredCache(), 5 * 60 * 1000); // 每5分钟清理一次
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(url: string, width?: number, height?: number): string {
    const sizeParam = width && height ? `_${width}x${height}` : '';
    return `${url}${sizeParam}`;
  }

  /**
   * 检查缓存项是否过期
   */
  private isExpired(item: CachedImage): boolean {
    return Date.now() - item.timestamp > this.config.maxAge;
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const expiredKeys: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.removeFromCache(key);
    });

    console.log(`图片缓存清理完成，删除了 ${expiredKeys.length} 个过期项`);
  }

  /**
   * 从缓存中移除项目
   */
  private removeFromCache(key: string): void {
    const item = this.cache.get(key);
    if (item) {
      this.totalSize -= item.blob.size;
      this.cache.delete(key);
      // 释放Blob URL
      if (item.url.startsWith('blob:')) {
        URL.revokeObjectURL(item.url);
      }
    }
  }

  /**
   * 确保缓存大小在限制范围内
   */
  private ensureCacheSize(): void {
    // 如果超过最大项目数，删除最旧的项目
    if (this.cache.size > this.config.maxItems) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.removeFromCache(oldestKey);
      }
    }

    // 如果超过最大大小，删除最旧的项目直到在限制范围内
    while (this.totalSize > this.config.maxSize && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.removeFromCache(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * 预加载图片
   */
  async preloadImage(url: string, width?: number, height?: number): Promise<string> {
    if (!url) return '';

    const cacheKey = this.generateCacheKey(url, width, height);

    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached.url;
    }

    try {
      console.log(`预加载图片: ${url}`);

      // 获取图片数据
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();

      // 如果不是图片类型，抛出错误
      if (!blob.type.startsWith('image/')) {
        throw new Error(`不是有效的图片类型: ${blob.type}`);
      }

      // 创建Blob URL
      const blobUrl = URL.createObjectURL(blob);

      // 存储到缓存
      const cacheItem: CachedImage = {
        url: blobUrl,
        blob,
        timestamp: Date.now(),
        width,
        height
      };

      // 更新缓存大小
      this.totalSize += blob.size;

      // 确保缓存大小在限制范围内
      this.ensureCacheSize();

      // 存储到缓存
      this.cache.set(cacheKey, cacheItem);

      console.log(`图片缓存成功: ${url} (${(blob.size / 1024).toFixed(1)}KB)`);

      return blobUrl;
    } catch (error) {
      console.error(`图片预加载失败: ${url}`, error);
      throw error;
    }
  }

  /**
   * 获取缓存的图片
   */
  getCachedImage(url: string, width?: number, height?: number): string | null {
    const cacheKey = this.generateCacheKey(url, width, height);
    const cached = this.cache.get(cacheKey);

    if (cached && !this.isExpired(cached)) {
      return cached.url;
    }

    return null;
  }

  /**
   * 批量预加载图片
   */
  async preloadImages(urls: string[], concurrency: number = 3): Promise<void> {
    const chunks: string[][] = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      chunks.push(urls.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map(url => this.preloadImage(url))
      );

      // 在批次之间添加小延迟，避免过度消耗资源
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    for (const [key] of this.cache.entries()) {
      this.removeFromCache(key);
    }
    this.totalSize = 0;
    console.log('图片缓存已清空');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    size: number;
    totalSize: string;
    maxSize: string;
    items: number;
    maxItems: number;
  } {
    return {
      size: this.cache.size,
      totalSize: `${(this.totalSize / 1024 / 1024).toFixed(2)}MB`,
      maxSize: `${(this.config.maxSize / 1024 / 1024).toFixed(2)}MB`,
      items: this.cache.size,
      maxItems: this.config.maxItems
    };
  }

  /**
   * 检查图片是否在缓存中
   */
  isCached(url: string, width?: number, height?: number): boolean {
    const cacheKey = this.generateCacheKey(url, width, height);
    const cached = this.cache.get(cacheKey);
    return cached !== undefined && !this.isExpired(cached);
  }
}

// 创建全局图片缓存实例
export const imageCache = new ImageCacheManager({
  maxSize: 50 * 1024 * 1024, // 50MB
  maxAge: 24 * 60 * 60 * 1000, // 24小时
  maxItems: 200
});

/**
 * 图片预加载Hook
 */
export const useImagePreloader = () => {
  const preloadImage = async (url: string, width?: number, height?: number) => {
    try {
      return await imageCache.preloadImage(url, width, height);
    } catch (error) {
      console.error('图片预加载失败:', error);
      return url; // 返回原始URL作为fallback
    }
  };

  const preloadImages = async (urls: string[], concurrency: number = 3) => {
    try {
      await imageCache.preloadImages(urls, concurrency);
    } catch (error) {
      console.error('批量图片预加载失败:', error);
    }
  };

  const getCachedImage = (url: string, width?: number, height?: number) => {
    return imageCache.getCachedImage(url, width, height);
  };

  const isCached = (url: string, width?: number, height?: number) => {
    return imageCache.isCached(url, width, height);
  };

  const getCacheStats = () => {
    return imageCache.getCacheStats();
  };

  const clearCache = () => {
    imageCache.clearCache();
  };

  return {
    preloadImage,
    preloadImages,
    getCachedImage,
    isCached,
    getCacheStats,
    clearCache
  };
};

export default imageCache; 
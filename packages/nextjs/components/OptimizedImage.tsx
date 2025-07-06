"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  placeholder?: React.ReactNode;
  width?: number;
  height?: number;
  quality?: number;
  priority?: boolean;
  onLoad?: () => void;
  onError?: (error: string) => void;
  lazy?: boolean;
  rounded?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  fallbackSrc,
  placeholder,
  width,
  height,
  quality = 75,
  priority = false,
  onLoad,
  onError,
  lazy = true,
  rounded = 'rounded-lg',
  objectFit = 'cover'
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(!lazy || priority);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 图片URL优化函数
  const optimizeImageUrl = useCallback((url: string): string => {
    if (!url) return '';

    // 如果是IPFS URL，尝试使用更快的网关
    if (url.includes('ipfs://') || url.includes('ipfs.io')) {
      const hash = url.replace('ipfs://', '').replace(/^.*\/ipfs\//, '');

      // 使用多个IPFS网关提供冗余
      const gateways = [
        'https://ipfs.io/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/',
        'https://dweb.link/ipfs/'
      ];

      // 根据重试次数选择不同的网关
      const gatewayIndex = retryCount % gateways.length;
      const optimizedUrl = `${gateways[gatewayIndex]}${hash}`;

      // 添加尺寸和质量参数（如果支持）
      if (width && height) {
        try {
          const urlObj = new URL(optimizedUrl);
          urlObj.searchParams.set('w', width.toString());
          urlObj.searchParams.set('h', height.toString());
          urlObj.searchParams.set('q', quality.toString());
          urlObj.searchParams.set('format', 'webp');
          return urlObj.toString();
        } catch {
          // 如果URL构造失败，返回原始优化URL
          return optimizedUrl;
        }
      }

      return optimizedUrl;
    }

    // 对于常规URL，添加优化参数
    if (url.startsWith('http')) {
      try {
        const urlObj = new URL(url);
        if (width) urlObj.searchParams.set('w', width.toString());
        if (height) urlObj.searchParams.set('h', height.toString());
        urlObj.searchParams.set('q', quality.toString());
        urlObj.searchParams.set('format', 'webp');
        return urlObj.toString();
      } catch {
        return url;
      }
    }

    return url;
  }, [width, height, quality, retryCount]);

  // 懒加载观察器
  useEffect(() => {
    if (!lazy || priority || isInView) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsInView(true);
          observerRef.current?.disconnect();
        }
      },
      {
        rootMargin: '50px', // 提前50px开始加载
        threshold: 0.1
      }
    );

    if (imgRef.current) {
      observerRef.current.observe(imgRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [lazy, priority, isInView]);

  // 图片加载逻辑
  useEffect(() => {
    if (!isInView || !src) return;

    const optimizedSrc = optimizeImageUrl(src);
    setCurrentSrc(optimizedSrc);

    // 预加载图片
    const img = new Image();
    img.onload = () => {
      setIsLoading(false);
      setHasError(false);
      onLoad?.();
    };

    img.onerror = () => {
      console.error(`图片加载失败: ${optimizedSrc}`);

      // 重试机制
      if (retryCount < 3) {
        console.log(`重试加载图片 (${retryCount + 1}/3): ${optimizedSrc}`);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
        }, 1000 * Math.pow(2, retryCount)); // 指数退避
        return;
      }

      // 尝试回退到原始URL
      if (retryCount === 3 && src !== optimizedSrc) {
        console.log(`使用原始URL重试: ${src}`);
        setCurrentSrc(src);
        setRetryCount(4);
        return;
      }

      // 尝试fallback图片
      if (fallbackSrc && currentSrc !== fallbackSrc) {
        console.log(`使用fallback图片: ${fallbackSrc}`);
        setCurrentSrc(fallbackSrc);
        setRetryCount(5);
        return;
      }

      // 所有重试都失败
      setHasError(true);
      setIsLoading(false);
      onError?.(`图片加载失败: ${optimizedSrc}`);
    };

    img.src = optimizedSrc;
  }, [src, isInView, optimizeImageUrl, retryCount, fallbackSrc, currentSrc, onLoad, onError]);

  // 清理观察器
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // 默认占位符
  const defaultPlaceholder = (
    <div className="flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900 flex-col">
      <SparklesIcon className="h-16 w-16 mb-2 animate-pulse" />
      <p className="text-xs text-center px-2">
        {isLoading ? '加载中...' : '图片加载失败'}
      </p>
    </div>
  );

  // 如果还没有进入视口且启用了懒加载，显示占位符
  if (!isInView && lazy && !priority) {
    return (
      <div
        ref={imgRef}
        className={`${className} ${rounded} overflow-hidden bg-slate-800/50`}
        style={{ width, height }}
      >
        {placeholder || defaultPlaceholder}
      </div>
    );
  }

  // 如果图片加载失败，显示错误状态
  if (hasError) {
    return (
      <div
        className={`${className} ${rounded} overflow-hidden bg-slate-800/50 relative`}
        style={{ width, height }}
      >
        <div className="flex items-center justify-center h-full text-slate-400 bg-gradient-to-br from-slate-800 to-slate-900 flex-col">
          <SparklesIcon className="h-16 w-16 mb-2" />
          <p className="text-xs text-center px-2">图片加载失败</p>
          {src && (
            <p className="text-xs text-center px-2 mt-1 break-all opacity-50">
              {src.slice(0, 50)}...
            </p>
          )}
        </div>
        {/* 重试按钮 */}
        <button
          onClick={() => {
            setHasError(false);
            setIsLoading(true);
            setRetryCount(0);
          }}
          className="absolute top-2 right-2 bg-slate-700/80 hover:bg-slate-600/80 text-white text-xs px-2 py-1 rounded transition-colors duration-200"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${className} ${rounded} overflow-hidden relative`}
      style={{ width, height }}
    >
      {/* 加载占位符 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800/50">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400 mt-2">加载中...</p>
          </div>
        </div>
      )}

      {/* 实际图片 */}
      {currentSrc && (
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          className={`w-full h-full transition-all duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          style={{ objectFit }}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => {
            setIsLoading(false);
            onLoad?.();
          }}
          onError={() => {
            // 这里不处理错误，因为我们使用预加载的错误处理
          }}
        />
      )}

      {/* 渐进式加载效果 */}
      {!isLoading && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none"></div>
      )}
    </div>
  );
};

export default OptimizedImage; 
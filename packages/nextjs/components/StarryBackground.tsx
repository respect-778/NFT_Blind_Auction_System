"use client";
import { useState, useEffect } from "react";
import MeteorRain from "./MeteorRain";

interface StarryBackgroundProps {
  /** 流星数量，默认30 */
  meteorCount?: number;
  /** 星星数量，默认25 */
  starCount?: number;
  /** 小行星数量，默认18 */
  asteroidCount?: number;
  /** 是否显示装饰性渐变，默认true */
  showGradients?: boolean;
  /** 背景主题色调，默认'blue-purple' */
  theme?: 'blue-purple' | 'cyan-purple' | 'green-blue' | 'purple-pink';
}

export default function StarryBackground({
  meteorCount = 30,
  starCount = 25,
  asteroidCount = 18,
  showGradients = true,
  theme = 'blue-purple'
}: StarryBackgroundProps) {
  // 添加流星状态
  const [shootingStars, setShootingStars] = useState<{ top: string, left: string, delay: string, duration: string }[]>([]);
  // 添加小行星状态
  const [asteroids, setAsteroids] = useState<{ size: string, distance: string, speed: string, delay: string, rotation: string }[]>([]);

  // 主题色彩配置
  const themeColors = {
    'blue-purple': {
      gradients: [
        'from-[#020033] via-[#030045] to-[#020033]',
        'from-[#0a0058]/30 to-transparent',
        'from-[#060050]/50 via-[#040045]/30 to-transparent'
      ],
      accents: ['bg-cyan-500/20', 'bg-purple-500/20']
    },
    'cyan-purple': {
      gradients: [
        'from-[#001a33] via-[#002045] to-[#001a33]',
        'from-[#005858]/30 to-transparent',
        'from-[#005050]/50 via-[#004545]/30 to-transparent'
      ],
      accents: ['bg-cyan-400/20', 'bg-indigo-500/20']
    },
    'green-blue': {
      gradients: [
        'from-[#001a20] via-[#002030] to-[#001a20]',
        'from-[#005840]/30 to-transparent',
        'from-[#004050]/50 via-[#003545]/30 to-transparent'
      ],
      accents: ['bg-emerald-500/20', 'bg-blue-500/20']
    },
    'purple-pink': {
      gradients: [
        'from-[#200133] via-[#300245] to-[#200133]',
        'from-[#580058]/30 to-transparent',
        'from-[#500650]/50 via-[#450445]/30 to-transparent'
      ],
      accents: ['bg-purple-500/20', 'bg-pink-500/20']
    }
  };

  const currentTheme = themeColors[theme];

  // 星星闪烁效果
  useEffect(() => {
    // 确保只在浏览器环境中执行
    if (typeof window === "undefined") return;

    const createStar = () => {
      const container = document.querySelector(".star-container");
      if (!container) return;

      const star = document.createElement("div");
      star.className = "star-line";

      // 随机位置
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;

      // 随机大小
      const size = 1 + Math.random() * 2;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;

      // 随机动画持续时间
      star.style.animationDuration = `${3 + Math.random() * 5}s`;

      container.appendChild(star);

      // 动画结束后移除元素
      star.addEventListener("animationend", () => {
        star.remove();
      });
    };

    // 每1.5秒创建一个新的星星
    const interval = setInterval(createStar, 1500);

    // 初始创建星星
    for (let i = 0; i < starCount; i++) {
      setTimeout(() => createStar(), i * 100);
    }

    return () => clearInterval(interval);
  }, [starCount]);

  // 生成流星和小行星效果
  useEffect(() => {
    const stars = Array(3).fill(0).map(() => ({
      top: `${Math.random() * 50}%`,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 20}s`,
      duration: `${45 + Math.random() * 20}s`
    }));

    setShootingStars(stars);

    // 生成小行星效果
    const asteroidItems = Array(asteroidCount).fill(0).map(() => ({
      size: `${1.5 + Math.random() * 3.5}px`,
      distance: `${80 + Math.random() * 80}px`,
      speed: `${10 + Math.random() * 30}s`,
      delay: `${Math.random() * -20}s`,
      rotation: `${Math.random() * 360}deg`
    }));

    setAsteroids(asteroidItems);
  }, [asteroidCount]);

  return (
    <>
      {/* 主背景渐变 */}
      <div className={`absolute inset-0 bg-gradient-to-b ${currentTheme.gradients[0]}`}></div>

      {showGradients && (
        <div className="absolute inset-0">
          {/* 左上角渐变 */}
          <div className={`absolute top-0 left-0 w-1/3 h-1/3 bg-gradient-radial ${currentTheme.gradients[1]}`}></div>

          {/* 右下角渐变 */}
          <div className={`absolute bottom-0 right-0 w-1/3 h-1/3 bg-gradient-radial ${currentTheme.gradients[1]}`}></div>

          {/* 中心光晕 */}
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-radial ${currentTheme.gradients[2]}`}></div>
        </div>
      )}

      {/* 微妙的网格纹理 */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,0,81,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(6,0,81,0.1)_1px,transparent_1px)] bg-[size:100px_100px]"></div>

      {/* 星光效果容器 */}
      <div className="star-container absolute inset-0 pointer-events-none z-10"></div>

      {/* 流星雨特效 */}
      <MeteorRain count={meteorCount} minDuration={6} maxDuration={15} />

      {/* 流星效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {shootingStars.map((star, i) => (
          <div
            key={i}
            className="shooting-star"
            style={{
              top: star.top,
              left: star.left,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          ></div>
        ))}
      </div>

      {/* 光晕效果 */}
      {showGradients && (
        <>
          <div className={`absolute top-20 -left-40 w-80 h-80 ${currentTheme.accents[0]} rounded-full filter blur-[100px] animate-pulse`}></div>
          <div className={`absolute bottom-20 -right-40 w-80 h-80 ${currentTheme.accents[1]} rounded-full filter blur-[100px] animate-pulse`}></div>
        </>
      )}
    </>
  );
} 
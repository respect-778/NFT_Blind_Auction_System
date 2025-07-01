import { useEffect, useState } from "react";

interface MeteorRainProps {
  count?: number; // 流星数量
  minDuration?: number; // 最短持续时间（秒）
  maxDuration?: number; // 最长持续时间（秒）
}

// 导出一个默认函数，名为MeteorRain，接收一个MeteorRainProps类型的参数
export default function MeteorRain({ count = 30, minDuration = 8, maxDuration = 18 }: MeteorRainProps) {
  // 使用useState钩子，创建一个名为shootingStars的状态变量，初始值为一个空数组
  const [shootingStars, setShootingStars] = useState<{
    top: string;
    left: string;
    delay: string;
    duration: string;
    width: string; // 添加宽度属性
    brightness: string; // 添加亮度属性
    initialRotate: string; // 添加初始旋转角度
  }[]>([]);

  // 添加一个加载状态，控制流星雨的显示
  const [isLoaded, setIsLoaded] = useState(false);

  // 使用useEffect钩子，在count、minDuration、maxDuration发生变化时执行
  useEffect(() => {
    // 创建一个长度为count的数组，并使用map方法生成一个包含随机top、left、delay、duration的对象数组
    const stars = Array(count).fill(0).map(() => {
      // 随机宽度和亮度
      const width = 80 + Math.random() * 80; // 80-160px
      const brightness = 0.8 + Math.random() * 0.4; // 0.8-1.2

      return {
        top: `${Math.random() * 80}%`,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 10}s`,
        duration: `${minDuration + Math.random() * (maxDuration - minDuration)}s`,
        width: `${width}px`,
        brightness: brightness.toString(),
        initialRotate: "-45deg" // 添加初始旋转角度，确保从一开始就是斜向的
      };
    });

    // 设置一个短暂的延迟，确保DOM完全加载后再显示流星
    const timer = setTimeout(() => {
      setShootingStars(stars);
      setIsLoaded(true);
    }, 100);

    return () => clearTimeout(timer);
  }, [count, minDuration, maxDuration]);

  // 如果未加载完成，返回空的div
  if (!isLoaded) {
    return <div className="absolute inset-0 overflow-hidden pointer-events-none z-10"></div>;
  }

  // 返回一个div元素，包含多个div元素，每个div元素代表一颗流星
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {shootingStars.map((star, i) => (
        <div
          key={i}
          className="shooting-star"
          style={{
            top: star.top,
            left: star.left,
            animationDelay: star.delay,
            animationDuration: star.duration,
            width: star.width,
            filter: `brightness(${star.brightness})`,
            transform: `rotate(${star.initialRotate})` // 应用初始旋转角度
          }}
        ></div>
      ))}
    </div>
  );
}

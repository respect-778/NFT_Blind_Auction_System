"use client";
import { useState, useEffect, useRef } from "react";

interface SimpleImageShowcase3DProps {
  /** 是否显示模态框 */
  isOpen: boolean;
  /** 关闭模态框的回调 */
  onClose: () => void;
  /** 物品图片URL */
  imageUrl: string;
  /** 物品名称 */
  itemName: string;
  /** 物品描述 */
  description?: string;
}

export default function SimpleImageShowcase3D({
  isOpen,
  onClose,
  imageUrl,
  itemName,
  description
}: SimpleImageShowcase3DProps) {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [mounted, setMounted] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // 确保组件在客户端渲染
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // 自动旋转效果
  useEffect(() => {
    if (isOpen && isAutoRotating && !isDragging) {
      intervalRef.current = setInterval(() => {
        setRotation(prev => ({
          x: prev.x + 0.2,
          y: prev.y + 0.6
        }));
      }, 50);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isOpen, isAutoRotating, isDragging]);

  // 鼠标按下开始拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setIsAutoRotating(false);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  // 鼠标移动控制旋转
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;

      setRotation(prev => ({
        x: prev.x - deltaY * 0.5,
        y: prev.y + deltaX * 0.5
      }));

      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  // 鼠标抬起停止拖拽
  const handleMouseUp = () => {
    setIsDragging(false);
    setTimeout(() => {
      setIsAutoRotating(true);
    }, 1000);
  };

  // 键盘控制
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
          setRotation(prev => ({ ...prev, x: prev.x - 10 }));
          setIsAutoRotating(false);
          break;
        case 'arrowdown':
        case 's':
          setRotation(prev => ({ ...prev, x: prev.x + 10 }));
          setIsAutoRotating(false);
          break;
        case 'arrowleft':
        case 'a':
          setRotation(prev => ({ ...prev, y: prev.y - 10 }));
          setIsAutoRotating(false);
          break;
        case 'arrowright':
        case 'd':
          setRotation(prev => ({ ...prev, y: prev.y + 10 }));
          setIsAutoRotating(false);
          break;
        case ' ':
          e.preventDefault();
          setIsAutoRotating(!isAutoRotating);
          break;
        case 'r':
          setRotation({ x: 0, y: 0 });
          break;
        case 'escape':
          onClose();
          break;
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyPress);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [isOpen, isAutoRotating, onClose]);

  // 全局鼠标事件监听
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - lastMousePos.current.x;
        const deltaY = e.clientY - lastMousePos.current.y;

        setRotation(prev => ({
          x: prev.x - deltaY * 0.5,
          y: prev.y + deltaX * 0.5
        }));

        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setTimeout(() => {
          setIsAutoRotating(true);
        }, 1000);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging]);

  if (!mounted || !isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-lg"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-slate-800/80 hover:bg-slate-700 rounded-full flex items-center justify-center text-white transition-all duration-300 backdrop-blur-md border border-slate-600/50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 标题区域 */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-white mb-2">{itemName}</h2>
          {description && (
            <p className="text-slate-300 text-sm max-w-2xl mx-auto">{description}</p>
          )}
        </div>

        {/* 3D展示容器 */}
        <div className="relative">
          <div
            className="relative bg-gradient-to-br from-slate-900/50 to-slate-800/50 backdrop-blur-md rounded-xl border border-slate-600/30 p-6 perspective-1000"
          >
            {/* 3D图片容器 */}
            <div className="flex justify-center items-center min-h-[400px]">
              <div
                className="relative transform-gpu transition-transform duration-300 preserve-3d cursor-grab active:cursor-grabbing"
                style={{
                  transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
                  transformStyle: 'preserve-3d'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* 主图片 */}
                <div className="relative w-80 h-80 transform-gpu">
                  <img
                    src={imageUrl}
                    alt={itemName}
                    className="w-full h-full object-cover rounded-lg shadow-2xl"
                    style={{
                      filter: 'drop-shadow(0 15px 30px rgba(0,0,0,0.4))',
                    }}
                    draggable={false}
                  />
                </div>

                {/* 反射效果 */}
                <div
                  className="absolute top-full left-0 w-80 h-40 overflow-hidden"
                  style={{ transform: 'rotateX(180deg) translateZ(-1px)' }}
                >
                  <img
                    src={imageUrl}
                    alt=""
                    className="w-full h-full object-cover rounded-lg opacity-20"
                    style={{
                      maskImage: 'linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, transparent 60%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, transparent 60%)'
                    }}
                    draggable={false}
                  />
                </div>
              </div>
            </div>

            {/* 控制提示 */}
            <div className="mt-6 text-center">
              <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-600/30">
                <p className="text-slate-300 text-sm mb-2">🎮 控制方式</p>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-400">
                  <span className="bg-slate-700/40 px-2 py-1 rounded">鼠标拖拽</span>
                  <span className="bg-slate-700/40 px-2 py-1 rounded">WASD键</span>
                  <span className="bg-slate-700/40 px-2 py-1 rounded">空格键: {isAutoRotating ? '停止' : '开始'}自转</span>
                  <span className="bg-slate-700/40 px-2 py-1 rounded">R: 重置</span>
                  <span className="bg-slate-700/40 px-2 py-1 rounded">ESC: 关闭</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
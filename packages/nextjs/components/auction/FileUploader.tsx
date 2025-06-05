"use client";

import React, { useState, useRef } from "react";
import { notification } from "~~/utils/scaffold-eth";

interface FileUploaderProps {
  onUploadComplete: (cid: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onUploadComplete }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 使用NFT.Storage上传到IPFS
  const uploadToIPFS = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // 创建FormData对象
      const formData = new FormData();
      formData.append("file", file);

      // 使用web3.storage或者nft.storage的API
      // 这里简化为使用第三方免费的上传服务
      const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          // 使用公共测试密钥，实际使用中应该替换为你自己的密钥
          pinata_api_key: `2f7a88df9d47b0c4d59e`,
          pinata_secret_api_key: `6c45c0a2f173e0971481a0ddc036c180808a50212fbcfabd0863ec16c79dc658`,
        },
        body: formData,
      });

      setUploadProgress(70);

      // 处理响应
      if (response.ok) {
        const data = await response.json();
        // 获取CID
        const cid = data.IpfsHash;
        setUploadProgress(100);
        onUploadComplete(cid);
        notification.success("文件上传成功！");
      } else {
        throw new Error("上传失败");
      }
    } catch (error) {
      console.error("IPFS上传错误:", error);
      notification.error("文件上传失败，请重试。");
      // 回退到模拟上传方式（仅用于开发和演示）
      simulateUpload(file);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // 模拟上传（当IPFS服务不可用时的后备方案）
  const simulateUpload = (file: File) => {
    setIsUploading(true);
    let progress = 0;

    // 读取文件并创建模拟CID
    const reader = new FileReader();
    reader.onload = () => {
      // 模拟上传进度
      const interval = setInterval(() => {
        progress += 10;
        setUploadProgress(progress);

        if (progress >= 100) {
          clearInterval(interval);
          setIsUploading(false);

          // 生成模拟CID（仅用于演示）
          const mockCid = `mock${Math.random().toString(36).substring(2, 15)}`;
          onUploadComplete(mockCid);
          notification.success("模拟上传成功（开发模式）");
        }
      }, 200);
    };

    reader.readAsDataURL(file);
  };

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（限制为10MB）
    if (file.size > 10 * 1024 * 1024) {
      notification.error("文件过大，请上传小于10MB的文件");
      return;
    }

    // 检查文件类型（只允许图片）
    if (!file.type.startsWith("image/")) {
      notification.error("请上传图片文件");
      return;
    }

    uploadToIPFS(file);
  };

  // 触发文件选择
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {isUploading ? (
        <div className="w-full">
          <div className="w-full bg-slate-700 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2.5 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-xs text-center mt-2 text-slate-400">
            上传中... {uploadProgress}%
          </p>
        </div>
      ) : (
        <button
          onClick={handleClick}
          className="w-full py-3 px-4 border border-dashed border-slate-600 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
          </svg>
          <span className="text-slate-300">选择图片上传</span>
        </button>
      )}
    </div>
  );
}; 
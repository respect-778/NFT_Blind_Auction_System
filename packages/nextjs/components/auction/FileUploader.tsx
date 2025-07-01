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
  const [error, setError] = useState<string | null>(null);

  // 使用NFT.Storage上传到IPFS
  const uploadToIPFS = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 添加元数据
      const metadata = JSON.stringify({
        name: file.name,
        keyvalues: {
          uploadedAt: new Date().toISOString(),
          fileType: file.type,
          fileSize: file.size.toString()
        }
      });
      formData.append('pinataMetadata', metadata);

      // 添加选项
      const options = JSON.stringify({
        cidVersion: 0,
      });
      formData.append('pinataOptions', options);

      // 使用JWT认证方式（推荐）
      const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0ZWM0MzA2Ni01ZTYxLTQ3NTUtYmJmMy1jZjQxYmZlMmNkNDUiLCJlbWFpbCI6Imx4eTI4NjFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6ImU4MWIyNzNlODgzMGM0MzRhOGZjIiwic2NvcGVkS2V5U2VjcmV0IjoiZGE2N2MzYzFjYjkyYzE0OTJiMTI2MDc5ZTBiMjYzNGJlNzQxODkzNWVkYjI3MmVlM2MxNDFjNmZlOGMyOGQ0OCIsImV4cCI6MTc4MjQ1MjQzMH0.5rOuZORDFGuscw4wOJnyJKGZsQeyxUWLzbRTnGQR-ik";

      const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${JWT}`,
        },
        body: formData,
      });

      if (!response.ok) {
        // 如果JWT失败，回退到API Key方式
        console.log("JWT认证失败，尝试使用API Key...");
        const fallbackResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
          method: "POST",
          headers: {
            pinata_api_key: `e81b273e8830c434a8fc`,
            pinata_secret_api_key: `da67c3c1cb92c1492b126079e0b2634be7418935edb272ee3c141c6fe8c28d48`,
          },
          body: formData,
        });

        if (!fallbackResponse.ok) {
          const errorText = await fallbackResponse.text();
          console.error("IPFS上传失败:", errorText);
          throw new Error(`IPFS上传失败: ${fallbackResponse.status}`);
        }

        const fallbackResult = await fallbackResponse.json();
        console.log("IPFS上传成功 (API Key):", fallbackResult);
        onUploadComplete(fallbackResult.IpfsHash);
        return;
      }

      const result = await response.json();
      console.log("IPFS上传成功 (JWT):", result);
      onUploadComplete(result.IpfsHash);
    } catch (error) {
      console.error("上传失败:", error);
      setError("文件上传失败，请重试");
    } finally {
      setIsUploading(false);
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
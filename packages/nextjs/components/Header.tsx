"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon, BugAntIcon, CircleStackIcon, SparklesIcon, EyeSlashIcon, UserCircleIcon, HomeIcon, UsersIcon, PlusCircleIcon, KeyIcon, ChartBarIcon, ExclamationTriangleIcon, CodeBracketIcon, ShoppingBagIcon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { useAccount, usePublicClient } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "首页",
    href: "/",
    icon: <HomeIcon className="h-4 w-4" />,
  },
  {
    label: "铸造NFT",
    href: "/mint-nft",
    icon: <SparklesIcon className="h-4 w-4" />,
  },
  {
    label: "NFT市场",
    href: "/nft-market",
    icon: <ShoppingBagIcon className="h-4 w-4" />,
  },
  {
    label: "创建拍卖",
    href: "/create-auction",
    icon: <PlusCircleIcon className="h-4 w-4" />,
  },
  {
    label: "所有拍卖",
    href: "/all-auctions",
    icon: <UsersIcon className="h-4 w-4" />,
  },
  {
    label: "我的资产",
    href: "/my-auctions",
    icon: <UserCircleIcon className="h-4 w-4" />,
  },
  {
    label: "NFT下载",
    href: "/nft-download",
    icon: <CircleStackIcon className="h-4 w-4" />,
  },
  {
    label: "数据分析",
    href: "/analytics",
    icon: <ChartBarIcon className="h-4 w-4" />,
  },
  // {
  //   label: "调试合约",
  //   href: "/debug",
  //   icon: <BugAntIcon className="h-4 w-4" />,
  // },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        const isNftRelated = href.includes('nft') || href === '/create-auction' || href === '/my-auctions';

        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`relative group flex items-center gap-3 px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${isActive
                ? isNftRelated
                  ? "bg-gradient-to-r from-purple-600/90 to-pink-600/90 text-white shadow-lg shadow-purple-500/25 border border-purple-400/30 backdrop-blur-sm"
                  : "bg-gradient-to-r from-blue-600/90 to-purple-600/90 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30 backdrop-blur-sm"
                : "text-slate-200 hover:text-white hover:bg-gradient-to-r hover:from-blue-600/20 hover:to-purple-600/20 hover:shadow-md hover:shadow-blue-500/10 border border-transparent hover:border-blue-400/20 hover:backdrop-blur-sm"
                }`}
            >
              <span className={`transition-all duration-300 ${isActive ? "text-blue-200 drop-shadow-sm" : "text-slate-400 group-hover:text-blue-300"
                }`}>
                {icon}
              </span>
              <span className={`font-semibold tracking-wide ${isActive ? "text-white drop-shadow-sm" : "text-slate-200 group-hover:text-white"
                }`}>
                {label}
              </span>
              {/* NFT新功能标识 */}
              {label === "NFT市场" && (
                <span className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  NEW
                </span>
              )}
              {/* 活跃状态的光晕效果 */}
              {isActive && (
                <div className={`absolute inset-0 ${isNftRelated ? 'bg-gradient-to-r from-purple-600/10 to-pink-600/10' : 'bg-gradient-to-r from-blue-600/10 to-purple-600/10'} rounded-xl blur-sm -z-10`}></div>
              )}
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [nftCount, setNftCount] = useState(0);
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: nftContractData } = useDeployedContractInfo("AuctionNFT");

  useOutsideClick(
    burgerMenuRef,
    useCallback(() => setIsDrawerOpen(false), []),
  );

  // 获取用户NFT数量
  useEffect(() => {
    const fetchNFTCount = async () => {
      if (!address || !publicClient || !nftContractData) {
        setNftCount(0);
        return;
      }

      try {
        // 获取用户拥有的NFT数量
        const userNFTs = await publicClient.readContract({
          address: nftContractData.address,
          abi: nftContractData.abi,
          functionName: 'getUserNFTs',
          args: [address],
        }) as bigint[];

        setNftCount(userNFTs.length);
        console.log(`用户NFT数量: ${userNFTs.length}`);
      } catch (error) {
        console.error("获取NFT数量失败:", error);
        setNftCount(0);
      }
    };

    fetchNFTCount();

    // 每30秒刷新一次NFT数量
    const interval = setInterval(fetchNFTCount, 30000);

    return () => clearInterval(interval);
  }, [address, publicClient, nftContractData]);

  return (
    <div className="sticky xl:static top-0 navbar bg-gradient-to-r from-[#020033] via-[#030045] to-[#020033] min-h-0 flex-shrink-0 justify-between z-20 shadow-xl shadow-slate-900/50 border-b border-slate-700/30 backdrop-blur-sm px-0 sm:px-2">
      <div className="navbar-start w-auto xl:w-1/2">
        <div className="xl:hidden dropdown" ref={burgerMenuRef}>
          <label
            tabIndex={0}
            className={`ml-1 btn btn-ghost border-0 transition-all duration-300 ${isDrawerOpen
              ? "bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-white shadow-md backdrop-blur-sm"
              : "text-slate-200 hover:text-white hover:bg-gradient-to-r hover:from-blue-600/10 hover:to-purple-600/10 hover:backdrop-blur-sm"
              }`}
            onClick={() => {
              setIsDrawerOpen(prevIsOpenState => !prevIsOpenState);
            }}
          >
            <Bars3Icon className="h-6 w-6" />
          </label>
          {isDrawerOpen && (
            <ul
              tabIndex={0}
              className="menu menu-compact dropdown-content mt-3 p-3 shadow-2xl bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-lg rounded-2xl w-64 border border-slate-600/30"
              onClick={() => {
                setIsDrawerOpen(false);
              }}
            >
              <HeaderMenuLinks />
            </ul>
          )}
        </div>
        <Link href="/" passHref className="hidden xl:flex items-center gap-1 ml-4 mr-6 shrink-0">
          <div className="flex relative w-10 h-10">
            <Image alt="盲拍 logo" className="cursor-pointer" fill src="/logo.svg" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">NFT盲拍平台</span>
            <span className="text-xs text-slate-300">匿名、公正、透明</span>
          </div>
        </Link>
        <ul className="hidden xl:flex xl:flex-nowrap menu menu-horizontal px-1 gap-3">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end flex items-center gap-3 mr-4">
        {/* NFT计数器 */}
        <div className="flex items-center gap-1 px-3 py-1 bg-slate-800/30 rounded-lg border border-slate-600/30 backdrop-blur-sm">
          <SparklesIcon className="h-4 w-4 text-purple-400" />
          <span className="text-xs font-medium text-slate-300">NFT:</span>
          <span className="text-sm font-bold text-purple-300">{nftCount}</span>
        </div>

        <RainbowKitCustomConnectButton />
        <FaucetButton />
      </div>
    </div>
  );
};

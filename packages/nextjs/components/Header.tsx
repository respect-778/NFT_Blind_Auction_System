"use client";

import React, { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon, BugAntIcon, CircleStackIcon, SparklesIcon, EyeSlashIcon, UserCircleIcon, HomeIcon, UsersIcon, PlusCircleIcon, KeyIcon, ChartBarIcon, ExclamationTriangleIcon, CodeBracketIcon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";

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
    label: "所有拍卖",
    href: "/all-auctions",
    icon: <UsersIcon className="h-4 w-4" />,
  },
  {
    label: "创建拍卖",
    href: "/create-auction",
    icon: <PlusCircleIcon className="h-4 w-4" />,
  },
  {
    label: "我的拍卖",
    href: "/my-auctions",
    icon: <UserCircleIcon className="h-4 w-4" />,
  },
  {
    label: "数据分析",
    href: "/analytics",
    icon: <ChartBarIcon className="h-4 w-4" />,
  },
  {
    label: "调试合约",
    href: "/debug",
    icon: <BugAntIcon className="h-4 w-4" />,
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${isActive ? "bg-secondary shadow-md" : ""
                } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
            >
              {icon}
              <span>{label}</span>
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
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(
    burgerMenuRef,
    useCallback(() => setIsDrawerOpen(false), []),
  );

  return (
    <div className="sticky xl:static top-0 navbar bg-gradient-to-r from-[#020033] to-[#050057] min-h-0 flex-shrink-0 justify-between z-20 shadow-md shadow-blue-900/20 px-0 sm:px-2">
      <div className="navbar-start w-auto xl:w-1/2">
        <div className="xl:hidden dropdown" ref={burgerMenuRef}>
          <label
            tabIndex={0}
            className={`ml-1 btn btn-ghost ${isDrawerOpen ? "hover:bg-secondary" : "hover:bg-transparent"}`}
            onClick={() => {
              setIsDrawerOpen(prevIsOpenState => !prevIsOpenState);
            }}
          >
            <Bars3Icon className="h-1/2" />
          </label>
          {isDrawerOpen && (
            <ul
              tabIndex={0}
              className="menu menu-compact dropdown-content mt-3 p-2 shadow bg-[#020033] rounded-box w-52 border border-blue-900/30"
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
            <span className="font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">区块链盲拍系统</span>
            <span className="text-xs text-slate-300">匿名、公正、透明</span>
          </div>
        </Link>
        <ul className="hidden xl:flex xl:flex-nowrap menu menu-horizontal px-1 gap-2">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end flex-grow mr-4">
        <RainbowKitCustomConnectButton />
        <FaucetButton />
      </div>
    </div>
  );
};

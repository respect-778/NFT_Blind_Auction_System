import React from 'react';
import Head from 'next/head';

interface MetaHeaderProps {
  title?: string;
  description?: string;
  image?: string;
  twitterCard?: string;
  children?: React.ReactNode;
}

export const MetaHeader = ({
  title = "区块链盲拍平台 | 匿名加密拍卖",
  description = "使用区块链技术实现的盲拍平台，所有出价均经过加密处理",
  image = "/thumbnail.png",
  twitterCard = "summary_large_image",
  children,
}: MetaHeaderProps) => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.blockchain-auction.com";

  return (
    <Head>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={siteUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={`${siteUrl}${image}`} />

      {/* Twitter */}
      <meta property="twitter:card" content={twitterCard} />
      <meta property="twitter:url" content={siteUrl} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={`${siteUrl}${image}`} />

      {/* Additional child elements */}
      {children}
    </Head>
  );
}; 
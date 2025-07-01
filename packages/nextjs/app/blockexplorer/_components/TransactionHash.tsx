"use client";

import { useState } from "react";
import Link from "next/link";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";

export const TransactionHash = ({ hash }: { hash: string }) => {
  const [addressCopied, setAddressCopied] = useState(false);

  return (
    <div className="flex items-center space-x-2">
      <Link
        href={`/blockexplorer/transaction/${hash}`}
        className="text-blue-400 hover:text-blue-300 font-mono text-sm transition-colors duration-300 hover:underline decoration-blue-400/50"
      >
        {hash?.substring(0, 8)}...{hash?.substring(hash.length - 6)}
      </Link>

      <div className="relative">
        {addressCopied ? (
          <CheckCircleIcon
            className="h-4 w-4 text-green-400 cursor-pointer animate-pulse"
            aria-hidden="true"
          />
        ) : (
          <CopyToClipboard
            text={hash as string}
            onCopy={() => {
              setAddressCopied(true);
              setTimeout(() => {
                setAddressCopied(false);
              }, 800);
            }}
          >
            <DocumentDuplicateIcon
              className="h-4 w-4 text-slate-400 hover:text-cyan-400 cursor-pointer transition-colors duration-300"
              aria-hidden="true"
            />
          </CopyToClipboard>
        )}
      </div>
    </div>
  );
};

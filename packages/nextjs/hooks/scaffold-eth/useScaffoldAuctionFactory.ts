import { useCallback, useEffect, useState } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { Abi } from "abitype";
import { useInterval } from "usehooks-ts";
import * as chains from "viem/chains";
import { usePublicClient } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";
import { replacer } from "~~/utils/scaffold-eth/common";

/**
 * 获取拍卖工厂合约创建的拍卖列表
 * @param fromBlock - 开始查询的区块
 * @param beneficiaryFilter - 可选的受益人过滤器
 * @param watch - 是否持续监听新事件
 * @param enabled - 是否启用Hook
 */
export const useScaffoldAuctionEvents = ({
  fromBlock,
  beneficiaryFilter,
  watch = false,
  enabled = true,
}: {
  fromBlock: bigint;
  beneficiaryFilter?: `0x${string}`;
  watch?: boolean;
  enabled?: boolean;
}) => {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [fromBlockUpdated, setFromBlockUpdated] = useState<bigint>(fromBlock);

  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo("BlindAuctionFactory");
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({
    chainId: targetNetwork.id,
  });

  const readEvents = useCallback(
    async () => {
      setIsLoading(true);
      try {
        if (!deployedContractData) {
          throw new Error("Factory contract not found");
        }

        if (!enabled) {
          throw new Error("Hook disabled");
        }

        if (!publicClient) {
          throw new Error("Public client not found");
        }

        // 查找AuctionCreated事件
        const event = (deployedContractData.abi as Abi).find(
          part => part.type === "event" && part.name === "AuctionCreated",
        );

        if (!event) {
          throw new Error("AuctionCreated event not found in contract ABI");
        }

        const blockNumber = await publicClient.getBlockNumber({ cacheTime: 0 });

        if (blockNumber >= fromBlockUpdated) {
          const filters: any = {};
          if (beneficiaryFilter) {
            filters.beneficiary = beneficiaryFilter;
          }

          const logs = await publicClient.getLogs({
            address: deployedContractData?.address,
            event: event as any,
            args: filters,
            fromBlock: fromBlockUpdated,
            toBlock: blockNumber,
          });

          setFromBlockUpdated(blockNumber + 1n);

          const newEvents = [];
          for (let i = logs.length - 1; i >= 0; i--) {
            const block = await publicClient.getBlock({ blockHash: logs[i].blockHash as `0x${string}` });

            newEvents.push({
              log: logs[i],
              args: logs[i].args,
              block: block,
            });
          }
          setEvents([...newEvents, ...events]);
          setError(undefined);
        }
      } catch (e: any) {
        if (events.length > 0) {
          setEvents([]);
        }
        setError(e);
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    },
    [beneficiaryFilter, deployedContractData, enabled, events, fromBlockUpdated, publicClient],
  );

  useEffect(() => {
    if (!deployedContractLoading) {
      readEvents();
    }
  }, [readEvents, deployedContractLoading]);

  useEffect(() => {
    // Reset the internal state when target network or fromBlock changed
    setEvents([]);
    setFromBlockUpdated(fromBlock);
    setError(undefined);
  }, [fromBlock, targetNetwork.id]);

  useInterval(
    async () => {
      if (!deployedContractLoading) {
        readEvents();
      }
    },
    watch && enabled ? (targetNetwork.id !== chains.hardhat.id ? scaffoldConfig.pollingInterval : 4_000) : null,
  );

  return {
    data: events,
    isLoading: isLoading,
    error: error,
  };
}; 
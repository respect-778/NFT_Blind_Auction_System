import { useEffect, useState } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { getPublicClient } from "wagmi/actions";
import { Abi, AbiEvent } from "abitype";
import { Log } from "viem";

/**
 * @dev Hook to get auction events from the contract
 * @param contractName - deployed contract name
 * @param eventName - name of the event to listen for
 * @param fromBlock - from which block to start getting the events, default is 0
 * @returns
 */
export const useScaffoldAuctionEvents = ({
  contractName,
  eventName,
  fromBlock,
  filters,
  blockData,
  transactionData,
  receiptData,
}: {
  contractName: string;
  eventName: string;
  fromBlock?: bigint;
  filters?: any;
  blockData?: boolean;
  transactionData?: boolean;
  receiptData?: boolean;
}) => {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const { data: deployedContractData } = useDeployedContractInfo(contractName);
  const { targetNetwork } = useTargetNetwork();

  useEffect(() => {
    const getEvents = async () => {
      try {
        setIsLoading(true);
        const publicClient = getPublicClient({ chainId: targetNetwork.id });

        if (deployedContractData) {
          const event = (deployedContractData.abi as Abi).find(
            part => part.type === "event" && part.name === eventName,
          ) as AbiEvent;

          if (!event) {
            throw new Error(`Event ${eventName} not found in contract ${contractName}`);
          }

          let logs = [] as Log[];

          logs = await publicClient.getLogs({
            address: deployedContractData.address,
            event,
            args: filters as any,
            fromBlock: fromBlock || 0n,
          });

          const auctionEvents = await Promise.all(
            logs.map(async log => {
              const block = blockData
                ? await publicClient.getBlock({ blockHash: log.blockHash })
                : undefined;

              const transaction = transactionData
                ? await publicClient.getTransaction({ hash: log.transactionHash })
                : undefined;

              const receipt = receiptData
                ? await publicClient.getTransactionReceipt({ hash: log.transactionHash })
                : undefined;

              return {
                log,
                args: log.args,
                block,
                transaction,
                receipt,
              };
            }),
          );

          setEvents(auctionEvents);
        }
      } catch (e: any) {
        console.error("Error getting events:", e);
        setError(e.message || "Error getting events");
      } finally {
        setIsLoading(false);
      }
    };

    getEvents();
  }, [
    contractName,
    deployedContractData,
    eventName,
    filters,
    fromBlock,
    blockData,
    targetNetwork.id,
    transactionData,
    receiptData,
  ]);

  return {
    data: events,
    isLoading: isLoading,
    error: error,
  };
}; 
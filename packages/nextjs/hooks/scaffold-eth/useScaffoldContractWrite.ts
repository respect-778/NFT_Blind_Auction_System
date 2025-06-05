import { useCallback } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useWalletClient } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";

/**
 * 用于写入合约的Hook
 * @param contractName 合约名称
 * @param functionName 函数名称
 * @param args 函数参数（可选）
 * @param onBlockConfirmation 区块确认回调（可选）
 * @param blockConfirmations 确认区块数（可选，默认为1）
 * @returns 写入合约的异步函数
 */
export const useScaffoldContractWrite = ({
  contractName,
  functionName,
  args,
  onBlockConfirmation,
  blockConfirmations = 1,
}: {
  contractName: string;
  functionName: string;
  args?: any[];
  onBlockConfirmation?: (txnReceipt: any) => void;
  blockConfirmations?: number;
}) => {
  const { data: deployedContractData } = useDeployedContractInfo(contractName);
  const { data: walletClient } = useWalletClient();
  const { targetNetwork } = useTargetNetwork();

  const writeAsync = useCallback(
    async ({
      args: overrideArgs,
      value,
    }: {
      args?: any[];
      value?: bigint;
    } = {}) => {
      if (!deployedContractData) {
        notification.error(`Contract ${contractName} not found!`);
        throw new Error(`Contract ${contractName} not found!`);
      }

      if (!walletClient) {
        notification.error("Wallet not connected");
        throw new Error("Wallet not connected");
      }

      try {
        const txArgs = overrideArgs || args || [];

        const hash = await walletClient.writeContract({
          address: deployedContractData.address,
          abi: deployedContractData.abi,
          functionName,
          args: txArgs,
          value,
        });

        const receipt = await walletClient.waitForTransactionReceipt({
          hash,
          confirmations: blockConfirmations,
        });

        if (onBlockConfirmation) {
          onBlockConfirmation(receipt);
        }

        return receipt;
      } catch (error: any) {
        console.error("Error executing contract write:", error);

        const errorMessage = error.message || error.toString();
        notification.error(errorMessage);
        throw error;
      }
    },
    [args, blockConfirmations, contractName, deployedContractData, functionName, onBlockConfirmation, walletClient],
  );

  return {
    writeAsync,
  };
}; 
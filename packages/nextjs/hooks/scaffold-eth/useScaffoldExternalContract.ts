import { Contract, Interface, InterfaceAbi } from "ethers";
import { useContract, useProvider, useSigner } from "wagmi";
import { useTargetNetwork } from "./useTargetNetwork";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";

/**
 * Hook用于与区块链上的任意合约交互
 * @param contractAddress 合约地址
 * @param contractAbi 合约ABI
 * @returns 合约对象和相关数据
 */
export const useScaffoldExternalContract = ({
  contractAddress,
  contractAbi,
}: {
  contractAddress?: string;
  contractAbi?: InterfaceAbi;
}) => {
  const { chain } = useTargetNetwork();
  const provider = useProvider({ chainId: chain.id });
  const { data: signer } = useSigner();

  const contract = useContract({
    address: contractAddress,
    abi: contractAbi,
    signerOrProvider: signer || provider,
  });

  return {
    data: contract ? new Contract(contractAddress as string, contractAbi as InterfaceAbi, signer || provider) : undefined,
  };
}; 
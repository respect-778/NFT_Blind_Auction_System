import { TransactionHash } from "./TransactionHash";
import { formatEther } from "viem";
import { Address } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { TransactionWithFunction } from "~~/utils/scaffold-eth";
import { TransactionsTableProps } from "~~/utils/scaffold-eth/";

export const TransactionsTable = ({ blocks, transactionReceipts }: TransactionsTableProps) => {
  const { targetNetwork } = useTargetNetwork();

  return (
    <div className="flex justify-center px-4 md:px-0 mb-8">
      <div className="w-full max-w-7xl">
        <div className="bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
          {/* 表头装饰 */}
          <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500"></div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                    Transaction Hash
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                    Function Called
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                    Block Number
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">
                    Time Mined
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-yellow-400">
                    From
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
                    To
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">
                    Value ({targetNetwork.nativeCurrency.symbol})
                  </th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((block, blockIndex) =>
                  (block.transactions as TransactionWithFunction[]).map((tx, txIndex) => {
                    const receipt = transactionReceipts[tx.hash];
                    const timeMined = new Date(Number(block.timestamp) * 1000).toLocaleString();
                    const functionCalled = tx.input.substring(0, 10);
                    const isEven = (blockIndex + txIndex) % 2 === 0;

                    return (
                      <tr
                        key={tx.hash}
                        className={`border-b border-slate-700/30 hover:bg-slate-800/50 transition-all duration-300 ${isEven ? 'bg-slate-800/20' : 'bg-slate-900/20'
                          }`}
                      >
                        <td className="px-6 py-5">
                          <TransactionHash hash={tx.hash} />
                        </td>
                        <td className="px-6 py-5 min-w-[200px]">
                          {tx.functionName && tx.functionName !== "0x" ? (
                            <div className="flex items-center space-x-3">
                              <span className="text-white font-medium text-sm bg-gradient-to-r from-blue-600/40 to-purple-600/40 px-3 py-1 rounded-lg border border-blue-500/30">
                                {tx.functionName}
                              </span>
                              {functionCalled !== "0x" && (
                                <span className="text-xs font-mono text-purple-300 bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/20">
                                  {functionCalled}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center space-x-3">
                              <span className="text-slate-500 text-sm italic">Transfer</span>
                              {functionCalled !== "0x" && (
                                <span className="text-xs font-mono text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded border border-slate-600/30">
                                  {functionCalled}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-cyan-400 font-mono text-sm bg-cyan-900/20 px-2 py-1 rounded border border-cyan-500/20">
                            {block.number?.toString()}
                          </span>
                        </td>
                        <td className="px-6 py-5 min-w-[160px]">
                          <span className="text-slate-300 text-sm">
                            {timeMined}
                          </span>
                        </td>
                        <td className="px-6 py-5 min-w-[140px]">
                          <Address address={tx.from} size="sm" />
                        </td>
                        <td className="px-6 py-5 min-w-[140px]">
                          {!receipt?.contractAddress ? (
                            tx.to && <Address address={tx.to} size="sm" />
                          ) : (
                            <div className="space-y-2">
                              <Address address={receipt.contractAddress} size="sm" />
                              <div className="text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded border border-green-500/30 w-fit">
                                📄 Contract Creation
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="text-right">
                            <span className="text-green-400 font-mono font-semibold bg-green-900/20 px-2 py-1 rounded border border-green-500/20">
                              {formatEther(tx.value)} {targetNetwork.nativeCurrency.symbol}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>

          {blocks.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4 opacity-50">🔍</div>
              <h3 className="text-xl font-semibold text-slate-400 mb-2">暂无交易记录</h3>
              <p className="text-slate-500 text-sm">
                当有新的交易产生时，将会在这里显示
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

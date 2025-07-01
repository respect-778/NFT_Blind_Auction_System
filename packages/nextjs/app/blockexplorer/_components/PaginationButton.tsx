import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

type PaginationButtonProps = {
  currentPage: number;
  totalItems: number;
  setCurrentPage: (page: number) => void;
};

const ITEMS_PER_PAGE = 20;

export const PaginationButton = ({ currentPage, totalItems, setCurrentPage }: PaginationButtonProps) => {
  const isPrevButtonDisabled = currentPage === 0;
  const isNextButtonDisabled = currentPage + 1 >= Math.ceil(totalItems / ITEMS_PER_PAGE);
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  if (isNextButtonDisabled && isPrevButtonDisabled) return null;

  return (
    <div className="flex justify-center px-4 md:px-0 mt-8">
      <div className="bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-700/50 shadow-xl p-6">
        <div className="flex items-center justify-center space-x-6">
          <button
            className={`flex items-center px-4 py-2 rounded-xl font-semibold transition-all duration-300 transform ${isPrevButtonDisabled
                ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:scale-105 shadow-lg hover:shadow-blue-500/25'
              }`}
            disabled={isPrevButtonDisabled}
            onClick={() => setCurrentPage(currentPage - 1)}
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            上一页
          </button>

          <div className="flex items-center space-x-4">
            <span className="text-slate-400 text-sm">第</span>
            <span className="px-4 py-2 bg-gradient-to-r from-purple-600/40 to-blue-600/40 border border-purple-500/30 rounded-xl text-white font-bold text-lg">
              {currentPage + 1}
            </span>
            <span className="text-slate-400 text-sm">页</span>
            <span className="text-slate-500 text-sm">/ {totalPages} 页</span>
          </div>

          <button
            className={`flex items-center px-4 py-2 rounded-xl font-semibold transition-all duration-300 transform ${isNextButtonDisabled
                ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white hover:scale-105 shadow-lg hover:shadow-purple-500/25'
              }`}
            disabled={isNextButtonDisabled}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            下一页
            <ArrowRightIcon className="h-4 w-4 ml-2" />
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-slate-400 text-sm">
            共 {totalItems} 条交易记录
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * 交易错误处理工具
 */

import { notification } from "~~/utils/scaffold-eth";

export interface TransactionError {
  message?: string;
  shortMessage?: string;
  name?: string;
  code?: string | number;
  reason?: string;
}

/**
 * 处理交易错误并显示相应的提示
 * @param error 错误对象
 * @param action 操作名称，如"出价"、"铸造NFT"等
 * @returns 格式化的错误消息
 */
export const handleTransactionError = (error: any, action: string = "交易"): string => {
  let errorMessage = `${action}失败`;

  if (!error) {
    notification.error(errorMessage);
    return errorMessage;
  }

  // 处理用户取消交易
  if (
    error.message?.includes("User rejected") ||
    error.message?.includes("user rejected") ||
    error.message?.includes("用户拒绝") ||
    error.message?.includes("User denied") ||
    error.code === 4001 ||
    error.code === "ACTION_REJECTED"
  ) {
    errorMessage = "用户取消了交易";
    notification.info(errorMessage);
    return errorMessage;
  }

  // 处理余额不足
  if (
    error.message?.includes("insufficient funds") ||
    error.message?.includes("余额不足") ||
    error.reason?.includes("insufficient funds")
  ) {
    errorMessage = "余额不足，无法完成交易";
    notification.error(errorMessage);
    return errorMessage;
  }

  // 处理Gas费用问题
  if (
    error.message?.includes("gas") ||
    error.message?.includes("Gas") ||
    error.message?.includes("out of gas")
  ) {
    errorMessage = "Gas费用不足或估算失败";
    notification.error(errorMessage);
    return errorMessage;
  }

  // 处理网络错误
  if (
    error.message?.includes("network") ||
    error.message?.includes("Network") ||
    error.message?.includes("timeout") ||
    error.name === "TimeoutError"
  ) {
    errorMessage = "网络连接超时，请重试";
    notification.error(errorMessage);
    return errorMessage;
  }

  // 处理合约执行错误
  if (
    error.message?.includes("execution reverted") ||
    error.message?.includes("revert") ||
    error.reason
  ) {
    const reason = error.reason || "合约执行失败";
    errorMessage = `${action}失败: ${reason}`;
    notification.error(errorMessage);
    return errorMessage;
  }

  // 处理其他已知错误
  if (error.shortMessage) {
    errorMessage = `${action}失败: ${error.shortMessage}`;
  } else if (error.message) {
    // 截取前50个字符，避免错误信息过长
    const msg = error.message.length > 50
      ? error.message.substring(0, 50) + "..."
      : error.message;
    errorMessage = `${action}失败: ${msg}`;
  }

  notification.error(errorMessage);
  return errorMessage;
};

/**
 * 处理交易确认相关的提示
 */
export const handleTransactionStatus = {
  /**
   * 交易提交成功
   */
  submitted: (action: string = "交易") => {
    notification.info(`${action}已提交，等待确认...`);
  },

  /**
   * 交易确认成功
   */
  confirmed: (action: string = "交易") => {
    notification.success(`${action}已确认！`);
  },

  /**
   * 交易确认中
   */
  pending: (action: string = "交易") => {
    notification.info(`${action}确认中，请稍候...`);
  }
};

/**
 * 交易状态枚举
 */
export enum TransactionStatus {
  IDLE = "idle",
  PENDING = "pending",
  CONFIRMING = "confirming",
  SUCCESS = "success",
  FAILED = "failed",
  CANCELLED = "cancelled"
}

/**
 * 简化的交易状态管理 Hook 接口
 */
export interface TransactionState {
  status: TransactionStatus;
  hash?: string;
  error?: string;
} 
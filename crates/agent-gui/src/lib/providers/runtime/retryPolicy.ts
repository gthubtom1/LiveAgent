import type { ProviderRetryPolicy } from "../../settings";
import { DEFAULT_STREAM_RETRY_MAX_ATTEMPTS, type StreamRetryConfig } from "./streamRetry";

let activeGlobalRetryPolicy: ProviderRetryPolicy | undefined;

export function setActiveGlobalRetryPolicy(policy: ProviderRetryPolicy | undefined): void {
  activeGlobalRetryPolicy = policy;
}

export function getActiveGlobalRetryPolicy(): ProviderRetryPolicy | undefined {
  return activeGlobalRetryPolicy;
}

/**
 * 供应商级重试策略 → withStreamRetry 选项的解析（PR-2 策略归属权反转）。
 *
 * - 缺省（undefined）→ 若未配置则继承 activeGlobalRetryPolicy，未配置全局则落到
 *   全局 DEFAULT_STREAM_RETRY_MAX_ATTEMPTS；
 * - off → { disabled: true }：禁用流内重试（不影响跨供应商 failover）；
 * - infinite → { maxAttempts: Infinity }：无限重试直到成功；
 * - custom → { maxAttempts: maxRetries + 1 }：设置里存的是"首次失败后的
 *   重试次数"（用户口径，不含首次请求），withStreamRetry 的 maxAttempts
 *   是总尝试数，两者相差恰好 1。
 *
 * 返回值供消费方与自己的 onRetry/onRetryRecovered 回调展开合并；回调语义
 * 与 buffer-until-commit 缓冲不受策略影响。failover 场景下每个候选用各自
 * runtime 的策略调用本函数——策略跟着目标供应商走，与传输配置同口径。
 */
export function resolveStreamRetryConfig(
  retryPolicy: ProviderRetryPolicy | undefined,
): Pick<StreamRetryConfig, "maxAttempts" | "disabled"> {
  const effective = retryPolicy ?? activeGlobalRetryPolicy;
  if (!effective) return {};
  if (effective.mode === "off") return { disabled: true };
  if (effective.mode === "infinite") return { maxAttempts: Infinity };
  return { maxAttempts: effective.maxRetries + 1 };
}

/**
 * 有总时限的辅助流（压缩摘要）：总尝试数取用户策略与 cap 的较小者，策略 off 照旧
 * 禁用。它是这类请求全链路唯一的一层重试。
 */
export function resolveCappedStreamRetryConfig(
  retryPolicy: ProviderRetryPolicy | undefined,
  maxAttempts: number,
): Pick<StreamRetryConfig, "maxAttempts" | "disabled"> {
  const resolved = resolveStreamRetryConfig(retryPolicy);
  return {
    ...resolved,
    maxAttempts: Math.min(resolved.maxAttempts ?? DEFAULT_STREAM_RETRY_MAX_ATTEMPTS, maxAttempts),
  };
}

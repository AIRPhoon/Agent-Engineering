/** 程序统计提供方实际报告的用量；不估算缺失数据，不实施刚性 token 限额。 */
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
/** 主 Agent、两类成果检查与按需财务调用的归属。 */
export type Role = 'main' | 'audit' | 'supervisor' | 'finance';
/** 按主会话存储本次插件激活期间的计量记录。 */
export declare class UsageLedger {
    private readonly sessions;
    /**
     * llm/stream 在单次请求结束或异常退出时调用，最后一条 usage 是该请求的权威快照。
     * @param sessionId 所属主会话，不把检查子会话分散到另一个总账。
     * @param role 主执行、审计或监理。
     * @param usage 提供方用量；没有报告时显式传 null。
     */
    record(sessionId: string, role: Role, usage: TokenUsage | null): void;
    /**
     * quality_usage 调用；只返回数值摘要，不把历史代码或全部请求重复发给模型。
     * @param sessionId 主会话标识。
     * @returns 各角色调用数、已知计数和缺失情况；null 缓存字段表示提供方未报告。
     */
    summary(sessionId: string): {
        role: "audit" | "finance" | "main" | "supervisor";
        calls: number;
        missingUsage: number;
        reportedZeroCalls: number;
        inputTokens: number | null;
        outputTokens: number | null;
        cacheReadTokens: number | null;
        cacheWriteTokens: number | null;
        totalTokens: number | null;
    }[];
}

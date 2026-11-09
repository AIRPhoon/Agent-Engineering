/** 财务 subagent 的输入与严格协议；程序验证证据出处，模型负责必要性与范围的语义判断。 */
import type { EvidenceFile } from './evidence.ts';
import { type ReviewReport, type ReviewRequest } from './review.ts';
/** 两批报送项的比较；added/omitted 不证明磁盘文件创建或删除。 */
export interface FileChanges {
    added: string[];
    changed: string[];
    omitted: string[];
    unchanged: string[];
}
/** 为何需要额外的语义财务调用；完全重复申请不会到达这些分支。 */
export type FinanceTrigger = 'requested' | 'partial-change' | 'scope-change' | 'material-change';
/** 引用必须能在指定材料中逐字找到；explanation 说明该证据与必要性判断的关联。 */
export interface FinanceReason {
    source: string;
    quote: string;
    explanation: string;
}
/** narrow 只提出较小的成果文件范围，保留原目标，交报送方整理必要上下文后重新申请。 */
export interface FinanceReport {
    decision: 'allow' | 'narrow' | 'block' | 'needs-information';
    summary: string;
    reasons: FinanceReason[];
    proposedFiles: string[];
}
/** 同时呈现程序前置判断与实际财务模型结论，不把财务放行当作成果通过。 */
export interface FinanceDecision {
    decision: 'allow' | 'suggest-narrowing' | 'block' | 'needs-information';
    reason: string;
    baselineFingerprint: string | null;
    previousVerdict: ReviewReport['verdict'] | null;
    changes: FileChanges | null;
    semantic?: {
        trigger: FinanceTrigger;
        cached: boolean;
        report: FinanceReport;
    };
}
/** ReviewFlow 提供给财务检查器的材料；上次报告包括未解决意见，不能仅凭哈希推断正确性。 */
export interface FinanceInput {
    request: ReviewRequest;
    files: readonly EvidenceFile[];
    program: FinanceDecision;
    previousReport: ReviewReport | null;
    trigger: FinanceTrigger;
}
/** 由 DSH 适配层实现；等待一次无工具权限的财务子会话，返回待校验的 JSON。 */
export type Financier = (input: FinanceInput, signal: AbortSignal) => Promise<unknown>;
/**
 * 由 ReviewFlow 和 DSH 文本适配层调用，验证模型结论与所引用的材料。
 * @param value 未校验的财务 JSON。
 * @param input 实际发给模型的材料，用于检查引用是否存在、缩小范围是否确为报送项子集。
 * @returns 可执行的财务意见；格式、引用或范围错误直接抛出，不能静默放行。
 */
export declare function parseFinanceReport(value: unknown, input: FinanceInput): FinanceReport;
/** DSH 适配层在子会话完成后调用；共用围栏/说明文字的剥离规则，但保留财务的严格校验。 */
export declare function parseFinanceText(value: unknown, input: FinanceInput): FinanceReport;
/**
 * 为 DSH 财务子会话生成可记录的完整提示，不隐藏注入或自动截断文件。
 * @param input 程序前置结果、当前材料和历史报告。
 * @returns 仅判断检查必要性/范围的任务；无代码修改、测试执行或成果验收权限。
 */
export declare function financePrompt(input: FinanceInput): string;

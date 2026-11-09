import type { EvidenceFile } from './evidence.ts';
import { type ReviewReport, type ReviewRequest } from './review.ts';
import { type FinanceDecision, type Financier } from './finance.ts';
import type { FinanceRecord, ReviewRecord } from './store.ts';
export type { FileChanges, FinanceDecision } from './finance.ts';
/**
 * 检查器由 DSH 适配层提供，在财务放行后触发。
 * 第三个参数是本次财务建议的副本；适配层把它记录进子 Agent 提示，结果经 Promise 回到 run。
 */
export type Reviewer = (request: ReviewRequest, signal: AbortSignal, finance: FinanceDecision) => Promise<unknown>;
/** 由 DSH 适配层从插件级记忆加载的种子与写入回调；没有记忆时保持纯内存。 */
export interface FlowMemory {
    reviews?: ReviewRecord[];
    finance?: FinanceRecord[];
    record?: (entry: ReviewRecord | FinanceRecord) => Promise<void> | void;
}
/** 明确区分财务驳回和检查结论；重复申请保留上次状态，不生成新的通过结论。 */
export type ReviewOutcome = {
    finance: FinanceDecision;
} & ({
    status: 'blocked';
    fingerprint: string;
    reason: 'duplicate' | 'in-progress' | 'finance' | 'scope-revision' | 'needs-information';
    previous: ReviewReport | null;
} | {
    status: 'reviewed';
    fingerprint: string;
    recipient: 'executor' | 'planner';
    report: ReviewReport;
});
/** 单个会话的内存缓存，插件重载后清空；持久结果由 DSH 工具日志保存。 */
export declare class ReviewFlow {
    private readonly completed;
    private readonly running;
    private readonly baselines;
    private readonly financeCache;
    private sequence;
    /** 适配层提供的持久化回调；没有它时本实例只保存在内存。 */
    private readonly record;
    /**
     * 用插件级记忆的热启动数据填充去重、基线与财务缓存。
     * 种子按文件顺序重放：同一对象后出现的记录覆盖先前的基线。
     * @param memory 历史记录与写入回调；测试与无记忆场景可省略。
     */
    constructor(memory?: FlowMemory);
    /**
     * 写记忆是建议性缓存：失败不改变检查结论，也不阻断返回。
     * @param entry 已通过校验、准备持久化的审查或财务记录。
     */
    private write;
    /**
     * quality_review 工具调用；申请、财务判断与启动检查在同一调用内，无法绕开前置判断。
     * @param request 包含目标、调用关系、验证证据和成果来源的规范请求。
     * @param evidence 已读取的真实文件；空数组表示本次只依据粘贴文本。
     * @param review 获准后才会调用的审计或监理。
     * @param signal 工具调用的取消信号，向下传给实际检查器。
     * @param financier 适配层注册的财务回调；确定性分支不会调用，需要语义判断却缺回调时直接报错。
     * @returns 驳回记录，或经校验的检查结果及意见接收方。
     */
    run(request: ReviewRequest, evidence: readonly EvidenceFile[], review: Reviewer, signal: AbortSignal, financier?: Financier): Promise<ReviewOutcome>;
}

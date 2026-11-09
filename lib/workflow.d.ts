import type { EvidenceFile } from './evidence.ts';
import { type ReviewReport, type ReviewRequest } from './review.ts';
import { type FinanceDecision, type Financier, type FinanceReport } from './finance.ts';
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
    /** 本会话实际使用的模型标识；写入记录时随条目保存，历史里据此追溯。 */
    model?: string | null;
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
/** 仅保留比较所需的文本摘要与文件哈希，不在历史缓存中保存文件全文。 */
interface Snapshot {
    details: string;
    files: Map<string, string>;
}
/** 同一 kind/target 最近一次取得有效报告的报送；sequence 按申请顺序区分并发版本。 */
export interface Baseline extends Snapshot {
    fingerprint: string;
    verdict: ReviewReport['verdict'];
    report: ReviewReport;
    sequence: number;
}
/**
 * 同一工作区的共享检查状态：去重、基线、财务缓存和并发占位都在这里。
 * 插件按工作区只建一份，各会话的 ReviewFlow 引用同一个对象，
 * 这样“另一个会话刚检查过”的记录能在本进程内立刻生效，不必等重载。
 */
export interface FlowState {
    /** 已取得的结论按指纹保存；同一报送再次申请时在这里被拦下。 */
    readonly completed: Map<string, ReviewReport>;
    /** 正在检查的指纹；并发申请共用一份，避免同一成果被并行检查两次。 */
    readonly running: Set<string>;
    /** 按 kind/target 保存最近有效报告的基线，供财务判断范围。 */
    readonly baselines: Map<string, Baseline>;
    /** 按财务输入指纹缓存判断，材料或基线变化后自然失效。 */
    readonly financeCache: Map<string, FinanceReport>;
    /** 申请顺序号；晚返回的旧申请不能覆盖较新的基线。 */
    sequence: number;
}
/**
 * 新建空的共享状态；每个工作区第一次加载记忆时创建一次。
 * @returns 供各会话共用、尚未填充历史的状态。
 */
export declare function createFlowState(): FlowState;
/**
 * 用持久化记忆填充共享状态；只在该工作区首次加载时调用一次。
 * 记录按“报送开始时间”重放：完成顺序可能乱序，旧版本不能因为晚落盘而变成最新基线。
 * @param state 待填充的共享状态。
 * @param memory 从磁盘读到的历史记录；没有历史时什么也不做。
 */
export declare function seedFlowState(state: FlowState, memory: FlowMemory): void;
/** 单个会话的内存缓存，插件重载后清空；持久结果由 DSH 工具日志保存。 */
export declare class ReviewFlow {
    private readonly state;
    /** 适配层提供的持久化回调；没有它时本实例只保存在内存。 */
    private readonly record;
    /** 本实例所属会话的模型标识，随记录落盘；共享状态不保存它，避免会话之间互相覆盖。 */
    private readonly model;
    /**
     * @param memory 历史记录与写入回调；测试与无记忆场景可省略。
     * @param state 已有的共享状态；传入时直接沿用，不再重放 memory，避免重复填充。
     *   不传时新建一份并用 memory 填充，保持单会话调用方式不变。
     */
    constructor(memory?: FlowMemory, state?: FlowState);
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

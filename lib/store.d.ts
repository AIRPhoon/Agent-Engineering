import { type FinanceReport } from './finance.ts';
import { type ReviewReport } from './review.ts';
/** 一次已完成的成果检查；fp 与运行时指纹一致，files 是 [工作区路径, 内容哈希]。 */
export interface ReviewRecord {
    type: 'review';
    v: 1;
    /** 成果指纹：kind/目标/约定/材料/文件哈希的 SHA-256。 */
    fp: string;
    /** JSON.stringify([kind, target])，用于定位同一检查对象。 */
    scope: string;
    kind: 'function' | 'module';
    target: string;
    verdict: ReviewReport['verdict'];
    /** 文字材料哈希，供财务判断“材料是否变化”。 */
    details: string;
    files: Array<[string, string]>;
    report: ReviewReport;
    model: string | null;
    /** 报送开始时间（ISO），热启动按它重放，避免乱序完成把旧版本当成最新基线。 */
    startedAt: string;
    at: string;
}
/** 一次按需财务判断；key 是运行时缓存键，材料或基线变化后自然失效。 */
export interface FinanceRecord {
    type: 'finance';
    v: 1;
    key: string;
    decision: FinanceReport['decision'];
    report: FinanceReport;
    model: string | null;
    at: string;
}
export type MemoryRecord = ReviewRecord | FinanceRecord;
/** 当前工作区的记忆句柄；append 失败只降级为警告，不改变检查结论。 */
export interface ProjectMemory {
    readonly reviews: ReviewRecord[];
    readonly finance: FinanceRecord[];
    degraded: string | null;
    append(record: MemoryRecord): Promise<void>;
}
/** 可注入时钟与预算，便于测试遗忘策略；不传时使用真实时间与默认值。 */
export interface StoreOptions {
    home?: string;
    now?: () => Date;
    ttlMs?: number;
    maxProjects?: number;
    maxBytes?: number;
    maxProjectBytes?: number;
    pruneIntervalMs?: number;
    /** 删除项目目录的实现；测试可注入失败以验证“删不掉就保留索引”。 */
    remove?: (path: string) => Promise<void>;
}
/** 宿主侧的记忆服务：加载当前项目、写入记录、按 TTL 与预算遗忘不活跃项目。 */
export declare class ReviewStore {
    private readonly base;
    private readonly now;
    private readonly ttlMs;
    private readonly maxProjects;
    private readonly maxBytes;
    private readonly maxProjectBytes;
    private readonly pruneIntervalMs;
    private readonly remove;
    /** 进程内所有记忆写操作共用一个队列：追加、压缩、摘要、索引与遗忘不会交错。 */
    private queue;
    /** @param options 测试可注入 home、时钟和预算；生产使用 DSH_HOME 与默认值。 */
    constructor(options?: StoreOptions);
    /**
     * 加载一个工作区的记忆；首次访问会登记项目并顺带执行节流后的遗忘。
     * @param workspace 当前会话工作目录（绝对路径）。
     * @returns 历史记录与写入句柄；目录不可写时返回 degraded，不抛错阻断检查。
     */
    load(workspace: string): Promise<ProjectMemory>;
    /** 串行执行记忆写操作；单个任务失败不会让后续写永远被拒绝。 */
    private enqueue;
    /** 追加记录并完成压缩、摘要与索引更新；全部在同一条队列内。 */
    appendRecord(dir: string, key: string, workspace: string, record: MemoryRecord): Promise<void>;
    /** 直接更新索引；调用方已持有写队列。 */
    private touchDirect;
    /** 读取索引；缺失或版本不符时从空索引开始，不迁移旧格式。 */
    private readIndex;
    /** 原子写入索引，目录不存在时先创建。 */
    private writeIndex;
    /** 遗忘节流：默认每 6 小时检查一次；调用方已持有写队列。 */
    private pruneThrottledDirect;
    /**
     * 遗忘不活跃项目：先按 TTL，再按项目数/总字节预算淘汰最久未用的项目。
     * 当前项目永不淘汰；被清项目写一行 prune.log。调用方已持有写队列，
     * 因此这里的删目录不会与本进程的追加/压缩并发。
     * @param currentKey 当前正在使用的项目，必须保留。
     */
    private pruneDirect;
}

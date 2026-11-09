/** 财务前置与检查状态；程序作确定性判断，必要时经适配层唤醒财务 subagent，不执行成果代码。 */
import { createHash } from 'node:crypto';
import { parseReport } from './review.js';
import { parseFinanceReport } from './finance.js';
/**
 * 新建空的共享状态；每个工作区第一次加载记忆时创建一次。
 * @returns 供各会话共用、尚未填充历史的状态。
 */
export function createFlowState() {
    return {
        completed: new Map(), running: new Set(), baselines: new Map(), financeCache: new Map(), sequence: 0,
    };
}
/**
 * 用持久化记忆填充共享状态；只在该工作区首次加载时调用一次。
 * 记录按“报送开始时间”重放：完成顺序可能乱序，旧版本不能因为晚落盘而变成最新基线。
 * @param state 待填充的共享状态。
 * @param memory 从磁盘读到的历史记录；没有历史时什么也不做。
 */
export function seedFlowState(state, memory) {
    const ordered = [...(memory.reviews ?? [])].sort((left, right) => (left.startedAt ?? '').localeCompare(right.startedAt ?? '') || (left.at ?? '').localeCompare(right.at ?? ''));
    for (const review of ordered) {
        // 证据不足的报告可以重查，不进入去重命中集，但仍留作“尚未通过”的基线依据。
        if (review.verdict !== 'inconclusive')
            state.completed.set(review.fp, structuredClone(review.report));
        state.baselines.set(review.scope, {
            details: review.details, files: new Map(review.files), fingerprint: review.fp,
            verdict: review.verdict, report: structuredClone(review.report), sequence: ++state.sequence,
        });
    }
    for (const finance of memory.finance ?? [])
        state.financeCache.set(finance.key, structuredClone(finance.report));
}
/** 对固定字段序列取 SHA-256，供 run 的去重与报送约定比较复用。 */
function hash(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
/**
 * run 在任何异步检查前调用，保存本次报送身份。
 * @param request 目标、约定和补充材料；这些内容变化时不沿用旧的缩小范围建议。
 * @param evidence 插件已读取的真实文件，仅取路径和哈希。
 * @returns 独立快照；文件按路径排序，使交换报送顺序不会绕过去重。
 */
function snapshot(request, evidence) {
    return {
        details: hash([request.goal, request.contract, request.code, request.context, request.evidence]),
        files: new Map(evidence.map(file => [file.path, file.sha256])
            .sort(([left], [right]) => left.localeCompare(right))),
    };
}
/**
 * run 在启动检查器之前调用；只比较同一会话、同一 kind/target 的报送。
 * @param current 本次真实文件与文字材料的身份。
 * @param previous 上次有效报告对应的快照；没有记录时为 undefined。
 * @returns 完整检查或缩小复查重点的建议。文件未变不是接口不受影响的证明，因此不裁掉文件。
 */
function assessScope(current, previous) {
    const advice = {
        decision: 'allow', reason: '没有同一检查对象的历史报告，按原目标检查。',
        baselineFingerprint: previous?.fingerprint ?? null, previousVerdict: previous?.verdict ?? null, changes: null,
    };
    if (previous === undefined)
        return advice;
    if (previous.files.size === 0 || current.files.size === 0) {
        return { ...advice, reason: '缺少可比较的两批真实文件，按原目标检查。' };
    }
    const changes = { added: [], changed: [], omitted: [], unchanged: [] };
    for (const [path, sha256] of current.files) {
        if (!previous.files.has(path))
            changes.added.push(path);
        else if (previous.files.get(path) !== sha256)
            changes.changed.push(path);
        else
            changes.unchanged.push(path);
    }
    changes.omitted = [...previous.files.keys()].filter(path => !current.files.has(path));
    advice.changes = changes;
    if (previous.verdict !== 'pass')
        return { ...advice, reason: '上次尚未通过，不能仅按文件变化缩小检查；仍须处理未解决问题或补证。' };
    if (current.details !== previous.details)
        return { ...advice, reason: '目标、约定或补充材料发生变化，按原目标检查。' };
    if (changes.added.length > 0 || changes.omitted.length > 0) {
        return { ...advice, reason: '报送文件集合变化，不能推断省略文件已删除或不受影响，按原目标核对上下文。' };
    }
    if (changes.changed.length > 0 && changes.unchanged.length > 0) {
        return {
            ...advice, decision: 'suggest-narrowing',
            reason: '上次已通过且仅部分报送文件变化；建议聚焦改动及其对原目标、接口和调用方的影响，未变文件仍保留为上下文。',
        };
    }
    return { ...advice, reason: '没有可安全缩小的文件范围，按原目标检查。' };
}
/**
 * run 在精确去重之后调用；决定本次是否值得额外调用一次财务模型。
 * 首次检查及同材料下全部文件变化直接审查；已有通过记录后的局部/范围/文字变化才需要语义取舍。
 * 上次未通过时优先解决已有问题，不自动增加财务调用；报送方仍可明确提出 financeQuestion。
 */
function financeTrigger(request, current, previous, program) {
    if (request.financeQuestion !== undefined)
        return 'requested';
    if (previous === undefined || previous.verdict !== 'pass')
        return null;
    if (program.decision === 'suggest-narrowing')
        return 'partial-change';
    if (current.details !== previous.details)
        return 'material-change';
    if (program.changes !== null && (program.changes.added.length > 0 || program.changes.omitted.length > 0))
        return 'scope-change';
    return null;
}
/** 单个会话的内存缓存，插件重载后清空；持久结果由 DSH 工具日志保存。 */
export class ReviewFlow {
    // 去重、基线、财务缓存与并发占位放在共享状态里，同一工作区的多个会话看到同一份。
    state;
    /** 适配层提供的持久化回调；没有它时本实例只保存在内存。 */
    record;
    /** 本实例所属会话的模型标识，随记录落盘；共享状态不保存它，避免会话之间互相覆盖。 */
    model;
    /**
     * @param memory 历史记录与写入回调；测试与无记忆场景可省略。
     * @param state 已有的共享状态；传入时直接沿用，不再重放 memory，避免重复填充。
     *   不传时新建一份并用 memory 填充，保持单会话调用方式不变。
     */
    constructor(memory = {}, state) {
        if (state === undefined) {
            this.state = createFlowState();
            seedFlowState(this.state, memory);
        }
        else {
            this.state = state;
        }
        this.record = memory.record;
        this.model = memory.model ?? null;
    }
    /**
     * 写记忆是建议性缓存：失败不改变检查结论，也不阻断返回。
     * @param entry 已通过校验、准备持久化的审查或财务记录。
     */
    async write(entry) {
        try {
            await this.record?.(entry);
        }
        catch {
            // 记忆写失败只影响下次热启动，不能让已完成的检查变成失败。
        }
    }
    /**
     * quality_review 工具调用；申请、财务判断与启动检查在同一调用内，无法绕开前置判断。
     * @param request 包含目标、调用关系、验证证据和成果来源的规范请求。
     * @param evidence 已读取的真实文件；空数组表示本次只依据粘贴文本。
     * @param review 获准后才会调用的审计或监理。
     * @param signal 工具调用的取消信号，向下传给实际检查器。
     * @param financier 适配层注册的财务回调；确定性分支不会调用，需要语义判断却缺回调时直接报错。
     * @returns 驳回记录，或经校验的检查结果及意见接收方。
     */
    async run(request, evidence, review, signal, financier) {
        signal.throwIfAborted();
        // 报送开始时间随记录落盘，重启后按它而不是完成顺序恢复基线。
        const startedAt = new Date().toISOString();
        const current = snapshot(request, evidence);
        const scope = JSON.stringify([request.kind, request.target]);
        const baseline = this.state.baselines.get(scope);
        let finance = assessScope(current, baseline);
        // 给出真实文件时，文件哈希就是成果身份，
        // 粘贴文本不再参与指纹：同一批文件内容没变就是重复申请，文件一改指纹自然变化。
        const fingerprint = hash([
            request.kind, request.target, request.goal, request.contract, request.context, request.evidence,
            evidence.length === 0 ? request.code : '',
            [...current.files],
        ]);
        const previous = this.state.completed.get(fingerprint);
        if (previous !== undefined)
            return {
                status: 'blocked', fingerprint, reason: 'duplicate', previous: structuredClone(previous),
                finance: { decision: 'block', reason: '同一报送已有检查报告，本次不启动检查；保留上次结论，不表示新增通过。', baselineFingerprint: fingerprint, previousVerdict: previous.verdict, changes: null },
            };
        if (this.state.running.has(fingerprint))
            return {
                status: 'blocked', fingerprint, reason: 'in-progress', previous: null,
                finance: { decision: 'block', reason: '同一报送正在检查，仅阻止本次重复调用。', baselineFingerprint: fingerprint, previousVerdict: null, changes: null },
            };
        // 在首个 await 之前占位，同一进程内并发申请也只启动一次检查。
        this.state.running.add(fingerprint);
        const sequence = ++this.state.sequence;
        try {
            const trigger = financeTrigger(request, current, baseline, finance);
            if (trigger !== null) {
                // 缓存身份覆盖实际发给财务的文字、真实文件、历史报告和程序判断；不是强制重试开关。
                const input = { request: structuredClone(request), files: structuredClone(evidence),
                    program: structuredClone(finance), previousReport: baseline === undefined ? null : structuredClone(baseline.report), trigger };
                const cacheKey = hash([fingerprint, current.details, request.financeQuestion ?? null, finance, input.previousReport, trigger]);
                let report = this.state.financeCache.get(cacheKey);
                const cached = report !== undefined;
                if (report === undefined) {
                    if (financier === undefined)
                        throw new Error('Semantic finance is required for this request.');
                    const result = await financier(structuredClone(input), signal);
                    signal.throwIfAborted();
                    report = parseFinanceReport(result, input);
                    this.state.financeCache.set(cacheKey, structuredClone(report));
                    await this.write({
                        type: 'finance', v: 1, key: cacheKey, decision: report.decision,
                        report: structuredClone(report), model: this.model, at: new Date().toISOString(),
                    });
                }
                // 缓存和回调都不持有返回给调用方的可变对象。
                const semantic = { trigger, cached, report: structuredClone(report) };
                finance = { ...finance, decision: report.decision === 'narrow' ? 'suggest-narrowing' : report.decision, reason: report.summary, semantic };
                if (report.decision !== 'allow') {
                    const reason = report.decision === 'narrow' ? 'scope-revision' : report.decision === 'block' ? 'finance' : 'needs-information';
                    return { status: 'blocked', fingerprint, reason, previous: null, finance };
                }
            }
            const report = parseReport(await review(request, signal, structuredClone(finance)), request.kind);
            signal.throwIfAborted();
            // 证据不足可以重新检查；失败、取消及格式错误也不写成已通过或已完成。
            if (report.verdict !== 'inconclusive')
                this.state.completed.set(fingerprint, structuredClone(report));
            // 晚返回的旧申请不能覆盖较新申请的比较基线；inconclusive 可留作“尚未通过”的依据，仍允许重试。
            if (sequence > (this.state.baselines.get(scope)?.sequence ?? 0)) {
                this.state.baselines.set(scope, { ...current, fingerprint, verdict: report.verdict, report: structuredClone(report), sequence });
            }
            // 热启动时按文件顺序重放这些记录；同一对象后出现的记录覆盖先前的基线。
            await this.write({
                type: 'review', v: 1, fp: fingerprint, scope, kind: request.kind, target: request.target,
                verdict: report.verdict, details: current.details, files: [...current.files],
                report: structuredClone(report), model: this.model, startedAt, at: new Date().toISOString(),
            });
            return { status: 'reviewed', fingerprint, recipient: request.kind === 'function' ? 'executor' : 'planner', report, finance };
        }
        finally {
            this.state.running.delete(fingerprint);
        }
    }
}
//# sourceMappingURL=workflow.js.map
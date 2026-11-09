/** 按主会话存储本次插件激活期间的计量记录。 */
export class UsageLedger {
    sessions = new Map();
    /**
     * llm/stream 在单次请求结束或异常退出时调用，最后一条 usage 是该请求的权威快照。
     * @param sessionId 所属主会话，不把检查子会话分散到另一个总账。
     * @param role 主执行、审计或监理。
     * @param usage 提供方用量；没有报告时显式传 null。
     */
    record(sessionId, role, usage) {
        const entries = this.sessions.get(sessionId) ?? [];
        entries.push({ role, usage: usage === null ? null : { ...usage } });
        this.sessions.set(sessionId, entries);
    }
    /**
     * quality_usage 调用；只返回数值摘要，不把历史代码或全部请求重复发给模型。
     * @param sessionId 主会话标识。
     * @returns 各角色调用数、已知计数和缺失情况；null 缓存字段表示提供方未报告。
     */
    summary(sessionId) {
        const entries = this.sessions.get(sessionId) ?? [];
        return ['main', 'audit', 'supervisor', 'finance'].map(role => {
            const rows = entries.filter(row => row.role === role);
            const known = rows.flatMap(row => row.usage === null ? [] : [row.usage]);
            const total = (key) => known.length === 0 || known.some(usage => usage[key] === undefined)
                ? null : known.reduce((sum, usage) => sum + usage[key], 0);
            return {
                role, calls: rows.length, missingUsage: rows.length - known.length,
                // 上游全零计数可能是兼容层占位；保留原值，同时显式标记，不能当作零消耗证明。
                reportedZeroCalls: known.filter(usage => usage.inputTokens === 0 && usage.outputTokens === 0 && usage.totalTokens === 0).length,
                inputTokens: total('inputTokens'), outputTokens: total('outputTokens'),
                cacheReadTokens: total('cacheReadTokens'), cacheWriteTokens: total('cacheWriteTokens'),
                totalTokens: total('totalTokens'),
            };
        });
    }
}
//# sourceMappingURL=usage.js.map
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
/** Cordis 注册名与所需服务；缺少服务时由框架保持插件未激活。 */
export declare const name = "quality-control";
export declare const inject: string[];
/** 显式部署选项；模型沿用父 Agent，仅核对是否符合主人指定的选择。 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    provider: z<string, string, "defined">;
    expectedModel: z<string, string, "defined">;
    promptOrder: z<number, number, "defined">;
    reviewGate: z<boolean, boolean, "defined">;
    strictModel: z<boolean, boolean, "defined">;
    plainLanguage: z<boolean, boolean, "defined">;
    styleSample: z<string, string, "defined">;
    glossary: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    provider: z<string, string, "defined">;
    expectedModel: z<string, string, "defined">;
    promptOrder: z<number, number, "defined">;
    reviewGate: z<boolean, boolean, "defined">;
    strictModel: z<boolean, boolean, "defined">;
    plainLanguage: z<boolean, boolean, "defined">;
    styleSample: z<string, string, "defined">;
    glossary: z<string, string, "defined">;
}>>, "plain">;
/** 插件激活时经 Config 验证的配置，不接收模型临时改写。 */
interface PluginConfig {
    provider: string;
    expectedModel: string;
    promptOrder: number;
    reviewGate: boolean;
    strictModel: boolean;
    plainLanguage: boolean;
    styleSample: string;
    glossary: string;
}
/**
 * Cordis 加载 bundle 时调用。注册的副作用均归当前插件所有，卸载时由框架释放。
 * @param ctx DSH 的服务与事件上下文。
 * @param config 已验证的 spawn 提供方、目标模型标识和门禁选项。
 */
export declare function apply(ctx: Context, config: PluginConfig): void;
export {};

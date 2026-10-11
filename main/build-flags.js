/* 池子魔将 · 构建标识
 *
 * 【只有一个常驻版本：基础版】
 *   · 静态立绘（image/*.webp / *.jpg），不带任何动皮资源；
 *   · 没有 image/dynamic（Spine 骨骼皮），也没有 image/dyimg（动画 WebP 立绘）。
 *
 * 历史（已废弃，别再恢复）：
 *   曾经按 dynamic 分三档分发——基础版 false / 轻量动皮版 "lite" / 动皮版 true，
 *   由 tools/pack-flavors.mjs 改这里的开关并裁掉另一种资源目录。
 *   打包脚本与本文件里的分档 getter 都已删除。
 *
 * ⚠ 本文件**不是开关**，只是给设置界面 / 日志读的版本标识：
 *   不要再写 `if (CSH_BUILD.xxx)` 这类分档分支，也不要再补分档打包脚本。
 */
export const CSH_BUILD = {
	/** 恒定 false：不使用动皮（Spine 骨骼 / 动画 WebP），只用静态立绘 */
	dynamic: false,
	/** 版本标识，用于设置界面与日志显示 */
	flavor: "基础版",
};

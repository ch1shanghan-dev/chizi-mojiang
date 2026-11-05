/**
 * U4 · 在线更新读取上限（2026-11-05）
 *
 * 真源在 core/csh_online.js 的 external().consume()：
 *   · .arrayBuffer() → 16 MiB，逐文件下载器 startUpdate.fetchFile 走这条；
 *   · .text()/.json() → 512 KiB，cshFetchText 拉 catalog.js / info.json 走这条。
 * 这里把上限做成发布预检的共享常量，避免「发布时才不检查、玩家下载到一半才报错」。
 * tools/check.js 会校验这里的数字与 csh_online.js 一致。
 */
export const TEXT_LIMIT = 512 * 1024;
export const FILE_LIMIT = 16 * 1024 * 1024;

export const REMEDY =
	"请把素材分块、改走完整安装包，或同步提高 core/csh_online.js 的读取上限并验证宿主能力后再发布；" +
	"不能在玩家下载途中才发现已知不支持。";

/** 仅用于说明文件类型；下载器统一按 arrayBuffer 消费，所以上限一律 FILE_LIMIT。 */
export function classify(rel) {
	return /\.(png|jpe?g|gif|webp|mp3|mp4|ogg|wav|woff2?|ttf|otf|exe|dll)$/i.test(rel) ? "binary" : "text";
}

/**
 * @param {{path:string,size:number}[]} entries 按发布字节统计的文件清单
 * @returns {{ok:boolean,violations:Array,maxFileBytes:number,fileCount:number}}
 */
export function checkLimits(entries) {
	const violations = [];
	let maxFileBytes = 0;
	for (const item of entries) {
		const size = Number(item && item.size);
		const path = String((item && item.path) || "?");
		if (!Number.isSafeInteger(size) || size < 0) {
			violations.push({ path, size, limit: FILE_LIMIT, reason: "文件大小无法核对" });
			continue;
		}
		if (size > maxFileBytes) maxFileBytes = size;
		if (size > FILE_LIMIT) violations.push({ path, size, limit: FILE_LIMIT, kind: classify(path) });
	}
	return { ok: violations.length === 0, violations, maxFileBytes, fileCount: entries.length };
}

/** 写进 catalog.js，让客户端能在开始下载前判断自己是否支持这次更新。 */
export function limitsBlock(entries) {
	let maxFileBytes = 0;
	for (const item of entries) {
		const size = Number(item && item.size);
		if (Number.isSafeInteger(size) && size > maxFileBytes) maxFileBytes = size;
	}
	return { textBytes: TEXT_LIMIT, fileBytes: FILE_LIMIT, maxFileBytes };
}

import { lib, game } from "../../noname.js";
import { cshRecoveryPending, cshProtectedPackage, cshRecoverAtStartup } from "./core/csh_startup_recovery.js";

export const type = "extension";
const metadata = {
    intro: "<font color=#c9a84c>版本</font> <font color=#00FFFF>4.0.16</font>",
    author: "池上寒",
    diskURL: "",
    forumURL: "",
    version: "4.0.16"
};
let protectedUntilRestart = false;

export default async function(){
    /* 恢复完成后仍保持本次启动隔离，重启才载入完整的一代业务文件。 */
    if (protectedUntilRestart || cshRecoveryPending()) {
        if (!protectedUntilRestart) {
            protectedUntilRestart = true;
            void cshRecoverAtStartup({ lib, game });
        }
        return cshProtectedPackage({ package: metadata });
    }
    const { createPackage } = await import("./main/extension-package.js");
    return createPackage(metadata);
}


import fs from "fs";
import extra1 from "./csh_interact_lines.js";
import extra2 from "./csh_interact_lines_gen.js";
const src = fs.readFileSync("./csh_interact.js", "utf8");

function grab(startMark, endMark) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a);
  if (a < 0 || b < 0) throw new Error("grab fail: " + startMark);
  return src.slice(a, b);
}
// LINES 块：从 var LINES 到鞋组合生成器 IIFE 结束
const linesBlock = grab("var LINES = {", "\t})();") + "\t})();";
const trashBlock = grab("var TRASH = {", "\t};") + "\t};";
const emoBlock = grab("var EMO_LINES = {", "\t};") + "\t};";
const personaBlock = grab("var PERSONA_LINES = {", "\t};") + "\t};";

const out = { lines: {}, trash: {}, emo: {}, persona: {} };
out.lines = eval("(function(){" + linesBlock + "; return LINES;})()");
out.trash = eval("(function(){" + trashBlock + "; return TRASH;})()");
out.emo   = eval("(function(){" + emoBlock + "; return EMO_LINES;})()");
out.persona = eval("(function(){" + personaBlock + "; return PERSONA_LINES;})()");
out.extra1 = extra1; out.extra2 = extra2;
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log("dumped");

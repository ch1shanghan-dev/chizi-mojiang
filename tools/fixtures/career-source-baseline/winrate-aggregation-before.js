			var d = lib.config["extension_池子魔将_winrateData"];
			if (d && typeof d === "object") {
				var chars = {};
				for (var m in d) {
					if (!Object.prototype.hasOwnProperty.call(d, m)) continue;
					if (m === "camps" || m === "me") continue;
					var md = d[m];
					if (!md || typeof md !== "object" || Array.isArray(md)) continue;
					var hasMode = false;
					for (var n in md) {
						if (!Object.prototype.hasOwnProperty.call(md, n)) continue;
						var e2 = md[n];
						if (!e2 || typeof e2 !== "object") continue;
						if (!e2.games) continue;
						s.wrGames += e2.games || 0; s.wrWin += e2.win || 0; s.wrLose += e2.lose || 0;
						s.wrKill += e2.kill || 0;
						chars[n] = 1; hasMode = true;
					}
					if (hasMode) s.wrModes++;
				}
				s.wrChars = 0;
				for (var c in chars) if (Object.prototype.hasOwnProperty.call(chars, c)) s.wrChars++;
			}
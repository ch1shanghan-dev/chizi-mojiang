#!/usr/bin/perl
# 临时审计脚本 v2：提取扩展内全部 marktext，经 group/derivation/subSkill/addSkills
# 关系链传播武将归属（与 csh_debug 技能来源反查同思路），按武将分组输出。用后可删。
use strict; use warnings;
use utf8; binmode STDOUT, ":utf8";
use open IO => ':utf8';

my (%charname, %sk2chars, %skname);

# ---------- pass 1: character/index.js ----------
{
    open my $fh, '<', "character/index.js" or die $!;
    my $c = do { local $/; <$fh> }; close $fh;
    while ($c =~ /"(csh_[A-Za-z_0-9]+)":\s*\{([^{]*?)skills:\s*\[([^\]]*)\]/gs) {
        my ($id, $sklist) = ($1, $3);
        my @sk = $sklist =~ /"([A-Za-z_0-9]+)"/g;
        push @{$sk2chars{$_}}, $id for @sk;
    }
    while ($c =~ /^\s+"([A-Za-z_0-9]+)":\s*"([\p{Han}]{1,8})",\s*$/mg) { $charname{$1} = $2; }
}

# ---------- pass 2: skills/index.js 关系边 + 技能名 ----------
my @edges;   # [member, containerRoot]
{
    open my $fh, '<', "skills/index.js" or die $!;
    my @lines = <$fh>; close $fh; chomp @lines;
    my ($top_id, $last_ind) = ("", -1);
    for my $raw (@lines) {
        if ($raw =~ /^(\s*)"([A-Za-z_][A-Za-z_0-9]*)":\s*\{\s*$/) {
            my ($ind, $id) = (length $1, $2);
            if ($ind <= 12) { $top_id = $id; $last_ind = $ind; }
            elsif ($ind > $last_ind) { $last_ind = $ind; }
            next;
        }
        # 技能中文名（translate 段：短值、无 HTML、非 _info）
        if ($raw =~ /^\s+"(csh_[A-Za-z_0-9]+)":\s*"([^"<>]{1,10})",\s*$/) {
            $skname{$1} = $2 unless $1 =~ /_info$/ || exists $skname{$1};
            next;
        }
        # group: [...] / group: "x"  → 成员归属容器
        if ($raw =~ /\bgroup:\s*(?:\[([^\]]*)\]|"([A-Za-z_0-9]+)")/) {
            my @m = $1 ? $1 =~ /"([A-Za-z_0-9]+)"/g : ($2);
            push @edges, map { [$_, $top_id] } @m;
            next;
        }
        # derivation: "x" / [...] → 衍生技归属容器
        if ($raw =~ /\bderivation:\s*(?:\[([^\]]*)\]|"([A-Za-z_0-9]+)")/) {
            my @m = $1 ? $1 =~ /"([A-Za-z_0-9]+)"/g : ($2);
            push @edges, map { [$_, $top_id] } @m;
            next;
        }
        # addSkills([...]) / addSkill("x") / addTempSkill("x") → 归属容器
        while ($raw =~ /\badd(?:Temp)?Skills?\(\s*(?:\[([^\]]*)\]|"([A-Za-z_0-9]+)")/g) {
            my @m = $1 ? $1 =~ /"([A-Za-z_0-9]+)"/g : ($2);
            push @edges, map { [$_, $top_id] } @m;
        }
    }
}

# ---------- 归属解析：沿边向上找第一个有主的技能 ----------
my %owner;   # root skill -> char id
my %OVERRIDE = (   # 关系链查不到的手工归属（char id）
    "csh_fangyuan_niliu_state" => "csh_daaixianzun",   # 逆流护体：大爱仙尊 csh_fangyuan_hengshou 衍生
    "csh_yunming_pact"         => "csh_diaochan",      # 死斗：貂蝉 连环系（待用户确认）
    "_csh_theshy_chang"        => "csh_theshy",        # 长短：姜大哥（theshy 前缀）
    "csh_pifeng_skill"         => "csh_kuisangti",     # 锋芒：奎桑提 驼甲/辟锋 衍生装
    "csh_kui"                  => "csh_kuisangti",     # 奎宿：奎桑提（奎 前缀 + 同 kit 区段）
    "csh_xinmo"                => "csh_mingrixiang",   # 心魔：明日香（区块头明示）
    "csh_lichang"              => "csh_mingrixiang",   # 力场：明日香
    "csh_langqiang"            => "csh_mingrixiang",   # 朗枪：明日香
    "csh_renjie"               => "csh_msmy",          # 忍戒：司马懿（与忍神同 kit）
);
sub owner_of {
    my ($s, $seen) = @_;
    return $OVERRIDE{$s} if $OVERRIDE{$s};
    return $sk2chars{$s}[0] if $sk2chars{$s};
    return undef if $seen->{$s}++;
    for my $e (@edges) {
        next unless $e->[0] eq $s;
        my $r = owner_of($e->[1], $seen);
        return $r if $r;
    }
    return undef;
}
for my $s (keys %sk2chars) { $owner{$s} = $sk2chars{$s}[0]; }

# ---------- pass 3: marktext 提取（缩进追踪） ----------
my @out;
my @files = ("skills/index.js", "character/index.js", "card/index.js", "main/content.js",
             "core/csh_cards.js", "core/csh_interact.js", "core/csh_debug.js");
for my $f (@files) {
    next unless -f $f;
    open my $fh, '<', $f or next;
    my @lines = <$fh>; close $fh; chomp @lines;
    my ($top_id, $sub_id, $last_ind) = ("", "", -1);
    for my $i (0 .. $#lines) {
        my $raw = $lines[$i];
        if ($raw =~ /^(\s*)"([A-Za-z_][A-Za-z_0-9]*)":\s*\{\s*$/) {
            my ($ind, $id) = (length $1, $2);
            if ($ind <= 12) { $top_id = $id; $sub_id = ""; $last_ind = $ind; }
            elsif ($ind > $last_ind) { $sub_id = $id; $last_ind = $ind; }
            next;
        }
        next unless $raw =~ /marktext:\s*"((?:[^"\\]|\\.)*)"/;
        my $own = $sub_id ne "" ? "${top_id}_$sub_id" : $top_id;
        push @out, [$f, $i + 1, $own, $top_id, $1];
    }
}

# ---------- 输出：按武将分组（直接归属在前，衍生归属标 ※） ----------
my %byowner; my %indirect;
for my $e (@out) {
    my ($f, $ln, $own, $root, $txt) = @$e;
    my $ch = $sk2chars{$root} ? $sk2chars{$root}[0] : owner_of($root, {});
    if (!$ch) { $ch = owner_of($own, {}); $indirect{"$f:$ln"} = 1 if $ch; }
    if (!$ch) {   # 前缀回退：逐级去掉 _xxx 后缀再查（如 csh_jiagiang_sha → csh_jiagiang）
        my @parts = split /_/, $own;
        while (!$ch && @parts > 1) { pop @parts; $ch = owner_of(join("_", @parts), {}); }
        $indirect{"$f:$ln"} = 1 if $ch;
    }
    my $owner = $ch ? ($charname{$ch} // $ch) : "？（未收录，看行号）";
    $txt =~ s/<[^>]*>//g;
    my $nm = $skname{$own} // $skname{$root} // "";
    push @{ $byowner{$owner} }, sprintf("%-26s %-24s %s", "$f:$ln", $nm ? "${own}[$nm]" : $own, "「" . ($txt eq "" ? "(空)" : $txt) . "」" . ($indirect{"$f:$ln"} ? " ※衍生" : ""));
}
for my $owner (sort { scalar(@{ $byowner{$b} }) <=> scalar(@{ $byowner{$a} }) } keys %byowner) {
    print "== $owner ==\n";
    for my $l (sort { $a cmp $b } @{ $byowner{$owner} }) { print "  $l\n"; }
}
print "\nTOTAL: " . scalar(@out) . " 条 marktext\n";

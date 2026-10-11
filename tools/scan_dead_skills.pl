#!/usr/bin/perl
# 死技能扫描：找出"有定义但零功能引用"的 csh 技能 id（用后可删）
use strict; use warnings;
use utf8; binmode STDOUT, ":utf8";
use open IO => ':utf8';

my %defs;      # id -> [文件:行]
my %funcref;   # id -> 引用描述
my %charlist;  # char def 里的 skills（功能引用）

# —— character/index.js：武将 skills 数组 = 最强引用 ——
{
    open my $fh, '<', "character/index.js" or die $!;
    my $c = do { local $/; <$fh> }; close $fh;
    while ($c =~ /"(csh_[A-Za-z_0-9]+)":\s*\{([^{]*?)skills:\s*\[([^\]]*)\]/gs) {
        my ($char, $sklist) = ($1, $3);
        for my $s ($sklist =~ /"([A-Za-z_0-9]+)"/g) {
            push @{ $charlist{$s} }, $char;
            $funcref{$s} .= " chardef($char)";
        }
    }
}

sub scan_file {
    my ($f) = @_;
    open my $fh, '<', $f or return;
    my @lines = <$fh>; close $fh; chomp @lines;
    for my $i (0 .. $#lines) {
        my $raw = $lines[$i];
        next unless $raw =~ /csh_[a-z_0-9]+/;
        # 定义行：自名键（"id": { 或 "id": "翻译"）
        my $selfnamed = ($raw =~ /^\s*"(csh_[a-z_0-9]+)"\s*:/);
        # skill_id / sourceSkill 自指行
        my $selfref = ($raw =~ /"(skill_id|sourceSkill)"\s*:/);
        while ($raw =~ /"(csh_[a-z_0-9]+)"/g) {
            my $id = $1;
            if ($selfnamed && $raw =~ /^\s*"$id"\s*:\s*[\{"]/) {
                push @{ $defs{$id} }, "$f:" . ($i + 1);
                next;
            }
            next if $selfref;
            $funcref{$id} .= " $f:" . ($i + 1);
        }
    }
}
scan_file("skills/index.js");
scan_file("card/index.js");
scan_file("main/content.js");
scan_file("main/precontent.js");
scan_file("core/csh_cards.js");
scan_file("core/csh_debug.js");

# —— 有定义、零功能引用 → 死候选 ——
my @dead;
for my $id (sort keys %defs) {
    push @dead, $id unless $funcref{$id};
}
print "== 死候选（有定义、无功能引用）: " . scalar(@dead) . " ==\n";
for my $id (@dead) {
    my @d = @{ $defs{$id} };
    print "$id  定义于 $d[0]" . (@d > 1 ? "（共" . scalar(@d) . "处）" : "") . "\n";
}

import React from "react";

/**
 * Minimal regex-based syntax highlighter for AArch64 clang-style Assembly.
 * Palette (no blue/indigo anywhere):
 *  - directives (.text, .cfi_* ...)  -> zinc-500
 *  - labels (foo:, .LC0:)            -> emerald-400
 *  - mnemonics (stp, mov, bl ...)    -> amber-300
 *  - registers (x29, sp, w0 ...)     -> zinc-400 italic
 *  - immediates (#-32, :lo12:)       -> rose-300
 *  - symbols / strings               -> zinc-300
 */

export interface AsmToken {
  text: string;
  cls: string;
}

const TOKEN_RE =
  /("[^"\n]*")|(#-?[0-9A-Za-z_]+)|(:[A-Za-z_]\w*:)|(@[A-Za-z_][\w.]*)|((?:[A-Za-z_.$][\w.$]*)?:)|([A-Za-z_.$][\w.$]*)|(\d+)|(\s+)|([\s\S])/g;

const REGISTER_RE =
  /^(x([0-9]|[12][0-9]|30)|w([0-9]|[12][0-9]|30)|sp|lr|fp|xzr|wzr|v[0-9]+|q[0-9]+|d[0-9]+|s[0-9]+)$/;

function classify(match: RegExpExecArray, isFirst: boolean): string {
  const token = match[0];
  if (match[1] !== undefined) return "text-zinc-300"; // string
  if (match[2] !== undefined) return "text-rose-300"; // immediate #...
  if (match[3] !== undefined) return "text-rose-300"; // reloc :lo12:
  if (match[4] !== undefined) return "text-zinc-500"; // @progbits style attribute
  if (match[5] !== undefined) return "text-emerald-400 font-medium"; // label
  if (match[6] !== undefined) {
    if (isFirst) {
      return token.startsWith(".")
        ? "text-zinc-500" // directive
        : "text-amber-300 font-semibold"; // mnemonic
    }
    if (token.startsWith(".")) return "text-zinc-500"; // dot-prefixed symbol operand
    if (REGISTER_RE.test(token)) return "text-zinc-400 italic"; // register
    return "text-zinc-300"; // plain symbol
  }
  if (match[7] !== undefined) return "text-rose-300"; // bare number
  if (match[8] !== undefined) return ""; // whitespace
  return "text-zinc-600"; // punctuation
}

export function tokenizeAsmLine(line: string): AsmToken[] {
  const tokens: AsmToken[] = [];
  let isFirst = true;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m[0].length === 0) {
      TOKEN_RE.lastIndex += 1;
      continue;
    }
    const cls = classify(m, isFirst);
    if (m[8] === undefined && isFirst) isFirst = false;
    tokens.push({ text: m[0], cls });
  }
  return tokens;
}

export function AsmHighlightedLine({
  line,
  className,
}: {
  line: string;
  className?: string;
}) {
  const tokens = tokenizeAsmLine(line);
  return (
    <span className={className}>
      {tokens.map((t, i) =>
        t.cls ? (
          <span key={i} className={t.cls}>
            {t.text}
          </span>
        ) : (
          <React.Fragment key={i}>{t.text}</React.Fragment>
        )
      )}
    </span>
  );
}

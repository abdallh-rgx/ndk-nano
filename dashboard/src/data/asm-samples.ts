export interface AsmSample {
  name: string;
  bytes: number;
  sha: string;
  note: string;
  text: string;
  minimizedText: string;
  removableLines: number[];
}

/**
 * PREVIEW samples (AArch64 clang-style asm).
 * These are clearly-labeled placeholders in the UI: once the real pipeline
 * completes on GitHub Actions, /api/pipeline serves manifest.asm_samples with
 * actual clang -Oz -S output and these previews are replaced.
 */
export const ASM_SAMPLES: AsmSample[] = [
  {
    name: "jni.h",
    bytes: 582,
    sha: "preview",
    note: "دالة JNI نموذجية تعيد سلسلة نصية من الكود الأصلي",
    text: `\t.text
\t.file\t"tu_jni.c"
\t.section\t.rodata.str1.1,"aMS",@progbits,1
.LC0:
\t.asciz\t"hello from ndk-nano"
\t.text
\t.globl\tJava_com_example_hellojni_HelloJNI_stringFromJNI
\t.p2align\t2
\t.type\tJava_com_example_hellojni_HelloJNI_stringFromJNI,@function
Java_com_example_hellojni_HelloJNI_stringFromJNI:
\t.cfi_startproc
\tstp\tx29, x30, [sp, #-32]!
\tmov\tx29, sp
\tmov\tx0, x0
\tadd\tx1, x1, #0
\tbl\t__android_log_print
\tadrp\tx0, .LC0
\tadd\tx0, x0, :lo12:.LC0
\tand\tx2, x2, #-1
\tbl\t(*JNIEnv*)NewStringUTF
\tldp\tx29, x30, [sp], #32
\tret
\t.cfi_endproc
\t.section\t.note.GNU-stack,"",@progbits`,
    minimizedText: `\t.text
\t.file\t"tu_jni.c"
\t.section\t.rodata.str1.1,"aMS",@progbits,1
.LC0:
\t.asciz\t"hello from ndk-nano"
\t.text
\t.globl\tJava_com_example_hellojni_HelloJNI_stringFromJNI
\t.p2align\t2
\t.type\tJava_com_example_hellojni_HelloJNI_stringFromJNI,@function
Java_com_example_hellojni_HelloJNI_stringFromJNI:
\t.cfi_startproc
\tstp\tx29, x30, [sp, #-32]!
\tmov\tx29, sp
\tbl\t__android_log_print
\tadrp\tx0, .LC0
\tadd\tx0, x0, :lo12:.LC0
\tbl\t(*JNIEnv*)NewStringUTF
\tldp\tx29, x30, [sp], #32
\tret
\t.cfi_endproc
\t.section\t.note.GNU-stack,"",@progbits`,
    removableLines: [13, 14, 18],
  },
  {
    name: "stdio.h",
    bytes: 421,
    sha: "preview",
    note: "تنسيق نص عبر snprintf — تعليمات زائدة حول الوسائط",
    text: `\t.text
\t.file\t"tu_stdio.c"
\t.globl\tgreet
\t.p2align\t2
\t.type\tgreet,@function
greet:
\t.cfi_startproc
\tstp\tx29, x30, [sp, #-48]!
\tmov\tx29, sp
\tmov\tx8, x8
\tadd\tx0, x0, #0
\tbl\tsnprintf
\tmov\tw0, #12
\tldp\tx29, x30, [sp], #48
\tret
\t.cfi_endproc
\t.section\t.note.GNU-stack,"",@progbits`,
    minimizedText: `\t.text
\t.file\t"tu_stdio.c"
\t.globl\tgreet
\t.p2align\t2
\t.type\tgreet,@function
greet:
\t.cfi_startproc
\tstp\tx29, x30, [sp, #-48]!
\tmov\tx29, sp
\tbl\tsnprintf
\tmov\tw0, #12
\tldp\tx29, x30, [sp], #48
\tret
\t.cfi_endproc
\t.section\t.note.GNU-stack,"",@progbits`,
    removableLines: [9, 10],
  },
  {
    name: "c++/v1/vector",
    bytes: 496,
    sha: "preview",
    note: "قالب STL نموذجي — push_back مع مسار الاستثناءات",
    text: `\t.text
\t.file\t"tu_vector.cpp"
\t.globl\t_Z5pushv
\t.p2align\t2
\t.type\t_Z5pushv,@function
_Z5pushv:
\t.cfi_startproc
\tstp\tx29, x30, [sp, #-48]!
\tmov\tx29, sp
\tadd\tx0, x0, #0
\tbl\t_Znwm
\tbl\t_ZNSt6vectorIiSaIiEE9push_backERKi
\tmov\tx1, x1
\tldp\tx29, x30, [sp], #48
\tret
.LBB2_2:
\tbl\t__cxa_begin_catch
\tbl\t__cxa_throw
\t.section\t.note.GNU-stack,"",@progbits`,
    minimizedText: `\t.text
\t.file\t"tu_vector.cpp"
\t.globl\t_Z5pushv
\t.p2align\t2
\t.type\t_Z5pushv,@function
_Z5pushv:
\t.cfi_startproc
\tstp\tx29, x30, [sp, #-48]!
\tmov\tx29, sp
\tbl\t_Znwm
\tbl\t_ZNSt6vectorIiSaIiEE9push_backERKi
\tldp\tx29, x30, [sp], #48
\tret
.LBB2_2:
\tbl\t__cxa_begin_catch
\tbl\t__cxa_throw
\t.section\t.note.GNU-stack,"",@progbits`,
    removableLines: [9, 12],
  },
];

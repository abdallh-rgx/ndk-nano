/* Fixture header log.h (mini-sysroot): mimics the android/log.h API surface
 * that the samples use (__android_log_print).
 */
#ifndef MINI_LOG_H
#define MINI_LOG_H

enum {
    MINI_LOG_INFO = 4,
    MINI_LOG_WARN = 5,
    MINI_LOG_ERROR = 6,
};

int __android_log_print(int prio, const char *tag, const char *fmt, ...);
int __android_log_write(int prio, const char *tag, const char *text);

#endif /* MINI_LOG_H */

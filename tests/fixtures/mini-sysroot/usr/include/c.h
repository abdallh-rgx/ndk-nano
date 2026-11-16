/* Fixture header c.h (mini-sysroot): includes <sys/types.h>, which does NOT
 * exist in the fixture. This deliberately exercises the unknown-include
 * tolerance of pipeline/03_manifest.py (the include relation is still
 * recorded; the missing target is simply ignored downstream).
 */
#ifndef MINI_C_H
#define MINI_C_H

#include <sys/types.h>

long mini_c_read(int fd, void *buf, unsigned long count);

#endif /* MINI_C_H */

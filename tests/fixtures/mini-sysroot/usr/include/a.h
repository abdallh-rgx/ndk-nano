/* Fixture header a.h (mini-sysroot): includes <b.h> and declares a struct
 * plus a function. Used by tests/run_tests.sh to exercise the include graph
 * built by pipeline/03_manifest.py.
 */
#ifndef MINI_A_H
#define MINI_A_H

#include <b.h>

struct mini_a {
    mini_size_t len;
    int magic;
};

int mini_a_init(struct mini_a *a, mini_size_t len);
void mini_a_free(struct mini_a *a);

#endif /* MINI_A_H */

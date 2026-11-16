/* mathlib sample: exported math helper.
 *
 * Exercises libm (sinf, powf) and string.h (strlen) so that the pipeline's
 * usage extraction records both libm and libc string link requirements.
 * The unit name and the exponent are selected from the runtime value of v,
 * which keeps all three calls alive through -O2 constant folding.
 */
#include <math.h>
#include <string.h>

float mathx_scale(float v)
{
    const char *unit = (v >= 0.0f) ? "mathx-scale" : "mathx";
    const float exponent = (v >= 0.0f) ? 3.0f : 2.0f;

    return powf(sinf(v), exponent) + (float) strlen(unit);
}

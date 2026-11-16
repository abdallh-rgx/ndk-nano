// hello-jni sample: C++ engine used by the JNI entry point.
//
// Exercises libc++ (std::vector<std::string> + push_back) and the C++
// exception machinery (throw + catch forces __cxa_* landing pads and the
// unwinder). The volatile gate keeps the throw alive at -O2: the optimizer
// is not allowed to fold the branch away.

#include <stdexcept>
#include <string>
#include <vector>

namespace {

// Never written; read below so the throw path survives optimization.
volatile int engine_gate = 0;

int word_total(const std::vector<std::string> &words)
{
    int total = 0;
    for (const std::string &w : words) {
        total += static_cast<int>(w.size());
    }
    return total;
}

}  // namespace

extern "C" int engine_run(void)
{
    std::vector<std::string> words;
    words.push_back("ndk");
    words.push_back("nano");

    const int total = word_total(words);

    try {
        if (engine_gate != 0) {
            throw std::runtime_error("engine gate is closed");
        }
    } catch (const std::runtime_error &err) {
        // The catch is the point: it forces EH landing pads (__cxa_begin_catch
        // / __cxa_end_catch) into the object file.
        (void) err;
        return total;
    }

    return total + static_cast<int>(words.size());
}

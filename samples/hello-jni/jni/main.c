/* hello-jni sample: the JNI entry point.
 *
 * Exercises: jni.h, android/log.h (__android_log_print), stdio.h (snprintf)
 * and the JNIEnv string factory - the classic Android native "hello world".
 */
#include <jni.h>
#include <stdio.h>
#include <android/log.h>

JNIEXPORT jstring JNICALL
Java_com_example_hellojni_HelloJNI_stringFromJNI(JNIEnv *env, jobject thiz)
{
    char buf[64];

    (void) thiz;

    snprintf(buf, sizeof(buf), "hello from ndk-nano %d", 42);
    __android_log_print(ANDROID_LOG_INFO, "hello-jni", "%s", buf);

    return (*env)->NewStringUTF(env, buf);
}

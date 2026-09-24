import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseSigning = mapOf(
    "storeFile" to System.getenv("BEZZO_UPLOAD_STORE_FILE"),
    "storePassword" to System.getenv("BEZZO_UPLOAD_STORE_PASSWORD"),
    "keyAlias" to System.getenv("BEZZO_UPLOAD_KEY_ALIAS"),
    "keyPassword" to System.getenv("BEZZO_UPLOAD_KEY_PASSWORD"),
)
val hasReleaseSigning = releaseSigning.values.all { !it.isNullOrBlank() }

android {
    namespace = "com.bezzo.bezzo_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.bezzo.bezzo_mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = maxOf(flutter.minSdkVersion, 23)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("bezzoRelease") {
                storeFile = file(requireNotNull(releaseSigning["storeFile"]))
                storePassword = requireNotNull(releaseSigning["storePassword"])
                keyAlias = requireNotNull(releaseSigning["keyAlias"])
                keyPassword = requireNotNull(releaseSigning["keyPassword"])
            }
        }
    }

    buildTypes {
        release {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("bezzoRelease")
            }
        }
    }
}

tasks.matching { it.name == "assembleRelease" || it.name == "bundleRelease" }
    .configureEach {
        doFirst {
            if (!hasReleaseSigning) {
                throw GradleException(
                    "Release signing is required. Set BEZZO_UPLOAD_STORE_FILE, " +
                        "BEZZO_UPLOAD_STORE_PASSWORD, BEZZO_UPLOAD_KEY_ALIAS, and " +
                        "BEZZO_UPLOAD_KEY_PASSWORD in the build environment.",
                )
            }
        }
    }

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

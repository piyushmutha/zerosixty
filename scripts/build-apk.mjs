// Builds the signed release APK with the portable toolchain in D:/Android-toolchain
// and copies it to dist/. Override the locations with JAVA_HOME / ANDROID_HOME.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const toolchain = 'D:/Android-toolchain';
const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || join(toolchain, 'jdk-21'),
  ANDROID_HOME: process.env.ANDROID_HOME || join(toolchain, 'sdk'),
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || join(toolchain, 'gradle'),
};
env.PATH = `${join(env.JAVA_HOME, 'bin')};${env.PATH}`;

const win = process.platform === 'win32';
const gradlew = join(process.cwd(), 'android', win ? 'gradlew.bat' : 'gradlew');
execFileSync(win ? 'cmd.exe' : gradlew, win ? ['/c', gradlew, 'assembleRelease', '--console=plain'] : ['assembleRelease', '--console=plain'], { cwd: 'android', env, stdio: 'inherit' });

const built = 'android/app/build/outputs/apk/release/app-release.apk';
if (!existsSync(built)) throw new Error('No signed APK was produced. Is android/keystore.properties present?');
mkdirSync('dist', { recursive: true });
cpSync(built, 'dist/ZeroSixty.apk');
console.log('APK ready: dist/ZeroSixty.apk');
